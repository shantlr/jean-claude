import { isAiSkillSlotsSetting } from '@shared/types';

import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewProject, ProjectRow, ProjectType, UpdateProject } from '../schema';

function parseProjectRow(row: ProjectRow) {
  let aiSkillSlots = null;
  if (row.aiSkillSlots) {
    try {
      const parsed: unknown = JSON.parse(row.aiSkillSlots);
      aiSkillSlots = isAiSkillSlotsSetting(parsed) ? parsed : null;
    } catch {
      // Malformed JSON — fall back to null
    }
  }
  return {
    ...row,
    aiSkillSlots,
  };
}

export const ProjectRepository = {
  findAll: async () => {
    const rows = await db
      .selectFrom('projects')
      .selectAll()
      .where('type', '!=', 'system')
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(parseProjectRow);
  },

  findById: async (id: string) => {
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? parseProjectRow(row) : undefined;
  },

  findByType: async (type: ProjectType) => {
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('type', '=', type)
      .executeTakeFirst();
    return row ? parseProjectRow(row) : undefined;
  },

  create: async (data: NewProject) => {
    dbg.db('projects.create name=%s, path=%s', data.name, data.path);
    // Get max sortOrder and add 1 for new project
    const result = await db
      .selectFrom('projects')
      .select(db.fn.max('sortOrder').as('maxOrder'))
      .executeTakeFirst();

    const nextSortOrder = ((result?.maxOrder as number | null) ?? -1) + 1;

    const { showWorkItemsInFeed, showPrsInFeed, aiSkillSlots, ...rest } = data;
    const row = await db
      .insertInto('projects')
      .values({
        ...rest,
        sortOrder: data.sortOrder ?? nextSortOrder,
        priority: data.priority ?? 'normal',
        showWorkItemsInFeed: showWorkItemsInFeed === false ? 0 : 1,
        showPrsInFeed: showPrsInFeed === false ? 0 : 1,
        aiSkillSlots: aiSkillSlots ? JSON.stringify(aiSkillSlots) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    dbg.db('projects.create created id=%s', row.id);
    return parseProjectRow(row);
  },

  update: async (id: string, data: UpdateProject) => {
    dbg.db('projects.update id=%s %o', id, Object.keys(data));
    const { showWorkItemsInFeed, showPrsInFeed, aiSkillSlots, ...rest } = data;
    const row = await db
      .updateTable('projects')
      .set({
        ...rest,
        ...(showWorkItemsInFeed !== undefined && {
          showWorkItemsInFeed: showWorkItemsInFeed ? 1 : 0,
        }),
        ...(showPrsInFeed !== undefined && {
          showPrsInFeed: showPrsInFeed ? 1 : 0,
        }),
        ...(aiSkillSlots !== undefined && {
          aiSkillSlots: aiSkillSlots ? JSON.stringify(aiSkillSlots) : null,
        }),
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseProjectRow(row);
  },

  delete: (id: string) => {
    dbg.db('projects.delete id=%s', id);
    return db.deleteFrom('projects').where('id', '=', id).execute();
  },

  reorder: async (orderedIds: string[]) => {
    dbg.db('projects.reorder %d projects', orderedIds.length);
    const now = new Date().toISOString();

    // Update each project's sortOrder based on position in array
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .updateTable('projects')
        .set({ sortOrder: i, updatedAt: now })
        .where('id', '=', orderedIds[i])
        .execute();
    }

    // Return all projects in new order (excluding system projects)
    const rows = await db
      .selectFrom('projects')
      .selectAll()
      .where('type', '!=', 'system')
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(parseProjectRow);
  },
};
