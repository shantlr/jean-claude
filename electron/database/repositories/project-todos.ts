import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewProjectTodoRow, UpdateProjectTodoRow } from '../schema';

export const ProjectTodoRepository = {
  findByProjectId: (projectId: string) =>
    db
      .selectFrom('project_todos')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('sortOrder', 'asc')
      .execute(),

  countByProjectId: (projectId: string) =>
    db
      .selectFrom('project_todos')
      .select(db.fn.countAll<number>().as('count'))
      .where('projectId', '=', projectId)
      .executeTakeFirstOrThrow(),

  create: async (data: Omit<NewProjectTodoRow, 'sortOrder'>) => {
    dbg.db('projectTodos.create projectId=%s', data.projectId);

    return db.transaction().execute(async (trx) => {
      const last = await trx
        .selectFrom('project_todos')
        .select('sortOrder')
        .where('projectId', '=', data.projectId)
        .orderBy('sortOrder', 'desc')
        .executeTakeFirst();

      const sortOrder = (last?.sortOrder ?? -1) + 1;

      return trx
        .insertInto('project_todos')
        .values({ ...data, sortOrder })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  update: (id: string, data: UpdateProjectTodoRow) => {
    dbg.db('projectTodos.update id=%s', id);
    return db
      .updateTable('project_todos')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: (id: string) => {
    dbg.db('projectTodos.delete id=%s', id);
    return db.deleteFrom('project_todos').where('id', '=', id).execute();
  },

  reorder: async (projectId: string, orderedIds: string[]) => {
    dbg.db('projectTodos.reorder projectId=%s ids=%o', projectId, orderedIds);
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await trx
          .updateTable('project_todos')
          .set({ sortOrder: i })
          .where('id', '=', orderedIds[i])
          .where('projectId', '=', projectId)
          .execute();
      }
    });
  },
};
