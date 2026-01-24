import { InteractionMode, Task, TaskStatus } from '../../../shared/types';
import { db } from '../index';
import { NewTaskRow, TaskRow, UpdateTaskRow } from '../schema';

// Input types for repository methods (matching shared types but with db-compatible values)
interface CreateTaskInput {
  id?: string;
  projectId: string;
  name: string;
  prompt: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  userCompleted?: boolean;
  createdAt?: string;
  updatedAt: string;
}

interface UpdateTaskInput {
  projectId?: string;
  name?: string;
  prompt?: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  userCompleted?: boolean;
  updatedAt?: string;
}

// Convert SQLite's 0/1 to boolean for userCompleted
function toTask<T extends TaskRow>(row: T): Omit<T, 'userCompleted'> & { userCompleted: boolean } {
  const { userCompleted, ...rest } = row;
  return { ...rest, userCompleted: Boolean(userCompleted) };
}

function toTaskOrUndefined<T extends TaskRow>(
  row: T | undefined
): (Omit<T, 'userCompleted'> & { userCompleted: boolean }) | undefined {
  return row ? toTask(row) : undefined;
}

// Convert boolean userCompleted to number for database
function toDbValues(data: CreateTaskInput): NewTaskRow {
  const { userCompleted, ...rest } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && { userCompleted: userCompleted ? 1 : 0 }),
  } as NewTaskRow;
}

function toDbUpdateValues(data: UpdateTaskInput): Partial<UpdateTaskRow> {
  const { userCompleted, ...rest } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && { userCompleted: userCompleted ? 1 : 0 }),
  };
}

export const TaskRepository = {
  findAll: async () => {
    const rows = await db.selectFrom('tasks').selectAll().execute();
    return rows.map(toTask);
  },

  findByProjectId: async (projectId: string) => {
    const rows = await db
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
      .execute();
    return rows.map(toTask);
  },

  findById: async (id: string) => {
    const row = await db
      .selectFrom('tasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return toTaskOrUndefined(row);
  },

  create: async (data: CreateTaskInput) => {
    const row = await db
      .insertInto('tasks')
      .values(toDbValues(data))
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  update: async (id: string, data: UpdateTaskInput) => {
    const row = await db
      .updateTable('tasks')
      .set({ ...toDbUpdateValues(data), updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  delete: (id: string) => db.deleteFrom('tasks').where('id', '=', id).execute(),

  markAsRead: async (id: string) => {
    const row = await db
      .updateTable('tasks')
      .set({ readAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  updateLastReadIndex: async (id: string, lastReadIndex: number) => {
    const row = await db
      .updateTable('tasks')
      .set({ lastReadIndex, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  toggleUserCompleted: async (id: string): Promise<Task> => {
    // First get current value
    const current = await db
      .selectFrom('tasks')
      .select('userCompleted')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const newValue = current.userCompleted ? 0 : 1;
    const row = await db
      .updateTable('tasks')
      .set({ userCompleted: newValue, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row) as Task;
  },

  clearUserCompleted: async (id: string): Promise<Task> => {
    const row = await db
      .updateTable('tasks')
      .set({ userCompleted: 0, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row) as Task;
  },
};
