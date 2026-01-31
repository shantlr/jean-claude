import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewProject, UpdateProject } from '../schema';

export const ProjectRepository = {
  findAll: () =>
    db.selectFrom('projects').selectAll().orderBy('sortOrder', 'asc').execute(),

  findById: (id: string) =>
    db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst(),

  create: async (data: NewProject) => {
    dbg.db('projects.create name=%s, path=%s', data.name, data.path);
    // Get max sortOrder and add 1 for new project
    const result = await db
      .selectFrom('projects')
      .select(db.fn.max('sortOrder').as('maxOrder'))
      .executeTakeFirst();

    const nextSortOrder = ((result?.maxOrder as number | null) ?? -1) + 1;

    const row = await db
      .insertInto('projects')
      .values({ ...data, sortOrder: data.sortOrder ?? nextSortOrder })
      .returningAll()
      .executeTakeFirstOrThrow();
    dbg.db('projects.create created id=%s', row.id);
    return row;
  },

  update: (id: string, data: UpdateProject) => {
    dbg.db('projects.update id=%s %o', id, Object.keys(data));
    return db
      .updateTable('projects')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
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

    // Return all projects in new order
    return db
      .selectFrom('projects')
      .selectAll()
      .orderBy('sortOrder', 'asc')
      .execute();
  },
};
