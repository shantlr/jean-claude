# Task Step Normalized Cache Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate task and task-step reads, mutations, and cache events from React Query document caches to the normalized Legend-State cache.

**Architecture:** Keep Electron main as canonical source for task/step persistence and agent lifecycle writes. Renderer hooks preserve existing names and return shapes while using `useCacheResource`, domain normalizers, relation indexes, and cache events. React Query remains only for paginated completed-task documents and unrelated worktree/document queries until explicitly migrated.

**Tech Stack:** TypeScript, React 19, Electron IPC, Legend-State, Vitest, existing `window.api`, temporary TanStack React Query compatibility.

---

## Execution Notes

- Do not commit unless user explicitly asks. If an execution workflow asks for commits, skip commit steps and report changed files.
- Do not touch `changelogs/`.
- Keep hook names and return shape compatible with current callers.
- Preserve `useAllCompletedTasks` on React Query in this plan unless all paginated behavior is explicitly migrated in a later plan.
- Prefer local mutation ingestion plus cache events over broad `invalidateQueries` for migrated task/step readers.
- Keep worktree diff/status/file-content queries on React Query; those are document resources outside this slice.
- After final implementation, run repository-required verification: `pnpm install`, `pnpm test`, `pnpm lint --fix`, `pnpm ts-check`, `pnpm lint`.

## Current State

- `src/hooks/use-tasks.ts` still uses React Query for `useTasks`, `useProjectTasks`, `useAllActiveTasks`, `useAllCompletedTasks`, `useTask`, and all task mutations.
- `src/hooks/use-steps.ts` still uses React Query for step lists/details and step mutations.
- `shared/cache-events.ts` already defines `task.*` and `step.*` events plus resource-key mapping.
- `src/cache/cache-events.ts` currently applies task/step events directly to `cache$.tasks` / `cache$.steps`, but lacks domain helpers, no-downgrade merge, index maintenance, and resource change version marking.
- `electron/services/cache-event-service.ts` exposes `emitCacheEvent`, but task/step writes in `electron/ipc/handlers.ts`, `electron/services/agent-service.ts`, `electron/services/step-service.ts`, and `electron/services/task-service.ts` do not yet emit task/step cache events.

## Scope

In scope:
- `useTasks`, `useProjectTasks`, `useAllActiveTasks`, `useTask`
- `useSteps`, `useStep`
- task mutations in `src/hooks/use-tasks.ts` that return `Task` or `Task[]`
- step mutations in `src/hooks/use-steps.ts` plus `useSetStepMode` in `src/hooks/use-tasks.ts`
- task/step event application and main-process event emission

Out of scope:
- `useAllCompletedTasks` infinite query migration
- worktree diff/status/file-content document migration
- task summaries, raw messages, and agent message stream migration

## Resource Keys

Use these exact keys:

```ts
export const TASKS_INDEX_KEY = 'tasks';
export const ACTIVE_TASKS_INDEX_KEY = 'tasks:active';

export function taskResourceKey(taskId: string) {
  return `task:${taskId}`;
}

export function projectTasksResourceKey(projectId: string) {
  return `tasks:project:${projectId}`;
}

export const STEPS_INDEX_KEY = 'steps';

export function stepResourceKey(stepId: string) {
  return `step:${stepId}`;
}

export function taskStepsResourceKey(taskId: string) {
  return `steps:task:${taskId}`;
}
```

## Phase 1: Task And Step Domain Helpers

### Task 1: Add Task Domain Tests And Helpers

**Files:**
- Create: `src/cache/domains/tasks.ts`
- Create: `src/cache/domains/tasks.test.ts`
- Modify: `src/cache/cache-types.ts`

**Step 1: Write failing task domain tests**

Create `src/cache/domains/tasks.test.ts` with helpers and tests:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '@shared/types';

