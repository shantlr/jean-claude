import { InteractionMode, Task, TaskStatus } from '../../../shared/types';
import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewTaskRow, TaskRow, UpdateTaskRow } from '../schema';

// Input types for repository methods (matching shared types but with db-compatible values)
interface CreateTaskInput {
  id?: string;
  projectId: string;
  name?: string | null;
  prompt: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  createdAt?: string;
  updatedAt: string;
}

interface UpdateTaskInput {
  projectId?: string;
  name?: string | null;
  prompt?: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  updatedAt?: string;
}

// Convert SQLite's 0/1 to boolean for userCompleted, and JSON string to array for sessionAllowedTools
function toTask<T extends TaskRow>(
  row: T,
): Omit<T, 'userCompleted' | 'sessionAllowedTools'> & {
  userCompleted: boolean;
  sessionAllowedTools: string[];
} {
  const { userCompleted, sessionAllowedTools, ...rest } = row;
  return {
    ...rest,
    userCompleted: Boolean(userCompleted),
    sessionAllowedTools: sessionAllowedTools
      ? JSON.parse(sessionAllowedTools)
      : [],
  };
}

function toTaskOrUndefined<T extends TaskRow>(
  row: T | undefined,
):
  | (Omit<T, 'userCompleted' | 'sessionAllowedTools'> & {
      userCompleted: boolean;
      sessionAllowedTools: string[];
    })
  | undefined {
  return row ? toTask(row) : undefined;
}

// Convert boolean userCompleted to number and sessionAllowedTools to JSON for database
function toDbValues(data: CreateTaskInput): NewTaskRow {
  const { userCompleted, sessionAllowedTools, ...rest } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && {
      userCompleted: userCompleted ? 1 : 0,
    }),
    ...(sessionAllowedTools !== undefined && {
      sessionAllowedTools: JSON.stringify(sessionAllowedTools),
    }),
  } as NewTaskRow;
}

function toDbUpdateValues(data: UpdateTaskInput): Partial<UpdateTaskRow> {
  const { userCompleted, sessionAllowedTools, ...rest } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && {
      userCompleted: userCompleted ? 1 : 0,
    }),
    ...(sessionAllowedTools !== undefined && {
      sessionAllowedTools: JSON.stringify(sessionAllowedTools),
    }),
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
          .as('messageCount'),
      )
      .where('projectId', '=', projectId)
      .orderBy('userCompleted', 'asc') // Active tasks first (0), then completed (1)
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(toTask);
  },

  findAllActive: async () => {
    const rows = await db
      .selectFrom('tasks')
      .innerJoin('projects', 'projects.id', 'tasks.projectId')
      .selectAll('tasks')
      .select([
        'projects.name as projectName',
        'projects.color as projectColor',
      ])
      .select((eb) =>
        eb
          .selectFrom('agent_messages')
          .whereRef('agent_messages.taskId', '=', 'tasks.id')
          .select((eb2) => eb2.fn.countAll<number>().as('count'))
          .as('messageCount'),
      )
      .where('tasks.userCompleted', '=', 0)
      .orderBy('tasks.createdAt', 'desc')
      .execute();
    return rows.map(toTask);
  },

  findAllCompleted: async ({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }) => {
    const rows = await db
      .selectFrom('tasks')
      .innerJoin('projects', 'projects.id', 'tasks.projectId')
      .selectAll('tasks')
      .select([
        'projects.name as projectName',
        'projects.color as projectColor',
      ])
      .select((eb) =>
        eb
          .selectFrom('agent_messages')
          .whereRef('agent_messages.taskId', '=', 'tasks.id')
          .select((eb2) => eb2.fn.countAll<number>().as('count'))
          .as('messageCount'),
      )
      .where('tasks.userCompleted', '=', 1)
      .orderBy('tasks.updatedAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count for pagination
    const countResult = await db
      .selectFrom('tasks')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('userCompleted', '=', 1)
      .executeTakeFirstOrThrow();

    return {
      tasks: rows.map(toTask),
      total: countResult.total,
    };
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
    dbg.db('tasks.create projectId=%s, name=%s', data.projectId, data.name);
    // Shift all existing active tasks in this project down (increment sortOrder)
    await db
      .updateTable('tasks')
      .set((eb) => ({
        sortOrder: eb('sortOrder', '+', 1),
      }))
      .where('projectId', '=', data.projectId)
      .where('userCompleted', '=', 0)
      .execute();

    // Insert new task with sortOrder 0 (top of active list)
    const row = await db
      .insertInto('tasks')
      .values({ ...toDbValues(data), sortOrder: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();
    dbg.db('tasks.create created id=%s', row.id);
    return toTask(row);
  },

  update: async (id: string, data: UpdateTaskInput) => {
    dbg.db('tasks.update id=%s %o', id, Object.keys(data));
    const row = await db
      .updateTable('tasks')
      .set({ ...toDbUpdateValues(data), updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  delete: (id: string) => {
    dbg.db('tasks.delete id=%s', id);
    return db.deleteFrom('tasks').where('id', '=', id).execute();
  },

  markAsRead: async (id: string) => {
    const row = await db
      .updateTable('tasks')
      .set({
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
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
    // First get current value and projectId
    const current = await db
      .selectFrom('tasks')
      .select(['userCompleted', 'projectId'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const newValue = current.userCompleted ? 0 : 1;
    const targetSection = newValue; // 0 = active, 1 = completed

    // Shift all existing tasks in the target section down (increment sortOrder)
    await db
      .updateTable('tasks')
      .set((eb) => ({
        sortOrder: eb('sortOrder', '+', 1),
      }))
      .where('projectId', '=', current.projectId)
      .where('userCompleted', '=', targetSection)
      .execute();

    // Update the task: toggle completion and move to top of target section (sortOrder 0)
    const row = await db
      .updateTable('tasks')
      .set({
        userCompleted: newValue,
        sortOrder: 0,
        updatedAt: new Date().toISOString(),
      })
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

  findByStatuses: async (statuses: TaskStatus[]): Promise<Task[]> => {
    const rows = await db
      .selectFrom('tasks')
      .selectAll()
      .where('status', 'in', statuses)
      .execute();
    return rows.map(toTask);
  },

  reorder: async (
    projectId: string,
    activeIds: string[],
    completedIds: string[],
  ): Promise<Task[]> => {
    const now = new Date().toISOString();

    // Update sortOrder for active tasks
    for (let i = 0; i < activeIds.length; i++) {
      await db
        .updateTable('tasks')
        .set({ sortOrder: i, updatedAt: now })
        .where('id', '=', activeIds[i])
        .execute();
    }

    // Update sortOrder for completed tasks
    for (let i = 0; i < completedIds.length; i++) {
      await db
        .updateTable('tasks')
        .set({ sortOrder: i, updatedAt: now })
        .where('id', '=', completedIds[i])
        .execute();
    }

    // Return all tasks in new order
    const rows = await db
      .selectFrom('tasks')
      .selectAll('tasks')
      .select((eb) =>
        eb
          .selectFrom('agent_messages')
          .whereRef('agent_messages.taskId', '=', 'tasks.id')
          .select((eb2) => eb2.fn.countAll<number>().as('count'))
          .as('messageCount'),
      )
      .where('projectId', '=', projectId)
      .orderBy('userCompleted', 'asc')
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(toTask);
  },
};
