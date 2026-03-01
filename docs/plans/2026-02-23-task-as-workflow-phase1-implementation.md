# Task-as-Workflow Phase 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert tasks from single agent sessions into containers for a DAG of steps, where each step is its own agent session sharing the task's worktree.

**Architecture:** A new `task_steps` table holds per-step agent session data (sessionId, interactionMode, modelPreference, agentBackend). These fields are removed from `tasks` via safe table recreation. A step service orchestrates step lifecycle, and the agent service becomes step-centric (`startAgent(stepId)` instead of `startAgent(taskId)`). The UI gains a `<StepFlowBar>` between the task header and message stream.

**Tech Stack:** TypeScript, Electron, Kysely (SQLite), React, Zustand, TanStack React Query, TanStack Router

**Design Doc:** `docs/plans/2026-02-23-task-as-workflow-phase1-design.md`

---

## Task 1: Shared Types — TaskStep + Update Task Interface

**Files:**
- Modify: `shared/types.ts`

**Step 1: Add TaskStep types**

Add after line 306 (after `UpdateTask` interface), before `ProjectTodo`:

```typescript
export type TaskStepStatus = 'pending' | 'ready' | 'running' | 'completed' | 'errored' | 'interrupted';

export interface TaskStep {
  id: string;
  taskId: string;
  name: string;
  dependsOn: string[];
  promptTemplate: string;
  resolvedPrompt: string | null;
  status: TaskStepStatus;
  sessionId: string | null;
  interactionMode: InteractionMode | null;
  modelPreference: ModelPreference | null;
  agentBackend: AgentBackendType | null;
  output: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTaskStep {
  id?: string;
  taskId: string;
  name: string;
  dependsOn?: string[];
  promptTemplate: string;
  interactionMode?: InteractionMode | null;
  modelPreference?: ModelPreference | null;
  agentBackend?: AgentBackendType | null;
  sortOrder?: number;
}

export interface UpdateTaskStep {
  name?: string;
  dependsOn?: string[];
  promptTemplate?: string;
  resolvedPrompt?: string | null;
  status?: TaskStepStatus;
  sessionId?: string | null;
  interactionMode?: InteractionMode | null;
  modelPreference?: ModelPreference | null;
  agentBackend?: AgentBackendType | null;
  output?: string | null;
  sortOrder?: number;
}
```

**Step 2: Update Task interface — remove fields that moved to steps**

Remove from `Task` interface (lines 232-256):
- `sessionId: string | null;`
- `interactionMode: InteractionMode;`
- `modelPreference: ModelPreference;`
- `agentBackend: AgentBackendType;`

Remove matching fields from `NewTask` (lines 258-282):
- `sessionId`, `interactionMode`, `modelPreference`, `agentBackend`

Remove matching fields from `UpdateTask` (lines 284-306):
- `sessionId`, `interactionMode`, `modelPreference`, `agentBackend`

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: Compilation errors in files that reference the removed Task fields (this is expected — we fix them in subsequent tasks).

**Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add TaskStep types, remove step fields from Task"
```

---

## Task 2: Database Schema Types

**Files:**
- Modify: `electron/database/schema.ts`

**Step 1: Add TaskStepTable interface**

Add after `RawMessageTable` (after line 139):

```typescript
export interface TaskStepTable {
  id: Generated<string>;
  taskId: string;
  name: string;
  dependsOn: string; // JSON array of step IDs
  promptTemplate: string;
  resolvedPrompt: string | null;
  status: string; // TaskStepStatus
  sessionId: string | null;
  interactionMode: string | null;
  modelPreference: string | null;
  agentBackend: string | null;
  output: string | null;
  sortOrder: number;
  createdAt: Generated<string>;
  updatedAt: string;
}
```

Add Kysely row types:

```typescript
export type TaskStepRow = Selectable<TaskStepTable>;
export type NewTaskStepRow = Insertable<TaskStepTable>;
export type UpdateTaskStepRow = Updateable<TaskStepTable>;
```

**Step 2: Register in Database interface**

Add to the `Database` interface (around line 25-38):

```typescript
task_steps: TaskStepTable;
```

**Step 3: Add stepId to AgentMessageTable**

Add to `AgentMessageTable` (after `taskId` field):

```typescript
stepId: string | null;
```

**Step 4: Add stepId to RawMessageTable**

Add to `RawMessageTable` (after `taskId` field):

```typescript
stepId: string | null;
```

**Step 5: Remove moved fields from TaskTable**

Remove from `TaskTable` (lines 87-113):
- `sessionId: string | null;`
- `interactionMode: string;`
- `modelPreference: string | null;`
- `agentBackend: string;`

**Step 6: Update re-exports**

The schema re-exports `Task`, `NewTask`, `UpdateTask` from `@shared/types` — these will automatically pick up the changes from Task 1. Also re-export the new types:

```typescript
export type { TaskStep, NewTaskStep, UpdateTaskStep, TaskStepStatus } from '@shared/types';
```

**Step 7: Commit**

```bash
git add electron/database/schema.ts
git commit -m "feat(schema): add TaskStepTable, stepId to messages, remove step fields from tasks"
```

---

## Task 3: Database Migration

**Files:**
- Create: `electron/database/migrations/031_task_steps.ts`
- Modify: `electron/database/migrator.ts`

**Step 1: Write the migration**

Create `electron/database/migrations/031_task_steps.ts`:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // --- Phase 1: Create task_steps table ---
  await db.schema
    .createTable('task_steps')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`)
    )
    .addColumn('taskId', 'text', (col) =>
      col.notNull().references('tasks.id').onDelete('cascade')
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('dependsOn', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('promptTemplate', 'text', (col) => col.notNull())
    .addColumn('resolvedPrompt', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('ready'))
    .addColumn('sessionId', 'text')
    .addColumn('interactionMode', 'text')
    .addColumn('modelPreference', 'text')
    .addColumn('agentBackend', 'text')
    .addColumn('output', 'text')
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .execute();

  await db.schema
    .createIndex('task_steps_task_idx')
    .on('task_steps')
    .columns(['taskId'])
    .execute();

  // --- Phase 2: Backfill one step per existing task ---
  const tasks = await sql<{
    id: string;
    prompt: string;
    status: string;
    sessionId: string | null;
    interactionMode: string;
    modelPreference: string | null;
    agentBackend: string;
  }>`SELECT id, prompt, status, sessionId, interactionMode, modelPreference, agentBackend FROM tasks`.execute(db);

  const now = new Date().toISOString();
  for (const task of tasks.rows) {
    // Map task status to step status
    const stepStatus = (['running', 'waiting', 'completed', 'errored', 'interrupted'].includes(task.status))
      ? (task.status === 'waiting' ? 'ready' : task.status)
      : 'ready';

    const stepId = sql`lower(hex(randomblob(16)))`;
    await sql`INSERT INTO task_steps (id, taskId, name, dependsOn, promptTemplate, resolvedPrompt, status, sessionId, interactionMode, modelPreference, agentBackend, sortOrder, createdAt, updatedAt)
      VALUES (${stepId}, ${task.id}, ${'Step 1'}, ${'[]'}, ${task.prompt}, ${task.prompt}, ${stepStatus}, ${task.sessionId}, ${task.interactionMode}, ${task.modelPreference}, ${task.agentBackend}, ${0}, ${now}, ${now})`.execute(db);
  }

  // --- Phase 3: Add stepId to agent_messages and raw_messages, backfill ---
  await db.schema
    .alterTable('agent_messages')
    .addColumn('stepId', 'text')
    .execute();

  await db.schema
    .alterTable('raw_messages')
    .addColumn('stepId', 'text')
    .execute();

  // Backfill stepId from the auto-created single step per task
  await sql`UPDATE agent_messages SET stepId = (
    SELECT ts.id FROM task_steps ts WHERE ts.taskId = agent_messages.taskId LIMIT 1
  )`.execute(db);

  await sql`UPDATE raw_messages SET stepId = (
    SELECT ts.id FROM task_steps ts WHERE ts.taskId = raw_messages.taskId LIMIT 1
  )`.execute(db);

  // Index on stepId for message queries
  await db.schema
    .createIndex('agent_messages_step_idx')
    .on('agent_messages')
    .columns(['stepId'])
    .execute();

  await db.schema
    .createIndex('raw_messages_step_idx')
    .on('raw_messages')
    .columns(['stepId'])
    .execute();

  // --- Phase 4: Recreate tasks table without moved columns ---
  // Use safe table recreation pattern
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await db.transaction().execute(async (trx) => {
    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);

    await trx.schema
      .createTable('tasks_new')
      .addColumn('id', 'text', (col) =>
        col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`)
      )
      .addColumn('projectId', 'text', (col) =>
        col.notNull().references('projects.id').onDelete('cascade')
      )
      .addColumn('name', 'text')
      .addColumn('prompt', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('waiting'))
      .addColumn('worktreePath', 'text')
      .addColumn('startCommitHash', 'text')
      .addColumn('sourceBranch', 'text')
      .addColumn('branchName', 'text')
      .addColumn('hasUnread', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('userCompleted', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('sessionAllowedTools', 'text')
      .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('workItemIds', 'text')
      .addColumn('workItemUrls', 'text')
      .addColumn('pullRequestId', 'text')
      .addColumn('pullRequestUrl', 'text')
      .addColumn('pendingMessage', 'text')
      .addColumn('createdAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`)
      )
      .addColumn('updatedAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`)
      )
      .execute();

    // Copy data (excluding removed columns)
    await sql`INSERT INTO tasks_new (id, projectId, name, prompt, status, worktreePath, startCommitHash, sourceBranch, branchName, hasUnread, userCompleted, sessionAllowedTools, sortOrder, workItemIds, workItemUrls, pullRequestId, pullRequestUrl, pendingMessage, createdAt, updatedAt)
      SELECT id, projectId, name, prompt, status, worktreePath, startCommitHash, sourceBranch, branchName, hasUnread, userCompleted, sessionAllowedTools, sortOrder, workItemIds, workItemUrls, pullRequestId, pullRequestUrl, pendingMessage, createdAt, updatedAt FROM tasks`.execute(trx);

    await trx.schema.dropTable('tasks').execute();
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    // Re-create FK constraint references from task_steps to tasks
    // (task_steps was created before the recreation, FKs still valid since IDs unchanged)

    // Verify FK integrity
    const fkCheck = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation: ${JSON.stringify(fkCheck.rows)}`);
    }
  });

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('agent_messages_step_idx').ifExists().execute();
  await db.schema.dropIndex('raw_messages_step_idx').ifExists().execute();

  // Remove stepId columns (need table recreation for SQLite)
  // For simplicity, just drop the columns if ALTER TABLE DROP COLUMN is supported (SQLite 3.35+)
  await db.schema.alterTable('agent_messages').dropColumn('stepId').execute();
  await db.schema.alterTable('raw_messages').dropColumn('stepId').execute();

  // Add back columns to tasks
  await db.schema.alterTable('tasks').addColumn('sessionId', 'text').execute();
  await db.schema.alterTable('tasks').addColumn('interactionMode', 'text', (col) => col.notNull().defaultTo('plan')).execute();
  await db.schema.alterTable('tasks').addColumn('modelPreference', 'text').execute();
  await db.schema.alterTable('tasks').addColumn('agentBackend', 'text', (col) => col.notNull().defaultTo('claude-code')).execute();

  // Backfill from steps
  await sql`UPDATE tasks SET
    sessionId = (SELECT sessionId FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1),
    interactionMode = COALESCE((SELECT interactionMode FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1), 'plan'),
    modelPreference = (SELECT modelPreference FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1),
    agentBackend = COALESCE((SELECT agentBackend FROM task_steps WHERE task_steps.taskId = tasks.id LIMIT 1), 'claude-code')
  `.execute(db);

  // Drop task_steps
  await db.schema.dropTable('task_steps').execute();
}
```

**Step 2: Register the migration**

In `electron/database/migrator.ts`, add:

```typescript
import * as m031 from './migrations/031_task_steps';
```

And in the `migrations` record:

```typescript
'031_task_steps': m031,
```

**Step 3: Commit**

```bash
git add electron/database/migrations/031_task_steps.ts electron/database/migrator.ts
git commit -m "feat(db): add task_steps migration with backfill"
```

---

## Task 4: Step Repository

**Files:**
- Create: `electron/database/repositories/task-steps.ts`
- Modify: `electron/database/repositories/index.ts`

**Step 1: Create the repository**

Create `electron/database/repositories/task-steps.ts`:

```typescript
import { nanoid } from 'nanoid';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  InteractionMode,
  ModelPreference,
  TaskStep,
  TaskStepStatus,
} from '@shared/types';

import { db } from '../index';
import type { TaskStepRow } from '../schema';

function toStep(row: TaskStepRow): TaskStep {
  return {
    id: row.id,
    taskId: row.taskId,
    name: row.name,
    dependsOn: row.dependsOn ? JSON.parse(row.dependsOn) : [],
    promptTemplate: row.promptTemplate,
    resolvedPrompt: row.resolvedPrompt,
    status: row.status as TaskStepStatus,
    sessionId: row.sessionId,
    interactionMode: row.interactionMode as InteractionMode | null,
    modelPreference: row.modelPreference as ModelPreference | null,
    agentBackend: row.agentBackend as AgentBackendType | null,
    output: row.output,
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
    dependsOn?: string[];
    promptTemplate: string;
    interactionMode?: InteractionMode | null;
    modelPreference?: ModelPreference | null;
    agentBackend?: AgentBackendType | null;
    sortOrder?: number;
  }): Promise<TaskStep> => {
    const now = new Date().toISOString();
    const row = await db
      .insertInto('task_steps')
      .values({
        id: nanoid(),
        taskId: data.taskId,
        name: data.name,
        dependsOn: JSON.stringify(data.dependsOn ?? []),
        promptTemplate: data.promptTemplate,
        status: (data.dependsOn ?? []).length === 0 ? 'ready' : 'pending',
        interactionMode: data.interactionMode ?? null,
        modelPreference: data.modelPreference ?? null,
        agentBackend: data.agentBackend ?? null,
        sortOrder: data.sortOrder ?? 0,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toStep(row);
  },

  update: async (
    id: string,
    data: {
      name?: string;
      dependsOn?: string[];
      promptTemplate?: string;
      resolvedPrompt?: string | null;
      status?: TaskStepStatus;
      sessionId?: string | null;
      interactionMode?: InteractionMode | null;
      modelPreference?: ModelPreference | null;
      agentBackend?: AgentBackendType | null;
      output?: string | null;
      sortOrder?: number;
    },
  ): Promise<TaskStep> => {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.dependsOn !== undefined) updateValues.dependsOn = JSON.stringify(data.dependsOn);
    if (data.promptTemplate !== undefined) updateValues.promptTemplate = data.promptTemplate;
    if (data.resolvedPrompt !== undefined) updateValues.resolvedPrompt = data.resolvedPrompt;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.sessionId !== undefined) updateValues.sessionId = data.sessionId;
    if (data.interactionMode !== undefined) updateValues.interactionMode = data.interactionMode;
    if (data.modelPreference !== undefined) updateValues.modelPreference = data.modelPreference;
    if (data.agentBackend !== undefined) updateValues.agentBackend = data.agentBackend;
    if (data.output !== undefined) updateValues.output = data.output;
    if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;

    const row = await db
      .updateTable('task_steps')
      .set(updateValues)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toStep(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('task_steps').where('id', '=', id).execute();
  },

  deleteByTaskId: async (taskId: string): Promise<void> => {
    await db.deleteFrom('task_steps').where('taskId', '=', taskId).execute();
  },

  reorder: async (taskId: string, stepIds: string[]): Promise<TaskStep[]> => {
    const now = new Date().toISOString();
    for (let i = 0; i < stepIds.length; i++) {
      await db
        .updateTable('task_steps')
        .set({ sortOrder: i, updatedAt: now })
        .where('id', '=', stepIds[i])
        .execute();
    }
    return TaskStepRepository.findByTaskId(taskId);
  },
};
```

**Step 2: Register in repository index**

Add export to `electron/database/repositories/index.ts`:

```typescript
export { TaskStepRepository } from './task-steps';
```

**Step 3: Commit**

```bash
git add electron/database/repositories/task-steps.ts electron/database/repositories/index.ts
git commit -m "feat(db): add TaskStepRepository"
```

---

## Task 5: Update Agent Message & Raw Message Repositories

**Files:**
- Modify: `electron/database/repositories/agent-messages.ts`
- Modify: `electron/database/repositories/raw-messages.ts`

**Step 1: Update AgentMessageRepository.create** to accept optional `stepId`

In `agent-messages.ts`, update the `create` method's parameter type (line 42-51) to include `stepId?`:

```typescript
create: async ({
  taskId,
  stepId,
  messageIndex,
  entry,
  rawMessageId,
}: {
  taskId: string;
  stepId?: string | null;
  messageIndex: number;
  entry: NormalizedEntry;
  rawMessageId?: string | null;
}) => {
```

And add `stepId: stepId ?? null,` to the `.values({...})` object.

**Step 2: Add `findByStepId` method**

Add after `findByTaskId`:

```typescript
findByStepId: async (stepId: string): Promise<NormalizedEntry[]> => {
  const rows = await db
    .selectFrom('agent_messages')
    .select(['agent_messages.data'])
    .where('agent_messages.stepId', '=', stepId)
    .orderBy('agent_messages.messageIndex', 'asc')
    .execute();

  return rows
    .filter((row) => row.data)
    .map((row) => JSON.parse(row.data) as NormalizedEntry);
},
```

**Step 3: Add `getMessageCountByStepId` method**

```typescript
getMessageCountByStepId: async (stepId: string): Promise<number> => {
  const result = await db
    .selectFrom('agent_messages')
    .select((eb) => eb.fn.count<number>('id').as('count'))
    .where('stepId', '=', stepId)
    .executeTakeFirst();
  return result?.count ?? 0;
},
```

**Step 4: Update RawMessageRepository.create** to accept optional `stepId`

In `raw-messages.ts`, update the `create` method's parameter type to include `stepId?`:

```typescript
create: async ({
  taskId,
  stepId,
  messageIndex,
  backendSessionId,
  rawData,
  rawFormat,
}: {
  taskId: string;
  stepId?: string | null;
  messageIndex: number;
  backendSessionId: string | null;
  rawData: unknown;
  rawFormat: AgentBackendType;
}) => {
```

And add `stepId: stepId ?? null,` to the `.values({...})` object.

**Step 5: Commit**

```bash
git add electron/database/repositories/agent-messages.ts electron/database/repositories/raw-messages.ts
git commit -m "feat(db): add stepId support to message repositories"
```

---

## Task 6: Update Task Repository

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Remove moved fields from conversion helpers**

Update `toTask` function: remove the destructuring and type omission of `sessionId`, `interactionMode`, `modelPreference`, `agentBackend`. These fields no longer exist on the TaskTable row.

Update `toDbValues` function: remove handling of `interactionMode`, `modelPreference`, `agentBackend` (they're no longer in CreateTaskInput).

Update `toDbUpdateValues` function: remove same fields.

Update `CreateTaskInput` and `UpdateTaskInput` interfaces: remove `sessionId`, `interactionMode`, `modelPreference`, `agentBackend`.

**Step 2: Commit**

```bash
git add electron/database/repositories/tasks.ts
git commit -m "refactor(db): remove step fields from TaskRepository"
```

---

## Task 7: Step Service

**Files:**
- Create: `electron/services/step-service.ts`

**Step 1: Create the service**

```typescript
import type { TaskStep, TaskStepStatus } from '@shared/types';

import { dbg } from '../lib/debug';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { TaskRepository } from '../database/repositories/tasks';
import { AgentMessageRepository } from '../database/repositories/agent-messages';

const debug = dbg.extend('step-service');

/**
 * Resolve template expressions in a prompt template.
 * Supported: {{task.prompt}}, {{task.name}}, {{step.<id>.output}}
 */
function resolvePromptTemplate({
  template,
  taskPrompt,
  taskName,
  steps,
}: {
  template: string;
  taskPrompt: string;
  taskName: string | null;
  steps: TaskStep[];
}): { resolvedPrompt: string; warnings: string[] } {
  const warnings: string[] = [];

  const resolved = template.replace(/\{\{(.+?)\}\}/g, (match, expression: string) => {
    const trimmed = expression.trim();

    if (trimmed === 'task.prompt') return taskPrompt;
    if (trimmed === 'task.name') return taskName ?? '';

    const stepMatch = trimmed.match(/^step\.(.+?)\.output$/);
    if (stepMatch) {
      const stepId = stepMatch[1];
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        warnings.push(`Unknown step ID: ${stepId}`);
        return match; // Leave expression as-is
      }
      if (step.status !== 'completed') {
        warnings.push(`Step "${step.name}" (${stepId}) is not completed`);
        return match;
      }
      if (step.output === null) {
        warnings.push(`Step "${step.name}" (${stepId}) has no output`);
        return '';
      }
      return step.output;
    }

    warnings.push(`Unknown expression: ${trimmed}`);
    return match;
  });

  return { resolvedPrompt: resolved, warnings };
}

/**
 * Compute task status from step statuses.
 */
function computeTaskStatus(steps: TaskStep[]): 'running' | 'errored' | 'interrupted' | 'completed' | 'waiting' {
  if (steps.some((s) => s.status === 'running')) return 'running';
  if (steps.some((s) => s.status === 'errored')) return 'errored';
  if (steps.some((s) => s.status === 'interrupted')) return 'interrupted';
  if (steps.length > 0 && steps.every((s) => s.status === 'completed')) return 'completed';
  return 'waiting';
}

/**
 * After a step completes, check if any dependent steps should transition from pending to ready.
 */
async function updateDependentStepStatuses(taskId: string): Promise<void> {
  const steps = await TaskStepRepository.findByTaskId(taskId);
  const completedIds = new Set(steps.filter((s) => s.status === 'completed').map((s) => s.id));

  for (const step of steps) {
    if (step.status !== 'pending') continue;
    const allDepsCompleted = step.dependsOn.every((depId) => completedIds.has(depId));
    if (allDepsCompleted) {
      await TaskStepRepository.update(step.id, { status: 'ready' });
    }
  }
}

export const StepService = {
  findByTaskId: (taskId: string) => TaskStepRepository.findByTaskId(taskId),

  findById: (id: string) => TaskStepRepository.findById(id),

  create: async (data: {
    taskId: string;
    name: string;
    dependsOn?: string[];
    promptTemplate: string;
    interactionMode?: string | null;
    modelPreference?: string | null;
    agentBackend?: string | null;
    sortOrder?: number;
  }): Promise<TaskStep> => {
    debug('create step taskId=%s name=%s', data.taskId, data.name);
    return TaskStepRepository.create(data as Parameters<typeof TaskStepRepository.create>[0]);
  },

  update: async (
    stepId: string,
    data: Parameters<typeof TaskStepRepository.update>[1],
  ): Promise<TaskStep> => {
    debug('update step=%s %o', stepId, Object.keys(data));
    return TaskStepRepository.update(stepId, data);
  },

  delete: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) return;

    // Remove this stepId from other steps' dependsOn arrays
    const siblings = await TaskStepRepository.findByTaskId(step.taskId);
    for (const sibling of siblings) {
      if (sibling.dependsOn.includes(stepId)) {
        const newDeps = sibling.dependsOn.filter((id) => id !== stepId);
        await TaskStepRepository.update(sibling.id, { dependsOn: newDeps });
      }
    }

    await TaskStepRepository.delete(stepId);

    // Re-evaluate dependent statuses
    await updateDependentStepStatuses(step.taskId);
    await StepService.syncTaskStatus(step.taskId);
  },

  reorder: (taskId: string, stepIds: string[]) =>
    TaskStepRepository.reorder(taskId, stepIds),

  /**
   * Resolve the prompt template and validate dependencies before starting a step.
   * Returns the resolved prompt string.
   */
  resolveAndValidate: async (stepId: string): Promise<{
    resolvedPrompt: string;
    step: TaskStep;
    warnings: string[];
  }> => {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    const task = await TaskRepository.findById(step.taskId);
    if (!task) throw new Error(`Task not found for step: ${stepId}`);

    const steps = await TaskStepRepository.findByTaskId(step.taskId);

    // Validate all dependencies are completed
    for (const depId of step.dependsOn) {
      const dep = steps.find((s) => s.id === depId);
      if (!dep) throw new Error(`Dependency step not found: ${depId}`);
      if (dep.status !== 'completed') {
        throw new Error(`Dependency "${dep.name}" (${depId}) is not completed (status: ${dep.status})`);
      }
    }

    // Resolve template
    const { resolvedPrompt, warnings } = resolvePromptTemplate({
      template: step.promptTemplate,
      taskPrompt: task.prompt,
      taskName: task.name,
      steps,
    });

    // Save resolved prompt
    await TaskStepRepository.update(stepId, { resolvedPrompt });

    return { resolvedPrompt, step, warnings };
  },

  /**
   * Capture the output from the last assistant message or result entry.
   */
  captureOutput: async (stepId: string): Promise<string | null> => {
    const messages = await AgentMessageRepository.findByStepId(stepId);
    if (messages.length === 0) return null;

    // Look for last 'result' entry
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'result' && 'value' in messages[i]) {
        const result = messages[i] as { type: 'result'; value?: string };
        if (result.value) return result.value;
      }
    }

    // Fallback to last 'assistant-message'
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'assistant-message' && 'value' in messages[i]) {
        const msg = messages[i] as { type: 'assistant-message'; value: string };
        if (msg.value) return msg.value;
      }
    }

    return null;
  },

  /**
   * Mark step as completed, capture output, update dependents, sync task status.
   */
  completeStep: async (stepId: string): Promise<void> => {
    const output = await StepService.captureOutput(stepId);
    await TaskStepRepository.update(stepId, { status: 'completed', output });

    const step = await TaskStepRepository.findById(stepId);
    if (step) {
      await updateDependentStepStatuses(step.taskId);
      await StepService.syncTaskStatus(step.taskId);
    }
  },

  /**
   * Mark step as errored, sync task status.
   */
  errorStep: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    await TaskStepRepository.update(stepId, { status: 'errored' });
    if (step) await StepService.syncTaskStatus(step.taskId);
  },

  /**
   * Mark step as interrupted, sync task status.
   */
  interruptStep: async (stepId: string): Promise<void> => {
    const step = await TaskStepRepository.findById(stepId);
    await TaskStepRepository.update(stepId, { status: 'interrupted' });
    if (step) await StepService.syncTaskStatus(step.taskId);
  },

  /**
   * Recompute and update task.status from step statuses.
   */
  syncTaskStatus: async (taskId: string): Promise<void> => {
    const steps = await TaskStepRepository.findByTaskId(taskId);
    const newStatus = computeTaskStatus(steps);
    debug('syncTaskStatus taskId=%s newStatus=%s', taskId, newStatus);
    await TaskRepository.update(taskId, { status: newStatus });
  },
};
```

**Step 2: Commit**

```bash
git add electron/services/step-service.ts
git commit -m "feat(services): add StepService with lifecycle management"
```

---

## Task 8: Refactor Agent Service

**Files:**
- Modify: `electron/services/agent-service.ts`

This is the most complex task. The agent service currently takes `taskId` everywhere. We need to change it to work with `stepId`.

**Step 1: Update ActiveSession**

Change the `ActiveSession` interface to include `stepId` alongside `taskId`:

```typescript
interface ActiveSession {
  stepId: string;           // NEW — the step this session belongs to
  taskId: string;           // Keep for worktree path lookup
  // ... rest unchanged
}
```

Sessions are now keyed by `stepId` in the `sessions` Map.

**Step 2: Update `start` method**

Change signature from `start(taskId: string)` to `start(stepId: string)`.

The method should:
1. Look up the step via `TaskStepRepository.findById(stepId)`
2. Look up the task via `TaskRepository.findById(step.taskId)` (for worktree path)
3. Call `StepService.resolveAndValidate(stepId)` to get the resolved prompt
4. Update step status to 'running'
5. Call `StepService.syncTaskStatus(step.taskId)`
6. Create session with step's `sessionId`, `interactionMode`, `modelPreference`, `agentBackend`
7. Run the backend with the resolved prompt

Replace all `TaskRepository.update(taskId, { status: ... })` calls with `StepService` calls:
- On error: `StepService.errorStep(stepId)`
- On complete: `StepService.completeStep(stepId)` (handles output capture + status sync)
- On interrupt: `StepService.interruptStep(stepId)`

**Step 3: Update `createSession`**

Change to read step config instead of task config:
- `step.agentBackend` instead of `task.agentBackend`
- `step.sessionId` instead of `task.sessionId`
- Key the session in the map by `stepId`

The `persistRaw` callback should pass `stepId` to `RawMessageRepository.create`.

**Step 4: Update `runBackend`**

- Get `interactionMode` from the step (via `session.stepId` lookup) instead of task
- Get `modelPreference` from the step instead of task
- Keep worktree/project path resolution from the task

**Step 5: Update `processEvent`**

- All `AgentMessageRepository.create` calls get `stepId` from `session.stepId`
- Replace `TaskRepository.update(taskId, { status: 'waiting' })` with step status updates
- On 'complete' event: call `StepService.completeStep(session.stepId)` instead of directly setting task status
- On 'session-id' event: write sessionId to the step instead of the task:
  `TaskStepRepository.update(session.stepId, { sessionId: event.sessionId })`
- Session allowed tools sync stays on the task (these are shared across the worktree)

**Step 6: Update `stop`, `respond`, `sendMessage`, `setMode`**

These currently take `taskId` to look up the session. Change the sessions Map key to `stepId`. Update the public API:
- `stop(stepId: string)`
- `respond(stepId: string, requestId, response)`
- `sendMessage(stepId: string, message)`
- `setMode(stepId: string, mode)` — writes `interactionMode` to the step instead of task

The event emitter should emit events keyed by `stepId` (but include `taskId` in the payload for UI routing).

**Step 7: Update event emission**

Agent events need to include both `stepId` and `taskId` so the UI can route them. Update `AgentUIEvent` types in `shared/agent-ui-events.ts` to include `stepId`.

**Step 8: Commit**

```bash
git add electron/services/agent-service.ts shared/agent-ui-events.ts
git commit -m "refactor(agent): make agent service step-centric"
```

---

## Task 9: IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add step CRUD handlers**

```typescript
// Steps
ipcMain.handle('steps:findByTaskId', (_, taskId: string) =>
  StepService.findByTaskId(taskId)
);

ipcMain.handle('steps:findById', (_, stepId: string) =>
  StepService.findById(stepId)
);

ipcMain.handle('steps:create', (_, data: NewTaskStep) =>
  StepService.create(data)
);

ipcMain.handle('steps:update', (_, stepId: string, data: UpdateTaskStep) =>
  StepService.update(stepId, data)
);

ipcMain.handle('steps:delete', (_, stepId: string) =>
  StepService.delete(stepId)
);

ipcMain.handle('steps:reorder', (_, taskId: string, stepIds: string[]) =>
  StepService.reorder(taskId, stepIds)
);

ipcMain.handle('steps:resolvePrompt', (_, stepId: string) =>
  StepService.resolveAndValidate(stepId)
);
```

**Step 2: Update agent handlers**

Change `agent:start` to take `stepId`:

```typescript
ipcMain.handle(AGENT_CHANNELS.START, (event, stepId: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) agentService.setMainWindow(window);
  return agentService.start(stepId);
});
```

Similarly update `agent:stop`, `agent:respond`, `agent:sendMessage` to take `stepId`.

Update `agent:getMessages` to use `AgentMessageRepository.findByStepId(stepId)`.

**Step 3: Update task creation handlers**

In `tasks:create` and `tasks:createWithWorktree`:
- After creating the task, create a single step with the task's prompt, interactionMode, modelPreference, agentBackend from the incoming `data`
- If `autoStart` is true, start the step (not the task)

**Step 4: Update `tasks:setMode` and `tasks:setModelPreference`**

These now operate on steps, not tasks. Either remove them (and have the UI call `steps:update` directly) or forward to step update.

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat(ipc): add step handlers, update agent handlers to step-centric"
```

---

## Task 10: Preload Bridge + API Types

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add steps to preload bridge**

In `electron/preload.ts`, add a `steps` section:

```typescript
steps: {
  findByTaskId: (taskId: string) => ipcRenderer.invoke('steps:findByTaskId', taskId),
  findById: (stepId: string) => ipcRenderer.invoke('steps:findById', stepId),
  create: (data: unknown) => ipcRenderer.invoke('steps:create', data),
  update: (stepId: string, data: unknown) => ipcRenderer.invoke('steps:update', stepId, data),
  delete: (stepId: string) => ipcRenderer.invoke('steps:delete', stepId),
  reorder: (taskId: string, stepIds: string[]) => ipcRenderer.invoke('steps:reorder', taskId, stepIds),
  resolvePrompt: (stepId: string) => ipcRenderer.invoke('steps:resolvePrompt', stepId),
},
```

**Step 2: Update agent section**

Change `agent.start`, `agent.stop`, `agent.sendMessage`, `agent.respond` to take `stepId` instead of `taskId`. Update `agent.getMessages` to take `stepId`.

**Step 3: Add step types to api.ts**

Add the `steps` API interface to `src/lib/api.ts` with proper types matching the preload bridge.

Update `agent` API types to reflect the `stepId` parameter changes.

**Step 4: Commit**

```bash
git add electron/preload.ts src/lib/api.ts
git commit -m "feat(bridge): add steps API, update agent API to step-centric"
```

---

## Task 11: React Hooks for Steps

**Files:**
- Create: `src/hooks/use-steps.ts`

**Step 1: Create step hooks**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NewTaskStep, TaskStep, UpdateTaskStep } from '@shared/types';

const api = window.api;

export function useSteps(taskId: string) {
  return useQuery({
    queryKey: ['steps', { taskId }],
    queryFn: () => api.steps.findByTaskId(taskId),
    enabled: !!taskId,
  });
}

export function useStep(stepId: string) {
  return useQuery({
    queryKey: ['steps', stepId],
    queryFn: () => api.steps.findById(stepId),
    enabled: !!stepId,
  });
}

export function useCreateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTaskStep) => api.steps.create(data),
    onSuccess: (step: TaskStep) => {
      queryClient.invalidateQueries({ queryKey: ['steps', { taskId: step.taskId }] });
    },
  });
}

export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: UpdateTaskStep }) =>
      api.steps.update(stepId, data),
    onSuccess: (step: TaskStep) => {
      queryClient.invalidateQueries({ queryKey: ['steps', { taskId: step.taskId }] });
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
    },
  });
}

export function useDeleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => api.steps.delete(stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['steps'] });
    },
  });
}

export function useReorderSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, stepIds }: { taskId: string; stepIds: string[] }) =>
      api.steps.reorder(taskId, stepIds),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['steps', { taskId }] });
    },
  });
}

export function useResolveStepPrompt() {
  return useMutation({
    mutationFn: (stepId: string) => api.steps.resolvePrompt(stepId),
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-steps.ts
git commit -m "feat(hooks): add step React Query hooks"
```

---

## Task 12: Navigation Store — activeStepId

**Files:**
- Modify: `src/stores/navigation.ts`

**Step 1: Add activeStepId to TaskState**

```typescript
interface TaskState {
  rightPane: RightPane | null;
  activeView: TaskViewMode;
  diffView: DiffViewState;
  activeStepId: string | null; // NEW
}
```

Update `defaultTaskState`:

```typescript
const defaultTaskState: TaskState = {
  rightPane: null,
  activeView: undefined,
  diffView: defaultDiffViewState,
  activeStepId: null,
};
```

**Step 2: Add action**

```typescript
setActiveStepId: (taskId: string, stepId: string | null) => void;
```

Add implementation in the store:

```typescript
setActiveStepId: (taskId, stepId) =>
  set((state) => ({
    taskState: {
      ...state.taskState,
      [taskId]: {
        ...defaultTaskState,
        ...state.taskState[taskId],
        activeStepId: stepId,
      },
    },
  })),
```

**Step 3: Add to useTaskState hook**

Return `activeStepId` and `setActiveStepId` from the `useTaskState` hook.

**Step 4: Commit**

```bash
git add src/stores/navigation.ts
git commit -m "feat(stores): add activeStepId to navigation store"
```

---

## Task 13: Update Task Messages Store + Agent Stream Hook

**Files:**
- Modify: `src/stores/task-messages.ts`
- Modify: `src/hooks/use-task-messages.ts`
- Modify: `src/hooks/use-agent.ts`

**Step 1: Update message loading to use stepId**

In `use-task-messages.ts`, change `api.agent.getMessages(taskId)` to `api.agent.getMessages(stepId)` (the active step's ID). The hook signature changes to accept `stepId` in addition to `taskId`.

**Step 2: Update agent controls to use stepId**

In `use-agent.ts`, update `useAgentControls` to call `api.agent.start(stepId)`, `api.agent.stop(stepId)`, `api.agent.sendMessage(stepId, message)`.

**Step 3: Update event routing**

Agent events now include `stepId`. The event handler in `use-task-messages.ts` should check if the event's `stepId` matches the currently active step.

**Step 4: Commit**

```bash
git add src/stores/task-messages.ts src/hooks/use-task-messages.ts src/hooks/use-agent.ts
git commit -m "feat(hooks): update message stream and agent controls for step-centric model"
```

---

## Task 14: StepFlowBar Component

**Files:**
- Create: `src/features/task/ui-step-flow-bar/index.tsx`

**Step 1: Create the component**

A compact horizontal bar showing step nodes as pills connected by lines.

```tsx
import { useCallback } from 'react';

import type { TaskStep, TaskStepStatus } from '@shared/types';

import { useSteps } from '@/hooks/use-steps';
import { useTaskState } from '@/stores/navigation';

function StepPill({
  step,
  isActive,
  onClick,
}: {
  step: TaskStep;
  isActive: boolean;
  onClick: () => void;
}) {
  const statusStyles: Record<TaskStepStatus, string> = {
    pending: 'bg-neutral-800 text-neutral-500 cursor-default',
    ready: 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600 cursor-pointer border border-neutral-500',
    running: 'bg-blue-900 text-blue-200 hover:bg-blue-800 cursor-pointer border border-blue-500 animate-pulse',
    completed: 'bg-green-900 text-green-200 hover:bg-green-800 cursor-pointer border border-green-600',
    errored: 'bg-red-900 text-red-200 hover:bg-red-800 cursor-pointer border border-red-500',
    interrupted: 'bg-yellow-900 text-yellow-200 hover:bg-yellow-800 cursor-pointer border border-yellow-500',
  };

  const statusIcons: Record<TaskStepStatus, string> = {
    pending: '○',
    ready: '◉',
    running: '●',
    completed: '✓',
    errored: '✗',
    interrupted: '⚠',
  };

  return (
    <button
      onClick={onClick}
      disabled={step.status === 'pending'}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusStyles[step.status]} ${isActive ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-neutral-900' : ''}`}
    >
      <span>{statusIcons[step.status]}</span>
      <span className="max-w-[120px] truncate">{step.name}</span>
    </button>
  );
}

function ConnectorLine() {
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-4 bg-neutral-600" />
      <div className="border-y-4 border-l-4 border-y-transparent border-l-neutral-600" />
    </div>
  );
}

