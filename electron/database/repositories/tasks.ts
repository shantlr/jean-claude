import { Task, TaskStatus, TaskTodoItem, TaskType } from '@shared/types';
import type { PermissionScope } from '@shared/permission-types';


import { NewTaskRow, TaskRow, UpdateTaskRow } from '../schema';
import { db } from '../index';
import { dbg } from '../../lib/debug';



// Input types for repository methods (matching shared types but with db-compatible values)
interface CreateTaskInput {
  id?: string;
  projectId: string;
  type?: TaskType;
  name?: string | null;
  prompt: string;
  status?: TaskStatus;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  hasUnread?: boolean;
  userCompleted?: boolean;
  sessionRules?: PermissionScope;
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  todoItems?: TaskTodoItem[];
  parentTaskId?: string | null;
  createdAt?: string;
  updatedAt: string;
}

interface UpdateTaskInput {
  projectId?: string;
  name?: string | null;
  prompt?: string;
  status?: TaskStatus;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  hasUnread?: boolean;
  userCompleted?: boolean;
  sessionRules?: PermissionScope;
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  todoItems?: TaskTodoItem[];
  parentTaskId?: string | null;
  updatedAt?: string;
}

// Convert SQLite's 0/1 to boolean for userCompleted, and JSON strings to typed values
function toTask<T extends TaskRow>(
  row: T,
): Omit<
  T,
  | 'type'
  | 'userCompleted'
  | 'hasUnread'
  | 'sessionRules'
  | 'workItemIds'
  | 'workItemUrls'
  | 'todoItems'
> & {
  type: TaskType;
  userCompleted: boolean;
  hasUnread: boolean;
  sessionRules: PermissionScope;
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
  todoItems: TaskTodoItem[];
} {
  const {
    type,
    userCompleted,
    hasUnread,
    sessionRules,
    workItemIds,
    workItemUrls,
    todoItems,
    ...rest
  } = row;
  return {
    ...rest,
    type: (type ?? 'agent') as TaskType,
    userCompleted: Boolean(userCompleted),
    hasUnread: Boolean(hasUnread),
    sessionRules: sessionRules
      ? (JSON.parse(sessionRules) as PermissionScope)
      : {},
    workItemIds: workItemIds ? JSON.parse(workItemIds) : null,
    workItemUrls: workItemUrls ? JSON.parse(workItemUrls) : null,
    todoItems: todoItems ? (JSON.parse(todoItems) as TaskTodoItem[]) : [],
  };
}

function toTaskOrUndefined<T extends TaskRow>(
  row: T | undefined,
):
  | (Omit<
      T,
      | 'type'
      | 'userCompleted'
      | 'hasUnread'
      | 'sessionRules'
      | 'workItemIds'
      | 'workItemUrls'
      | 'todoItems'
    > & {
      type: TaskType;
      userCompleted: boolean;
      hasUnread: boolean;
      sessionRules: PermissionScope;
      workItemIds: string[] | null;
      workItemUrls: string[] | null;
      todoItems: TaskTodoItem[];
    })
  | undefined {
  return row ? toTask(row) : undefined;
}

// Convert boolean userCompleted to number and structured values to JSON for database
function toDbValues(data: CreateTaskInput): NewTaskRow {
  const {
    userCompleted,
    hasUnread,
    sessionRules,
    workItemIds,
    workItemUrls,
    todoItems,
    ...rest
  } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && {
      userCompleted: userCompleted ? 1 : 0,
    }),
    ...(hasUnread !== undefined && { hasUnread: hasUnread ? 1 : 0 }),
    ...(sessionRules !== undefined && {
      sessionRules: JSON.stringify(sessionRules),
    }),
    ...(workItemIds !== undefined && {
      workItemIds: workItemIds ? JSON.stringify(workItemIds) : null,
    }),
    ...(workItemUrls !== undefined && {
      workItemUrls: workItemUrls ? JSON.stringify(workItemUrls) : null,
    }),
    ...(todoItems !== undefined && {
      todoItems: JSON.stringify(todoItems),
    }),
  } as NewTaskRow;
}

