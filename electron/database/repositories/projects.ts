import { isAiSkillSlotsSetting } from '@shared/types';

import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewProject, ProjectRow, ProjectType, UpdateProject } from '../schema';

const MAX_PROTECTED_BRANCHES = 100;
const MAX_BRANCH_NAME_LENGTH = 256;

function sanitizeProtectedBranches(
  branches: string[] | undefined | null,
): string | null {
  if (!branches || branches.length === 0) return null;
  const sanitized = [
    ...new Set(
      branches.filter(
        (b) =>
          typeof b === 'string' &&
          b.length > 0 &&
          b.length <= MAX_BRANCH_NAME_LENGTH,
      ),
    ),
  ].slice(0, MAX_PROTECTED_BRANCHES);
  return sanitized.length > 0 ? JSON.stringify(sanitized) : null;
}

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
  let protectedBranches: string[] = [];
  if (row.protectedBranches) {
    try {
      const parsed: unknown = JSON.parse(row.protectedBranches);
      protectedBranches = Array.isArray(parsed)
        ? parsed.filter((b): b is string => typeof b === 'string')
        : [];
    } catch {
      // Malformed JSON — fall back to empty array
    }
  }
  return {
    ...row,
    aiSkillSlots,
    protectedBranches,
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

    const {
      showWorkItemsInFeed,
      showPrsInFeed,
      aiSkillSlots,
      protectedBranches,
      ...rest
    } = data;
    const row = await db
      .insertInto('projects')
      .values({
        ...rest,
        sortOrder: data.sortOrder ?? nextSortOrder,
        prPriority: data.prPriority ?? 'normal',
        workItemPriority: data.workItemPriority ?? 'normal',
        showWorkItemsInFeed: showWorkItemsInFeed === false ? 0 : 1,
        showPrsInFeed: showPrsInFeed === false ? 0 : 1,
        aiSkillSlots: aiSkillSlots ? JSON.stringify(aiSkillSlots) : null,
        protectedBranches: sanitizeProtectedBranches(protectedBranches),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    dbg.db('projects.create created id=%s', row.id);
    return parseProjectRow(row);
  },

  update: async (id: string, data: UpdateProject) => {
    dbg.db('projects.update id=%s %o', id, Object.keys(data));
    const {
      showWorkItemsInFeed,
      showPrsInFeed,
      aiSkillSlots,
      protectedBranches,
      ...rest
    } = data;
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
        ...(protectedBranches !== undefined && {
          protectedBranches: sanitizeProtectedBranches(protectedBranches),
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
