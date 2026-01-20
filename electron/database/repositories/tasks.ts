import { db } from '../index';
import { NewTask, UpdateTask } from '../schema';

export const TaskRepository = {
  findAll: () => db.selectFrom('tasks').selectAll().execute(),

  findByProjectId: (projectId: string) =>
    db
      .selectFrom('tasks')
      .selectAll('tasks')
      .select((eb) =>
        eb
          .selectFrom('agent_messages')
          .whereRef('agent_messages.taskId', '=', 'tasks.id')
          .select((eb2) => eb2.fn.countAll<number>().as('count'))
          .as('messageCount')
      )
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .execute(),

  findById: (id: string) =>
    db.selectFrom('tasks').selectAll().where('id', '=', id).executeTakeFirst(),

  create: (data: NewTask) =>
    db
      .insertInto('tasks')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow(),

  update: (id: string, data: UpdateTask) =>
    db
      .updateTable('tasks')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  delete: (id: string) => db.deleteFrom('tasks').where('id', '=', id).execute(),

  markAsRead: (id: string) =>
    db
      .updateTable('tasks')
      .set({ readAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),

  updateLastReadIndex: (id: string, lastReadIndex: number) =>
    db
      .updateTable('tasks')
      .set({ lastReadIndex, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),
};