import { cache$, resetCache } from '../cache-store';
import {
  ACTIVE_TASKS_INDEX_KEY,
  TASKS_INDEX_KEY,
  appendTaskToProjectIndex,
  ingestProjectTasks,
  ingestTask,
  ingestTasks,
  projectTasksResourceKey,
  removeTask,
  selectActiveTasks,
  selectProjectTasks,
  selectTask,
  selectTasks,
  setProjectTaskIndexIds,
  taskResourceKey,
} from './tasks';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    type: 'agent',
    name: 'Task 1',
    prompt: 'Do work',
    status: 'waiting',
    worktreePath: null,
    startCommitHash: null,
    sourceBranch: null,
    branchName: null,
    hasUnread: false,
    userCompleted: false,
    sessionRules: {},
    workItemIds: null,
    workItemUrls: null,
    pullRequestId: null,
    pullRequestUrl: null,
    pendingMessage: null,
    todoItems: [],
    parentTaskId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

Add tests for:
- key builders return `task:task-1` and `tasks:project:project-1`
- `ingestTask` stores entity and marks detail resource success
- `ingestTasks` fills global index in API order
- `ingestProjectTasks` fills project index and keeps active before completed API order
- `appendTaskToProjectIndex` avoids duplicate IDs and inserts new task at front
- `removeTask` deletes entity and removes ID from all task indexes
- later partial-ish event merge with `undefined` does not clear existing fields

Use this assertion shape for index tests:

```ts
expect(cache$.indexes[projectTasksResourceKey('project-1')].ids.get()).toEqual([
  'task-1',
  'task-2',
]);
expect(selectProjectTasks('project-1').map((task) => task.name)).toEqual([
  'Task 1',
  'Task 2',
]);
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest src/cache/domains/tasks.test.ts`

Expected: FAIL with missing module/functions.

**Step 3: Add minimal task domain implementation**

Create `src/cache/domains/tasks.ts`:

```ts
import type { Task } from '@shared/types';

import { markResourceStale, setIndexResource, setResourceSuccess } from '../cache-actions';
import { cache$ } from '../cache-store';
import { applyEntityPatch, mergeEntitySnapshot } from '../entity-merge';

export const TASKS_INDEX_KEY = 'tasks';
export const ACTIVE_TASKS_INDEX_KEY = 'tasks:active';

export function taskResourceKey(taskId: string) {
  return `task:${taskId}`;
}

export function projectTasksResourceKey(projectId: string) {
  return `tasks:project:${projectId}`;
}

export function mergeTaskSnapshot(task: Task) {
  const current = cache$.tasks[task.id].get();
  cache$.tasks[task.id].set(mergeEntitySnapshot(current ?? ({} as Task), task));
}

export function patchTaskSnapshot(taskId: string, patch: Partial<Task>) {
  const current = cache$.tasks[taskId].get();
  if (!current) return false;
  cache$.tasks[taskId].set(applyEntityPatch(current, patch));
  return true;
}

export function ingestTask(task: Task) {
  mergeTaskSnapshot(task);
  setResourceSuccess(taskResourceKey(task.id));
}

export function ingestTasks(tasks: Task[]) {
  for (const task of tasks) mergeTaskSnapshot(task);
  setIndexResource(TASKS_INDEX_KEY, tasks.map((task) => task.id));
}

export function ingestProjectTasks(projectId: string, tasks: Task[]) {
  for (const task of tasks) mergeTaskSnapshot(task);
  setIndexResource(projectTasksResourceKey(projectId), tasks.map((task) => task.id));
}

export function ingestActiveTasks(tasks: Task[]) {
  for (const task of tasks) mergeTaskSnapshot(task);
  setIndexResource(ACTIVE_TASKS_INDEX_KEY, tasks.map((task) => task.id));
}

export function selectTask(taskId: string) {
  return cache$.tasks[taskId].get();
}

export function selectTasksFromIndex(resourceKey: string) {
  const ids = cache$.indexes[resourceKey].ids.get() ?? [];
  return ids.flatMap((id) => {
    const task = cache$.tasks[id].get();
    return task ? [task] : [];
  });
}

export function selectTasks() {
  return selectTasksFromIndex(TASKS_INDEX_KEY);
}

export function selectProjectTasks(projectId: string) {
  return selectTasksFromIndex(projectTasksResourceKey(projectId));
}

export function selectActiveTasks() {
  return selectTasksFromIndex(ACTIVE_TASKS_INDEX_KEY);
}

export function appendTaskToProjectIndex(task: Task) {
  const key = projectTasksResourceKey(task.projectId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids || ids.includes(task.id)) return;
  cache$.indexes[key].ids.set([task.id, ...ids]);
}

export function setProjectTaskIndexIds(projectId: string, ids: string[]) {
  setIndexResource(projectTasksResourceKey(projectId), ids);
}

export function removeTask(taskId: string) {
  cache$.tasks[taskId].delete();
  for (const [key, index] of Object.entries(cache$.indexes.get() ?? {})) {
    if (key === TASKS_INDEX_KEY || key === ACTIVE_TASKS_INDEX_KEY || key.startsWith('tasks:project:')) {
      cache$.indexes[key].ids.set((index.ids ?? []).filter((id) => id !== taskId));
    }
  }
}

export function markTaskListsStale(projectId?: string) {
  markResourceStale(TASKS_INDEX_KEY);
  markResourceStale(ACTIVE_TASKS_INDEX_KEY);
  if (projectId) markResourceStale(projectTasksResourceKey(projectId));
}
```