export function StepFlowBar({
  taskId,
  onAddStep,
}: {
  taskId: string;
  onAddStep?: () => void;
}) {
  const { data: steps } = useSteps(taskId);
  const { activeStepId, setActiveStepId } = useTaskState(taskId);

  const handleStepClick = useCallback(
    (stepId: string) => setActiveStepId(stepId),
    [setActiveStepId],
  );

  if (!steps || steps.length === 0) return null;

  return (
    <div className="flex items-center gap-0 border-b border-neutral-800 bg-neutral-900/50 px-4 py-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          {index > 0 && <ConnectorLine />}
          <StepPill
            step={step}
            isActive={activeStepId === step.id}
            onClick={() => handleStepClick(step.id)}
          />
        </div>
      ))}
      {onAddStep && (
        <>
          <div className="ml-2" />
          <button
            onClick={onAddStep}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-neutral-600 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-300"
          >
            +
          </button>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/task/ui-step-flow-bar/index.tsx
git commit -m "feat(ui): add StepFlowBar component"
```

---

## Task 15: Integrate StepFlowBar into Task Panel

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Import and add StepFlowBar**

Import the `StepFlowBar` component and `useSteps` hook.

Add the `<StepFlowBar>` between the header div (ends around line 710) and the main content area (starts around line 712):

```tsx
{/* After header, before message stream */}
<StepFlowBar taskId={taskId} onAddStep={handleAddStep} />
```

**Step 2: Wire activeStepId for message stream**

Use `activeStepId` from `useTaskState(taskId)` to determine which step's messages to show. Add auto-select logic:
- If `activeStepId` is null, pick: first running step → first ready step → last completed step → first step
- Pass the active step's ID to the message stream loading hook

**Step 3: Scope the message input**

The message input footer should only be active when the selected step is `running`. Disable when `completed`, `ready`, `pending`, `errored`, `interrupted`.

For `ready` steps with no messages, show a "Start Step" button and resolved prompt preview instead of the message stream.

**Step 4: Update the task panel to read mode/model/backend from the active step**

The `ModeSelector` and `ModelSelector` in `TaskInputFooter` currently read from `task.interactionMode` and `task.modelPreference`. They should now read from the active step. Pass step data down or use the `useStep(activeStepId)` hook.

**Step 5: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat(ui): integrate StepFlowBar into TaskPanel"
```

---

## Task 16: Update Task Creation Flow

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/hooks/use-tasks.ts`

**Step 1: Update the mutation**

In `useCreateTaskWithWorktree()` (in `use-tasks.ts`), the creation data currently includes `interactionMode`, `modelPreference`, `agentBackend`. These fields now need to be passed separately for the auto-created step.

The IPC handler creates the step, so the renderer just needs to pass these fields in the creation payload (the handler will extract them for the step).

**Step 2: Update the new task overlay**

The form still collects `interactionMode`, `modelPreference`, `agentBackend` — these are passed through to the backend. The IPC handler in Task 9 extracts them and creates the step. The overlay code may need minor adjustments to match the new API shape.

**Step 3: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx src/hooks/use-tasks.ts
git commit -m "feat(ui): update task creation to auto-create step"
```

---

## Task 17: Fix All TypeScript References to Removed Task Fields

**Files:**
- Various files that reference `task.sessionId`, `task.interactionMode`, `task.modelPreference`, `task.agentBackend`

**Step 1: Run ts-check and fix all errors**

Run `pnpm ts-check` to find every file referencing the removed fields. Common locations:

- `src/features/task/ui-task-panel/index.tsx` — header chips, footer selectors
- `src/features/agent/` — backend chip, mode selector, model selector
- `src/hooks/use-agent.ts` — mode/model setting
- `src/hooks/use-tasks.ts` — `useSetTaskMode`, `useSetTaskModelPreference`
- `electron/services/agent-service.ts` — already handled in Task 8
- `electron/ipc/handlers.ts` — already handled in Task 9
- Various components that display `task.agentBackend` as a chip

For each: replace task field access with step field access (use `useStep(activeStepId)` or pass step data as props).

**Step 2: Update or remove `useSetTaskMode` and `useSetTaskModelPreference`**

These hooks call `api.tasks.setMode(taskId, mode)` and `api.tasks.setModelPreference(taskId, modelPreference)`. Replace with step-level mutations: `api.steps.update(stepId, { interactionMode: mode })`.

**Step 3: Run lint and typecheck**

```bash
pnpm lint --fix && pnpm ts-check
```

Fix all remaining errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: update all references from task fields to step fields"
```

---

## Task 18: Final Verification

**Step 1: Full lint and typecheck**

```bash
pnpm lint --fix && pnpm ts-check
```

Ensure zero errors.

**Step 2: Build check**

```bash
pnpm build
```

Ensure build succeeds.

**Step 3: Final commit if needed**

Fix any remaining issues and commit.

---

## Dependency Graph

```
Task 1 (shared types) ──┐
Task 2 (schema types) ──┼──→ Task 3 (migration) ──→ Task 4 (step repo) ──→ Task 5 (message repos)
                         │                                                       │
                         └──→ Task 6 (task repo) ──┐                             │
                                                    │                             │
                         Task 7 (step service) ←────┴─────────────────────────────┘
                              │
                              ├──→ Task 8 (agent service refactor)
                              │         │
                              ├──→ Task 9 (IPC handlers) ←── Task 8
                              │         │
                              ├──→ Task 10 (preload + API) ←── Task 9
                              │         │
                              ├──→ Task 11 (React hooks) ←── Task 10
                              │         │
                              ├──→ Task 12 (nav store)
                              │         │
                              ├──→ Task 13 (message store) ←── Task 11, Task 12
                              │         │
                              ├──→ Task 14 (StepFlowBar) ←── Task 11, Task 12
                              │         │
                              ├──→ Task 15 (TaskPanel integration) ←── Task 13, Task 14
                              │         │
                              ├──→ Task 16 (task creation) ←── Task 9, Task 11
                              │         │
                              └──→ Task 17 (fix all references) ←── all above
                                        │
                                  Task 18 (verification) ←── Task 17
```

## Parallelizable Groups

For subagent-driven execution:
- **Group 1** (no deps): Task 1, Task 2
- **Group 2** (after G1): Task 3
- **Group 3** (after G2): Task 4, Task 5, Task 6 (parallel)
- **Group 4** (after G3): Task 7
- **Group 5** (after G4): Task 8, Task 9 (sequential — 8 then 9)
- **Group 6** (after G5): Task 10
- **Group 7** (after G6): Task 11, Task 12 (parallel)
- **Group 8** (after G7): Task 13, Task 14 (parallel)
- **Group 9** (after G8): Task 15, Task 16 (parallel)
- **Group 10** (after G9): Task 17
- **Group 11** (after G10): Task 18
