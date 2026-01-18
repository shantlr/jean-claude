import { db } from '../index';
import { NewProject, UpdateProject } from '../schema';

export const ProjectRepository = {
  findAll: () => db.selectFrom('projects').selectAll().execute(),

  findById: (id: string) =>
    db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst(),

  create: (data: NewProject) =>
    db
      .insertInto('projects')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateProject) =>
    db
      .updateTable('projects')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) =>
    db.deleteFrom('projects').where('id', '=', id).execute(),
};