Keep formatting simple; run `pnpm lint --fix` later if lines need wrapping.

**Step 4: Run tests**

Run: `pnpm vitest src/cache/domains/tasks.test.ts`

Expected: PASS.

### Task 2: Add Step Domain Tests And Helpers

**Files:**
- Create: `src/cache/domains/steps.ts`
- Create: `src/cache/domains/steps.test.ts`

**Step 1: Write failing step domain tests**

Create `src/cache/domains/steps.test.ts` with a `createStep()` helper that returns full `TaskStep`.

Required tests:
- key builders return `step:step-1` and `steps:task:task-1`
- `ingestStep` stores entity and marks detail resource success
- `ingestTaskSteps` stores ordered task-step index
- `insertStepInTaskIndex` shifts existing steps by sort order and avoids duplicate IDs
- `patchStepSnapshot` preserves fields when patch value is `undefined`
- `removeStep` deletes entity and removes ID from task-step index

**Step 2: Run tests to verify failure**

Run: `pnpm vitest src/cache/domains/steps.test.ts`

Expected: FAIL with missing module/functions.

**Step 3: Add minimal step domain implementation**

Create `src/cache/domains/steps.ts`:

```ts
import type { TaskStep } from '@shared/types';

import { markResourceStale, setIndexResource, setResourceSuccess } from '../cache-actions';
import { cache$ } from '../cache-store';
import { applyEntityPatch, mergeEntitySnapshot } from '../entity-merge';

export const STEPS_INDEX_KEY = 'steps';

export function stepResourceKey(stepId: string) {
  return `step:${stepId}`;
}

export function taskStepsResourceKey(taskId: string) {
  return `steps:task:${taskId}`;
}

export function mergeStepSnapshot(step: TaskStep) {
  const current = cache$.steps[step.id].get();
  cache$.steps[step.id].set(mergeEntitySnapshot(current ?? ({} as TaskStep), step));
}

export function patchStepSnapshot(stepId: string, patch: Partial<TaskStep>) {
  const current = cache$.steps[stepId].get();
  if (!current) return false;
  cache$.steps[stepId].set(applyEntityPatch(current, patch));
  return true;
}

export function ingestStep(step: TaskStep) {
  mergeStepSnapshot(step);
  setResourceSuccess(stepResourceKey(step.id));
}

export function ingestTaskSteps(taskId: string, steps: TaskStep[]) {
  for (const step of steps) mergeStepSnapshot(step);
  setIndexResource(taskStepsResourceKey(taskId), steps.map((step) => step.id));
}

export function selectStep(stepId: string) {
  return cache$.steps[stepId].get();
}

export function selectTaskSteps(taskId: string) {
  const ids = cache$.indexes[taskStepsResourceKey(taskId)].ids.get() ?? [];
  return ids.flatMap((id) => {
    const step = cache$.steps[id].get();
    return step ? [step] : [];
  });
}

export function insertStepInTaskIndex(step: TaskStep) {
  const key = taskStepsResourceKey(step.taskId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids || ids.includes(step.id)) return;
  const next = [...ids];
  next.splice(Math.min(step.sortOrder, next.length), 0, step.id);
  cache$.indexes[key].ids.set(next);
}

export function setTaskStepIndexIds(taskId: string, ids: string[]) {
  setIndexResource(taskStepsResourceKey(taskId), ids);
}

export function removeStep(stepId: string) {
  cache$.steps[stepId].delete();
  for (const [key, index] of Object.entries(cache$.indexes.get() ?? {})) {
    if (key.startsWith('steps:task:')) {
      cache$.indexes[key].ids.set((index.ids ?? []).filter((id) => id !== stepId));
    }
  }
}

export function markStepListsStale(taskId?: string) {
  markResourceStale(STEPS_INDEX_KEY);
  if (taskId) markResourceStale(taskStepsResourceKey(taskId));
}
```

