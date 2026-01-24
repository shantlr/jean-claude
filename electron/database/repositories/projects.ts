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
    // Get max sortOrder and add 1 for new project
    const result = await db
      .selectFrom('projects')
      .select(db.fn.max('sortOrder').as('maxOrder'))
      .executeTakeFirst();

    const nextSortOrder = ((result?.maxOrder as number | null) ?? -1) + 1;

    return db
      .insertInto('projects')
      .values({ ...data, sortOrder: data.sortOrder ?? nextSortOrder })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update: (id: string, data: UpdateProject) =>
    db
      .updateTable('projects')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) =>
    db.deleteFrom('projects').where('id', '=', id).execute(),

  reorder: async (orderedIds: string[]) => {
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