function toDbUpdateValues(data: UpdateTaskInput): Partial<UpdateTaskRow> {
  const {
    userCompleted,
    hasUnread,
    sessionRules,
    workItemIds,
    workItemUrls,
    todoItems,
    ...rest
  } = data;
  return {
    ...rest,
    ...(userCompleted !== undefined && {
      userCompleted: userCompleted ? 1 : 0,
    }),
    ...(hasUnread !== undefined && { hasUnread: hasUnread ? 1 : 0 }),
    ...(sessionRules !== undefined && {
      sessionRules: JSON.stringify(sessionRules),
    }),
    ...(workItemIds !== undefined && {
      workItemIds: workItemIds ? JSON.stringify(workItemIds) : null,
    }),
    ...(workItemUrls !== undefined && {
      workItemUrls: workItemUrls ? JSON.stringify(workItemUrls) : null,
    }),
    ...(todoItems !== undefined && {
      todoItems: JSON.stringify(todoItems),
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
        'projects.logoPath as projectLogoPath',
        'projects.repoProviderId as repoProviderId',
        'projects.repoId as repoId',
      ])
      .where('tasks.userCompleted', '=', 0)
      .where('tasks.parentTaskId', 'is', null)
      .where('projects.archivedAt', 'is', null)
      .orderBy('tasks.createdAt', 'desc')
      .execute();
    return rows.map(toTask);
  },

  findChildrenForTasks: async (parentTaskIds: string[]) => {
    if (parentTaskIds.length === 0) return {};
    const rows = await db
      .selectFrom('tasks')
      .innerJoin('projects', 'projects.id', 'tasks.projectId')
      .selectAll('tasks')
      .select([
        'projects.name as projectName',
        'projects.color as projectColor',
        'projects.logoPath as projectLogoPath',
        'projects.repoProviderId as repoProviderId',
        'projects.repoId as repoId',
      ])
      .where('tasks.parentTaskId', 'in', parentTaskIds)
      .where('projects.archivedAt', 'is', null)
      .orderBy('tasks.sortOrder', 'asc')
      .execute();

    const grouped: Record<string, (typeof rows)[number][]> = {};
    for (const row of rows) {
      const pid = row.parentTaskId!;
      if (!grouped[pid]) grouped[pid] = [];
      grouped[pid].push(row);
    }
    return grouped;
  },

  findByParentTaskId: async (parentTaskId: string) => {
    const rows = await db
      .selectFrom('tasks')
      .selectAll()
      .where('parentTaskId', '=', parentTaskId)
      .orderBy('sortOrder', 'asc')
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
        'projects.logoPath as projectLogoPath',
      ])
      .where('tasks.userCompleted', '=', 1)
      .where('projects.archivedAt', 'is', null)
      .orderBy('tasks.updatedAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count for pagination
    const countResult = await db
      .selectFrom('tasks')
      .innerJoin('projects', 'projects.id', 'tasks.projectId')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('tasks.userCompleted', '=', 1)
      .where('projects.archivedAt', 'is', null)
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

  /** Returns the set of IDs that exist in the database from the given list. */
  findExistingIds: async (ids: string[]): Promise<Set<string>> => {
    if (ids.length === 0) return new Set();
    const rows = await db
      .selectFrom('tasks')
      .select('id')
      .where('id', 'in', ids)
      .execute();
    return new Set(rows.map((r) => r.id));
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
    console.trace(
      '[DEBUG] TaskRepository.update called',
      id,
      Object.keys(data),
    );
    const changedKeys = Object.keys(data).filter((key) => key !== 'updatedAt');
    const shouldUpdateTimestamp =
      changedKeys.length !== 1 || changedKeys[0] !== 'name';
    const row = await db
      .updateTable('tasks')
      .set({
        ...toDbUpdateValues(data),
        ...(shouldUpdateTimestamp && { updatedAt: new Date().toISOString() }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row);
  },

  updatePendingMessage: async (
    id: string,
    pendingMessage: string | null,
  ): Promise<Task> => {
    dbg.db('tasks.updatePendingMessage id=%s', id);
    const row = await db
      .updateTable('tasks')
      .set({ pendingMessage })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toTask(row) as Task;
  },

  delete: (id: string) => {
    dbg.db('tasks.delete id=%s', id);
    return db.deleteFrom('tasks').where('id', '=', id).execute();
  },

  setHasUnread: async (id: string, hasUnread: boolean) => {
    console.log('[DEBUG] setHasUnread called', id, hasUnread);
    const hasUnreadValue = hasUnread ? 1 : 0;
    await db
      .updateTable('tasks')
      .set({
        hasUnread: hasUnreadValue,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .where('hasUnread', '!=', hasUnreadValue)
      .execute();
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

  markUserCompleted: async (id: string): Promise<Task> => {
    return db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('tasks')
        .select(['userCompleted', 'projectId'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      if (current.userCompleted) {
        const row = await trx
          .selectFrom('tasks')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        return toTask(row) as Task;
      }

      await trx
        .updateTable('tasks')
        .set((eb) => ({
          sortOrder: eb('sortOrder', '+', 1),
        }))
        .where('projectId', '=', current.projectId)
        .where('userCompleted', '=', 1)
        .execute();

      const row = await trx
        .updateTable('tasks')
        .set({
          userCompleted: 1,
          sortOrder: 0,
          updatedAt: new Date().toISOString(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return toTask(row) as Task;
    });
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
      .where('projectId', '=', projectId)
      .orderBy('userCompleted', 'asc')
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(toTask);
  },
};