**Step 4: Run tests**

Run: `pnpm vitest src/cache/domains/steps.test.ts`

Expected: PASS.

## Phase 2: Event Application

### Task 3: Replace Direct Task/Step Event Mutations With Domain Helpers

**Files:**
- Modify: `src/cache/cache-events.ts`
- Modify: `src/cache/cache-store.test.ts`
- Modify: `shared/cache-events.test.ts` only if key mapping needs extra coverage

**Step 1: Add failing event tests**

In `src/cache/cache-store.test.ts`, add tests:
- `task.upsert` calls normalized merge, marks `task:${id}` changed/fresh enough for race guard, and stales `tasks` plus `tasks:project:${projectId}`.
- `task.patch` preserves unrelated fields and ignores `undefined` patch values.
- `task.delete` removes entity and index entries.
- `step.upsert` stales `steps:task:${taskId}` and stores entity.
- `step.patch` preserves unrelated fields and marks detail changed.

Use `getResourceChangeVersion` from `src/cache/cache-actions.ts` for detail-change assertions.

**Step 2: Run tests to verify failure**

Run: `pnpm vitest src/cache/cache-store.test.ts`

Expected: FAIL while direct `.assign()` still applies `undefined` patches and does not maintain indexes.

**Step 3: Update `src/cache/cache-events.ts`**

Import task and step helpers:

```ts
import {
  ingestTask,
  markTaskListsStale,
  patchTaskSnapshot,
  removeTask,
  taskResourceKey,
} from './domains/tasks';
import {
  ingestStep,
  markStepListsStale,
  patchStepSnapshot,
  stepResourceKey,
} from './domains/steps';
```

Replace task/step switch cases with:

```ts
case 'task.upsert':
  markResourceChanged(taskResourceKey(event.task.id));
  ingestTask(event.task);
  markTaskListsStale(event.task.projectId);
  break;
case 'task.patch': {
  const resourceKey = taskResourceKey(event.taskId);
  if (patchTaskSnapshot(event.taskId, event.patch)) {
    markResourceChanged(resourceKey);
  } else {
    markResourceStale(resourceKey);
  }
  markTaskListsStale(event.projectId);
  break;
}
case 'task.delete':
  removeTask(event.taskId);
  markResourceStale(taskResourceKey(event.taskId));
  markTaskListsStale(event.projectId);
  break;
case 'step.upsert':
  markResourceChanged(stepResourceKey(event.step.id));
  ingestStep(event.step);
  markStepListsStale(event.step.taskId);
  break;
case 'step.patch': {
  const resourceKey = stepResourceKey(event.stepId);
  if (patchStepSnapshot(event.stepId, event.patch)) {
    markResourceChanged(resourceKey);
  } else {
    markResourceStale(resourceKey);
  }
  markStepListsStale(event.taskId);
  break;
}
```

