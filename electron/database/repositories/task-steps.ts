import { nanoid } from 'nanoid';

import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import type {
  InteractionMode,
  ModelPreference,
  TaskStep,
  TaskStepMeta,
  TaskStepStatus,
  TaskStepType,
} from '@shared/types';

import { dbg } from '../../lib/debug';
import { db } from '../index';
import type { TaskStepRow } from '../schema';

function toStep(row: TaskStepRow): TaskStep {
  return {
    id: row.id,
    taskId: row.taskId,
    name: row.name,
    type: (row.type ?? 'agent') as TaskStepType,
    dependsOn: row.dependsOn ? JSON.parse(row.dependsOn) : [],
    promptTemplate: row.promptTemplate,
    resolvedPrompt: row.resolvedPrompt,
    status: row.status as TaskStepStatus,
    sessionId: row.sessionId,
    interactionMode: row.interactionMode as InteractionMode | null,
    modelPreference: row.modelPreference as ModelPreference | null,
    agentBackend: row.agentBackend as AgentBackendType | null,
    output: row.output,
    images: row.images ? JSON.parse(row.images) : null,
    meta: row.meta ? (JSON.parse(row.meta) as TaskStepMeta) : {},
    autoStart: row.autoStart === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const TaskStepRepository = {
  findByTaskId: async (taskId: string): Promise<TaskStep[]> => {
    const rows = await db
      .selectFrom('task_steps')
      .selectAll()
      .where('taskId', '=', taskId)
      .orderBy('sortOrder', 'asc')
      .execute();
    return rows.map(toStep);
  },

  findByTaskIds: async (
    taskIds: string[],
  ): Promise<Record<string, TaskStep[]>> => {
    if (taskIds.length === 0) {
      return {};
    }

    const rows = await db
      .selectFrom('task_steps')
      .selectAll()
      .where('taskId', 'in', taskIds)
      .orderBy('sortOrder', 'asc')
      .execute();

    const stepsByTaskId: Record<string, TaskStep[]> = {};
    for (const row of rows) {
      const step = toStep(row);
      if (!stepsByTaskId[step.taskId]) {
        stepsByTaskId[step.taskId] = [];
      }
      stepsByTaskId[step.taskId].push(step);
    }

    return stepsByTaskId;
  },

  findByStatus: async (status: TaskStepStatus): Promise<TaskStep[]> => {
    const rows = await db
      .selectFrom('task_steps')
      .selectAll()
      .where('status', '=', status)
      .execute();
    return rows.map(toStep);
  },

  findById: async (id: string): Promise<TaskStep | undefined> => {
    const row = await db
      .selectFrom('task_steps')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toStep(row) : undefined;
  },

  create: async (data: {
    taskId: string;
    name: string;
    type?: TaskStepType;
    dependsOn?: string[];
    promptTemplate: string;
    interactionMode?: InteractionMode | null;
    modelPreference?: ModelPreference | null;
    agentBackend?: AgentBackendType | null;
    images?: PromptImagePart[] | null;
    meta?: TaskStepMeta;
    autoStart?: boolean;
    sortOrder?: number;
  }): Promise<TaskStep> => {
    dbg.db('taskSteps.create taskId=%s, name=%s', data.taskId, data.name);
    const now = new Date().toISOString();
    const deps = data.dependsOn ?? [];
    const status: TaskStepStatus = deps.length === 0 ? 'ready' : 'pending';
    const row = await db.transaction().execute(async (trx) => {
      const existingSteps = await trx
        .selectFrom('task_steps')
        .select('id')
        .where('taskId', '=', data.taskId)
        .execute();

      const normalizedSortOrder = Math.max(
        0,
        Math.min(data.sortOrder ?? existingSteps.length, existingSteps.length),
      );

      await trx
        .updateTable('task_steps')
        .set((eb) => ({
          sortOrder: eb('sortOrder', '+', 1),
        }))
        .where('taskId', '=', data.taskId)
        .where('sortOrder', '>=', normalizedSortOrder)
        .execute();

      return trx
        .insertInto('task_steps')
        .values({
          id: nanoid(),
          taskId: data.taskId,
          name: data.name,
          type: data.type ?? 'agent',
          dependsOn: JSON.stringify(deps),
          promptTemplate: data.promptTemplate,
          resolvedPrompt: null,
          status,
          sessionId: null,
          interactionMode: data.interactionMode ?? null,
          modelPreference: data.modelPreference ?? null,
          agentBackend: data.agentBackend ?? null,
          output: null,
          images: data.images ? JSON.stringify(data.images) : null,
          meta: data.meta ? JSON.stringify(data.meta) : null,
          autoStart: data.autoStart ? 1 : 0,
          sortOrder: normalizedSortOrder,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    dbg.db('taskSteps.create created id=%s', row.id);
    return toStep(row);
  },

  update: async (
    id: string,
    data: {
      name?: string;
      type?: TaskStepType;
      dependsOn?: string[];
      promptTemplate?: string;
      resolvedPrompt?: string | null;
      status?: TaskStepStatus;
      sessionId?: string | null;
      interactionMode?: InteractionMode | null;
      modelPreference?: ModelPreference | null;
      agentBackend?: AgentBackendType | null;
      output?: string | null;
      meta?: TaskStepMeta;
      autoStart?: boolean;
      sortOrder?: number;
    },
  ): Promise<TaskStep> => {
    dbg.db('taskSteps.update id=%s %o', id, Object.keys(data));
    const { dependsOn, meta, autoStart, ...rest } = data;
    const values: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    if (dependsOn !== undefined) {
      values.dependsOn = JSON.stringify(dependsOn);
    }
    if (meta !== undefined) {
      values.meta = JSON.stringify(meta);
    }
    if (autoStart !== undefined) {
      values.autoStart = autoStart ? 1 : 0;
    }

    const row = await db
      .updateTable('task_steps')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return toStep(row);
  },

  delete: async (id: string): Promise<void> => {
    dbg.db('taskSteps.delete id=%s', id);
    await db.deleteFrom('task_steps').where('id', '=', id).execute();
  },

  deleteByTaskId: async (taskId: string): Promise<void> => {
    dbg.db('taskSteps.deleteByTaskId taskId=%s', taskId);
    await db.deleteFrom('task_steps').where('taskId', '=', taskId).execute();
  },

  reorder: async (taskId: string, stepIds: string[]): Promise<TaskStep[]> => {
    dbg.db('taskSteps.reorder taskId=%s ids=%o', taskId, stepIds);
    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < stepIds.length; i++) {
        await trx
          .updateTable('task_steps')
          .set({ sortOrder: i, updatedAt: now })
          .where('id', '=', stepIds[i]!)
          .where('taskId', '=', taskId)
          .execute();
      }
    });
    return TaskStepRepository.findByTaskId(taskId);
  },
};