**Step 4: Run event tests**

Run: `pnpm vitest src/cache/cache-store.test.ts shared/cache-events.test.ts`

Expected: PASS.

## Phase 3: Read Hook Migration

### Task 4: Migrate Basic Task Read Hooks

**Files:**
- Modify: `src/hooks/use-tasks.ts`
- Test: `src/cache/domains/tasks.test.ts`

**Step 1: Replace task query imports only where safe**

Keep React Query imports for mutations, `useAllCompletedTasks`, and document queries. Add normalized cache imports:

```ts
import {
  ACTIVE_TASKS_INDEX_KEY,
  TASKS_INDEX_KEY,
  ingestActiveTasks,
  ingestProjectTasks,
  ingestTask,
  ingestTasks,
  projectTasksResourceKey,
  selectActiveTasks,
  selectProjectTasks,
  selectTask,
  selectTasks,
  taskResourceKey,
} from '@/cache/domains/tasks';
import { useCacheResource } from '@/cache/use-cache-resource';
```

**Step 2: Migrate `useTasks`**

Replace implementation:

```ts
export function useTasks() {
  return useCacheResource({
    key: TASKS_INDEX_KEY,
    load: api.tasks.findAll,
    ingest: ingestTasks,
    select: selectTasks,
  });
}
```

**Step 3: Migrate `useProjectTasks`**

Replace implementation:

```ts
export function useProjectTasks(projectId: string) {
  return useCacheResource({
    key: projectTasksResourceKey(projectId),
    load: () => api.tasks.findByProjectId(projectId),
    ingest: (tasks) => ingestProjectTasks(projectId, tasks),
    enabled: !!projectId,
    select: () => selectProjectTasks(projectId),
  });
}
```

**Step 4: Migrate `useAllActiveTasks`**

Use normalized task entities while preserving `TaskWithProject[]` enough for current callers. If TypeScript shows `TaskWithProject` mismatch, add a local cast in `ingestActiveTasks(tasks as Task[])` and return `selectActiveTasks() as TaskWithProject[]`; do not widen `cache$.tasks` yet.

```ts
export function useAllActiveTasks() {
  return useCacheResource({
    key: ACTIVE_TASKS_INDEX_KEY,
    load: () => api.tasks.findAllActive(),
    ingest: (tasks) => ingestActiveTasks(tasks as unknown as Task[]),
    select: () => selectActiveTasks() as unknown as TaskWithProject[],
  });
}
```

Add TODO comment in code if cast is required:

```ts
// findAllActive returns full task rows plus project fields; API type is narrower today.
```

**Step 5: Migrate `useTask`**

Replace implementation:

```ts
export function useTask(id: string) {
  return useCacheResource({
    key: taskResourceKey(id),
    load: () => api.tasks.findById(id),
    ingest: (task) => {
      if (task) ingestTask(task);
    },
    enabled: !!id,
    select: () => selectTask(id),
  });
}
```

**Step 6: Keep `useAllCompletedTasks` unchanged**

Do not migrate infinite query in this task. Add a short comment above it:

```ts
// Paginated completed-task history remains React Query until document pagination migrates.
```

**Step 7: Verify task read hooks**

Run: `pnpm vitest src/cache/domains/tasks.test.ts src/hooks/use-feed.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 5: Migrate Step Read Hooks

**Files:**
- Modify: `src/hooks/use-steps.ts`
- Test: `src/cache/domains/steps.test.ts`

**Step 1: Add imports**

```ts
import {
  ingestStep,
  ingestTaskSteps,
  selectStep,
  selectTaskSteps,
  stepResourceKey,
  taskStepsResourceKey,
} from '@/cache/domains/steps';
import { useCacheResource } from '@/cache/use-cache-resource';
```

Keep `useMutation` and `useQueryClient` until mutation cleanup tasks finish.

**Step 2: Replace `useSteps`**

```ts
export function useSteps(taskId: string) {
  return useCacheResource({
    key: taskStepsResourceKey(taskId),
    load: () => api.steps.findByTaskId(taskId),
    ingest: (steps) => ingestTaskSteps(taskId, steps),
    enabled: !!taskId,
    select: () => selectTaskSteps(taskId),
  });
}
```

**Step 3: Replace `useStep`**

```ts
export function useStep(stepId: string) {
  return useCacheResource({
    key: stepResourceKey(stepId),
    load: () => api.steps.findById(stepId),
    ingest: (step) => {
      if (step) ingestStep(step);
    },
    enabled: !!stepId,
    select: () => selectStep(stepId),
  });
}
```

**Step 4: Verify step read hooks**

Run: `pnpm vitest src/cache/domains/steps.test.ts src/features/task/ui-step-flow-bar/index.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

## Phase 4: Renderer Mutation Cache Sync

### Task 6: Sync Task Mutation Results Into Normalized Cache

**Files:**
- Modify: `src/hooks/use-tasks.ts`
- Test: `src/cache/domains/tasks.test.ts`

**Step 1: Add small local helper**

Near `invalidateFeedItems`, add:

```ts
function ingestUpdatedTask(task: Task) {
  ingestTask(task);
  markTaskListsStale(task.projectId);
}
```

If `markTaskListsStale` is not imported yet, import it from `@/cache/domains/tasks`.

**Step 2: Update creation mutations**

For `useCreateTask` and `useCreateTaskWithWorktree`, replace broad task invalidations with:

```ts
onSuccess: (task) => {
  ingestTask(task);
  appendTaskToProjectIndex(task);
  markTaskListsStale(task.projectId);
  invalidateFeedItems(queryClient);
}
```

Keep `invalidateFeedItems` until feed task source is fully normalized.

**Step 3: Update simple task-returning mutations**

For these hooks, call `ingestUpdatedTask(task)` before non-migrated invalidations:
- `useUpdateTask`
- `useUpdateTaskPendingMessage`
- `useToggleTaskUserCompleted`
- `useCompleteTask` success path
- `useClearTaskUserCompleted`
- `useAddSessionAllowedTool`
- `useRemoveSessionAllowedTool`
- `useAllowForProject`
- `useAllowForProjectWorktrees`
- `useAllowGlobally`

Remove React Query invalidations for `['tasks']`, `['tasks', id]`, and `['tasks', { projectId }]` after normalized ingestion covers those hooks.

Keep non-migrated invalidations:
- `['globalPermissions']` in `useAllowGlobally`
- worktree document keys in `useDeleteWorktree`
- feed source invalidations via `invalidateFeedItems`

**Step 4: Update delete mutation**

In `useDeleteTask.onSuccess`, call:

```ts
removeTask(id);
markTaskListsStale();
invalidateFeedItems(queryClient);
```

Keep `clearAllRunCommandLogs` and `setRunCommandRunning` unchanged.

**Step 5: Update reorder mutation**

Because `api.tasks.reorder` returns `Task[]`, update success:

```ts
onSuccess: (tasks, { projectId }) => {
  ingestProjectTasks(projectId, tasks);
  markTaskListsStale(projectId);
  invalidateFeedItems(queryClient);
}
```

Do not add optimistic reorder in this task unless tests already cover rollback. Minimal correct success ingestion is enough.

**Step 6: Verify task mutations compile**

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm vitest src/cache/domains/tasks.test.ts src/hooks/use-feed.test.ts`

Expected: PASS.

### Task 7: Sync Step Mutation Results Into Normalized Cache

**Files:**
- Modify: `src/hooks/use-steps.ts`
- Modify: `src/hooks/use-tasks.ts`
- Test: `src/cache/domains/steps.test.ts`

**Step 1: Update `useCreateStep`**

Replace React Query `setQueryData` logic with normalized cache insertion:

```ts
onSuccess: (step: TaskStep) => {
  ingestStep(step);
  insertStepInTaskIndex(step);
  markStepListsStale(step.taskId);
}
```

Keep this immediate index insertion to preserve the existing race fix documented in the old comment.

**Step 2: Update `useUpdateStep` and `useSubmitPrReview`**

Use:

```ts
onSuccess: (step: TaskStep) => {
  ingestStep(step);
  markStepListsStale(step.taskId);
}
```

For `useSubmitPrReview`, keep any task/feed invalidation only until task event emission is complete. Prefer `markTaskListsStale()` after Task/Step event task is done.

**Step 3: Update `useSetStepMode` in `src/hooks/use-tasks.ts`**

Replace step invalidations with:

```ts
onSuccess: (step) => {
  ingestStep(step);
  markStepListsStale(step.taskId);
}
```

Remove the `['tasks']` invalidation unless a test shows task status changes on mode set.

**Step 4: Verify step mutations compile**

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm vitest src/cache/domains/steps.test.ts src/features/task/ui-step-flow-bar/index.test.ts`

Expected: PASS.

## Phase 5: Main-Process Event Emission

### Task 8: Emit Events From IPC Task/Step Writes

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Test: `shared/cache-events.test.ts`

**Step 1: Add helper functions near existing emit helpers**

In `electron/ipc/handlers.ts`, add:

```ts
function emitTaskUpsert(task: Task | undefined | null) {
  if (task) emitCacheEvent({ type: 'task.upsert', task });
}

function emitTaskDelete(taskId: string, projectId?: string) {
  emitCacheEvent({ type: 'task.delete', taskId, projectId });
}

function emitStepUpsert(step: TaskStep | undefined | null) {
  if (step) emitCacheEvent({ type: 'step.upsert', step });
}
```

`Task` and `TaskStep` are already imported in this file via `@shared/types`; add imports if missing.

**Step 2: Wrap task IPC handlers returning task data**

Update handlers to emit after successful writes:
- `tasks:create`: emit created task; if `StepService.create` returns step, emit step too.
- `tasks:createWithWorktree`: emit created task and step.
- `tasks:createPrReview`: emit created task and both created steps.
- `tasks:update`: await update, emit task, return task.
- `tasks:updatePendingMessage`: await update, emit task, return task.
- `tasks:toggleUserCompleted`: emit updated task.
- `tasks:complete`: emit returned `result.task`.
- `tasks:clearUserCompleted`: emit updated task.
- permission handlers that return `TaskRepository.findById(taskId)`: capture task, emit, return.
- `tasks:reorder`: emit every returned task and return list.

Example:

```ts
ipcMain.handle('tasks:update', async (_, id: string, data: UpdateTask) => {
  const task = await TaskRepository.update(id, data);
  emitTaskUpsert(task);
  return task;
});
```

**Step 3: Wrap delete**

In `tasks:delete`, capture `task?.projectId` before delete and emit after successful `TaskRepository.delete(id)`:

```ts
emitTaskDelete(id, task?.projectId);
```

**Step 4: Wrap step IPC handlers**

Update:
- `steps:setMode`: emit returned step.
- `steps:submitPrReview`: emit returned step; if `StepService.syncTaskStatus` changes task in later task, service event will handle it.
- step create/update handlers wherever registered in `electron/ipc/handlers.ts`: emit returned step.

**Step 5: Verify event keys**

Run: `pnpm vitest shared/cache-events.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 9: Emit Events From Agent/Step/Task Services

**Files:**
- Modify: `electron/services/agent-service.ts`
- Modify: `electron/services/step-service.ts`
- Modify: `electron/services/task-service.ts`
- Test: existing service tests if available; otherwise TypeScript check

**Step 1: Add service-local event helpers**

In each service file that writes task/step data, import:

```ts
import { emitCacheEvent } from './cache-event-service';
```

Then add tiny helpers near top:

```ts
function emitTaskUpsert(task: Task | undefined | null) {
  if (task) emitCacheEvent({ type: 'task.upsert', task });
}

function emitStepUpsert(step: TaskStep | undefined | null) {
  if (step) emitCacheEvent({ type: 'step.upsert', step });
}
```

Use relative import path appropriate to file location.

**Step 2: Emit after `StepService` writes**

In `electron/services/step-service.ts`, emit after:
- `TaskStepRepository.create`
- `TaskStepRepository.update`
- status updates in resolve/complete/error/interrupted flows
- `TaskStepRepository.reorder` for each returned step
- `TaskStepRepository.delete` with `step.delete` event only if shared event type is extended; otherwise mark parent list stale with `resource.invalidate` for `steps:task:${taskId}`.

Do not add a `step.delete` event unless needed; current shared event union does not include one.

**Step 3: Emit after task status writes in services**

In `electron/services/task-service.ts` and `electron/services/agent-service.ts`, when a `TaskRepository.update` returns no value today, change local code to fetch the task after update only where a visible task field changed:

```ts
await TaskRepository.update(taskId, { status: 'running' });
emitTaskUpsert(await TaskRepository.findById(taskId));
```

Apply for visible fields:
- task `status`
- task `name`
- task `hasUnread`
- task `sessionRules`

Do not emit for writes that are immediately followed by another task snapshot emit in the same flow.

**Step 4: Verify service event compilation**

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

## Phase 6: Garbage Collection And Final Verification

### Task 10: Add Task/Step Entity GC Coverage

**Files:**
- Modify: `src/cache/cache-gc.ts`
- Modify: `src/cache/cache-gc.test.ts`

**Step 1: Add tests**

Add tests mirroring project GC:
- task entities retained by `tasks` index
- task entities retained by `tasks:project:${projectId}` index
- task entity removed when no retained detail/index references it
- step entities retained by `steps:task:${taskId}` index
- step entity removed when no retained detail/index references it

**Step 2: Extend `collectUnusedCache`**

Add entity GC configs for tasks and steps using domain key helpers:
- tasks: detail key `taskResourceKey`, retained indexes `tasks`, `tasks:active`, and every `tasks:project:*` index present in `cache$.indexes`
- steps: detail key `stepResourceKey`, retained indexes every `steps:task:*` index present in `cache$.indexes`

Return type may become:

```ts
export type CacheGcResult = {
  resources: string[];
  projects: string[];
  tasks: string[];
  steps: string[];
};
```

Update existing tests to expect `tasks` / `steps` if necessary.

**Step 3: Verify GC tests**

Run: `pnpm vitest src/cache/cache-gc.test.ts`

Expected: PASS.

### Task 11: Final Review And Verification

**Files:**
- No planned code edits.

**Step 1: Run focused tests**

Run: `pnpm vitest src/cache/domains/tasks.test.ts src/cache/domains/steps.test.ts src/cache/cache-store.test.ts src/cache/cache-gc.test.ts src/features/task/ui-step-flow-bar/index.test.ts src/hooks/use-feed.test.ts shared/cache-events.test.ts`

Expected: PASS.

**Step 2: Run repository-required checks**

Run: `pnpm install`

Expected: completes; engine warning for Node 24 may remain.

Run: `pnpm test`

Expected: PASS.

Run: `pnpm lint --fix`

Expected: PASS or auto-fixes formatting/lint.

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

**Step 3: Manual review checklist**

Verify by code inspection:
- `useTasks`, `useProjectTasks`, `useAllActiveTasks`, and `useTask` no longer use React Query for task data.
- `useSteps` and `useStep` no longer use React Query for step data.
- Mutations that return task/step snapshots ingest them into normalized cache.
- React Query invalidations remain only for unmigrated documents: feed, worktree, global permissions, completed pagination.
- Main emits `task.upsert`, `task.delete`, and `step.upsert` after successful writes.
- Task/step event application uses no-downgrade merge helpers and marks detail resources changed for in-flight race guard.
- No `changelogs/` files changed.

## Follow-Up Plan Candidates

- Migrate `useAllCompletedTasks` infinite query to document/index pagination resources.
- Add `step.delete` event if step deletion UI starts depending on normalized cache directly.
- Normalize task feed source so `invalidateFeedItems` can be removed from task mutations.
- Migrate worktree diff/status/file-content documents off React Query.
