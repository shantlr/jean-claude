# Work Activity Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add durable work activity logging and a header-launched overlay for weekly timesheet-style activity summaries.

**Architecture:** Store append-only `work_activity_events` rows in SQLite with denormalized snapshots so reports survive task cleanup. Log events from existing task prompt and PR mutation paths, then render grouped weekly data in a global overlay opened from a header icon.

**Tech Stack:** Electron IPC, Kysely/SQLite, React Query, Zustand overlays, React, Tailwind, Vitest

---

## Reference

- Design: `docs/plans/2026-06-19-work-activity-tracker-design.md`
- Header overlay pattern: `src/routes/__root.tsx`, `src/stores/overlays.ts`
- Usage overlay styling reference: `src/features/usage/ui-usage-overlay/index.tsx`
- Existing settings repository: `electron/database/repositories/settings.ts`
- Agent prompt path: `src/hooks/use-agent.ts`, `electron/ipc/handlers.ts`, `electron/services/agent-service.ts`
- New task path: `src/features/new-task/ui-new-task-overlay/index.tsx`
- PR mutations: `src/hooks/use-pull-requests.ts`

## Task 1: Shared Types And Pure Helpers

**Files:**
- Create: `shared/work-activity-types.ts`
- Create: `shared/work-activity-utils.ts`
- Test: `shared/work-activity-utils.test.ts`

**Step 1: Write failing tests**

Create `shared/work-activity-utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildPromptSnapshot,
  getWeekRange,
  groupWorkActivityEvents,
} from './work-activity-utils';
import type { WorkActivityEvent } from './work-activity-types';

describe('buildPromptSnapshot', () => {
  it('stores first 500 chars and full length', () => {
    const prompt = 'x'.repeat(510);
    expect(buildPromptSnapshot(prompt)).toEqual({
      promptSnippet: 'x'.repeat(500),
      promptLength: 510,
    });
  });
});

describe('getWeekRange', () => {
  it('returns monday start and next monday end', () => {
    expect(getWeekRange('2026-06-19T12:00:00.000Z')).toEqual({
      start: '2026-06-15T00:00:00.000Z',
      end: '2026-06-22T00:00:00.000Z',
    });
  });
});

describe('groupWorkActivityEvents', () => {
  it('groups by day, project, and work item id', () => {
    const events: WorkActivityEvent[] = [
      {
        id: 'event-1',
        occurredAt: '2026-06-19T10:00:00.000Z',
        type: 'task_prompted',
        projectId: 'project-1',
        projectName: 'Jean-Claude',
        providerId: 'provider-1',
        azureOrgId: 'org-1',
        azureProjectId: 'ado-project-1',
        repoId: 'repo-1',
        taskId: 'task-1',
        taskTitle: 'Activity tracker',
        stepId: 'step-1',
        promptSnippet: 'track work',
        promptLength: 10,
        workItemIds: ['123'],
        workItems: [
          {
            id: '123',
            providerId: 'provider-1',
            azureOrgId: 'org-1',
            azureProjectId: 'ado-project-1',
          },
        ],
        pullRequest: null,
        metadata: {},
      },
    ];

    const grouped = groupWorkActivityEvents(events);
    expect(grouped[0]?.date).toBe('2026-06-19');
    expect(grouped[0]?.projects[0]?.name).toBe('Jean-Claude');
    expect(grouped[0]?.projects[0]?.workItems[0]?.id).toBe('123');
    expect(grouped[0]?.projects[0]?.workItems[0]?.events).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run shared/work-activity-utils.test.ts`

Expected: FAIL because files/functions do not exist.

**Step 3: Add shared types**

Create `shared/work-activity-types.ts`:

```ts
export type WorkActivityEventType =
  | 'task_prompted'
  | 'pr_comment_added'
  | 'pr_approved';

export type WorkActivityWorkItem = {
  id: string;
  providerId: string;
  azureOrgId: string;
  azureProjectId: string;
};

export type WorkActivityPullRequest = {
  providerId: string;
  azureOrgId: string;
  azureProjectId: string;
  repoId: string;
  pullRequestId: string;
  title: string | null;
  url: string | null;
};

export type WorkActivityEvent = {
  id: string;
  occurredAt: string;
  type: WorkActivityEventType;
  projectId: string | null;
  projectName: string | null;
  providerId: string | null;
  azureOrgId: string | null;
  azureProjectId: string | null;
  repoId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  stepId: string | null;
  promptSnippet: string | null;
  promptLength: number | null;
  workItemIds: string[];
  workItems: WorkActivityWorkItem[];
  pullRequest: WorkActivityPullRequest | null;
  metadata: Record<string, unknown>;
};

export type NewWorkActivityEvent = Omit<WorkActivityEvent, 'id'> & {
  id?: string;
};

export type WorkActivitySettings = {
  enabled: boolean;
};

export type WorkActivityWeekParams = {
  start: string;
  end: string;
  projectId?: string;
  type?: WorkActivityEventType;
};
```

**Step 4: Add helpers**

Create `shared/work-activity-utils.ts` with:

```ts
import type { WorkActivityEvent } from './work-activity-types';

export const WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT = 500;

export function buildPromptSnapshot(prompt: string) {
  return {
    promptSnippet: prompt.slice(0, WORK_ACTIVITY_PROMPT_SNIPPET_LIMIT),
    promptLength: prompt.length,
  };
}

export function getWeekRange(isoDate: string) {
  const date = new Date(isoDate);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function groupWorkActivityEvents(events: WorkActivityEvent[]) {
  const dayMap = new Map<
    string,
    {
      date: string;
      projects: Array<{
        id: string;
        name: string;
        workItems: Array<{ id: string; events: WorkActivityEvent[] }>;
      }>;
    }
  >();

  for (const event of events) {
    const date = event.occurredAt.slice(0, 10);
    const day = dayMap.get(date) ?? { date, projects: [] };
    dayMap.set(date, day);

    const projectId = event.projectId ?? 'unknown-project';
    const projectName = event.projectName ?? projectId;
    let project = day.projects.find((p) => p.id === projectId);
    if (!project) {
      project = { id: projectId, name: projectName, workItems: [] };
      day.projects.push(project);
    }

    const itemIds = event.workItemIds.length > 0 ? event.workItemIds : ['no-work-item'];
    for (const id of itemIds) {
      let workItem = project.workItems.find((item) => item.id === id);
      if (!workItem) {
        workItem = { id, events: [] };
        project.workItems.push(workItem);
      }
      workItem.events.push(event);
    }
  }

  return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}
```

**Step 5: Run tests**

Run: `pnpm vitest run shared/work-activity-utils.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add shared/work-activity-types.ts shared/work-activity-utils.ts shared/work-activity-utils.test.ts
git commit -m "feat(activity): add work activity shared types"
```

## Task 2: Database Migration And Schema

**Files:**
- Create: `electron/database/migrations/069_work_activity_events.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Add migration**

Create `electron/database/migrations/069_work_activity_events.ts`:

```ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('work_activity_events')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('occurredAt', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('projectId', 'text')
    .addColumn('projectName', 'text')
    .addColumn('providerId', 'text')
    .addColumn('azureOrgId', 'text')
    .addColumn('azureProjectId', 'text')
    .addColumn('repoId', 'text')
    .addColumn('taskId', 'text')
    .addColumn('taskTitle', 'text')
    .addColumn('stepId', 'text')
    .addColumn('promptSnippet', 'text')
    .addColumn('promptLength', 'integer')
    .addColumn('workItemIdsJson', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('workItemsJson', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('pullRequestJson', 'text')
    .addColumn('metadataJson', 'text', (col) => col.notNull().defaultTo('{}'))
    .execute();

  await db.schema
    .createIndex('idx_work_activity_events_occurred_at')
    .on('work_activity_events')
    .column('occurredAt')
    .execute();
  await db.schema
    .createIndex('idx_work_activity_events_type')
    .on('work_activity_events')
    .column('type')
    .execute();
  await db.schema
    .createIndex('idx_work_activity_events_project_id')
    .on('work_activity_events')
    .column('projectId')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('work_activity_events').execute();
}
```

**Step 2: Register migration**

Modify `electron/database/migrator.ts`:

```ts
import * as m069 from './migrations/069_work_activity_events';
```

Add to map after `068_run_command_env_vars`:

```ts
  '069_work_activity_events': m069,
```

**Step 3: Update schema**

Modify `electron/database/schema.ts`:

```ts
export interface Database {
  // ...existing
  work_activity_events: WorkActivityEventTable;
}

export interface WorkActivityEventTable {
  id: Generated<string>;
  occurredAt: string;
  type: string;
  projectId: string | null;
  projectName: string | null;
  providerId: string | null;
  azureOrgId: string | null;
  azureProjectId: string | null;
  repoId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  stepId: string | null;
  promptSnippet: string | null;
  promptLength: number | null;
  workItemIdsJson: string;
  workItemsJson: string;
  pullRequestJson: string | null;
  metadataJson: string;
}

export type WorkActivityEventRow = Selectable<WorkActivityEventTable>;
export type NewWorkActivityEventRow = Insertable<WorkActivityEventTable>;
```

**Step 4: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/database/migrations/069_work_activity_events.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat(activity): add work activity events table"
```

## Task 3: Repository And Settings

**Files:**
- Create: `electron/database/repositories/work-activity.ts`
- Test: `electron/database/repositories/work-activity.test.ts`
- Modify: `shared/types.ts`
- Modify: `electron/database/repositories/settings.ts`

**Step 1: Write repository tests**

Create `electron/database/repositories/work-activity.test.ts` following patterns from `electron/database/repositories/settings.test.ts`.

Test cases:

- `record()` persists JSON fields and `getRange()` deserializes them.
- `getRange()` filters by `[start, end)`.
- `deleteBefore()` removes older events.
- `deleteAll()` removes all events.

Use a complete event fixture with `workItemIds: ['123']`, `workItems: [{ id: '123', providerId: 'provider-1', azureOrgId: 'org-1', azureProjectId: 'project-ado-1' }]`.

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run electron/database/repositories/work-activity.test.ts`

Expected: FAIL because repository does not exist.

**Step 3: Implement repository**

Create `electron/database/repositories/work-activity.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { NewWorkActivityEvent, WorkActivityEvent } from '@shared/work-activity-types';

import { db } from '../index';
import type { WorkActivityEventRow } from '../schema';

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToEvent(row: WorkActivityEventRow): WorkActivityEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    type: row.type as WorkActivityEvent['type'],
    projectId: row.projectId,
    projectName: row.projectName,
    providerId: row.providerId,
    azureOrgId: row.azureOrgId,
    azureProjectId: row.azureProjectId,
    repoId: row.repoId,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    stepId: row.stepId,
    promptSnippet: row.promptSnippet,
    promptLength: row.promptLength,
    workItemIds: parseJson(row.workItemIdsJson, []),
    workItems: parseJson(row.workItemsJson, []),
    pullRequest: parseJson(row.pullRequestJson, null),
    metadata: parseJson(row.metadataJson, {}),
  };
}

export const WorkActivityRepository = {
  async record(event: NewWorkActivityEvent): Promise<WorkActivityEvent> {
    const id = event.id ?? randomUUID();
    await db
      .insertInto('work_activity_events')
      .values({
        id,
        occurredAt: event.occurredAt,
        type: event.type,
        projectId: event.projectId,
        projectName: event.projectName,
        providerId: event.providerId,
        azureOrgId: event.azureOrgId,
        azureProjectId: event.azureProjectId,
        repoId: event.repoId,
        taskId: event.taskId,
        taskTitle: event.taskTitle,
        stepId: event.stepId,
        promptSnippet: event.promptSnippet,
        promptLength: event.promptLength,
        workItemIdsJson: JSON.stringify(event.workItemIds),
        workItemsJson: JSON.stringify(event.workItems),
        pullRequestJson: event.pullRequest ? JSON.stringify(event.pullRequest) : null,
        metadataJson: JSON.stringify(event.metadata),
      })
      .execute();
    return { ...event, id };
  },

  async getRange(params: { start: string; end: string; projectId?: string; type?: string }): Promise<WorkActivityEvent[]> {
    let query = db
      .selectFrom('work_activity_events')
      .selectAll()
      .where('occurredAt', '>=', params.start)
      .where('occurredAt', '<', params.end);
    if (params.projectId) query = query.where('projectId', '=', params.projectId);
    if (params.type) query = query.where('type', '=', params.type);
    const rows = await query.orderBy('occurredAt', 'asc').execute();
    return rows.map(rowToEvent);
  },

  async deleteBefore(before: string): Promise<void> {
    await db.deleteFrom('work_activity_events').where('occurredAt', '<', before).execute();
  },

  async deleteAll(): Promise<void> {
    await db.deleteFrom('work_activity_events').execute();
  },
};
```

**Step 4: Add settings type**

Modify `shared/types.ts` where `AppSettings` and `SETTINGS_DEFINITIONS` live. Add:

```ts
export type WorkActivitySetting = {
  enabled: boolean;
};
```

Add `workActivity` to `AppSettings` and definitions:

```ts
workActivity: {
  defaultValue: { enabled: true },
},
```

If settings definitions require labels/descriptions, follow nearby entries.

**Step 5: Support setting normalization**

Modify `electron/database/repositories/settings.ts`:

```ts
function normalizeWorkActivitySetting(value: unknown): WorkActivitySetting | null {
  if (!isRecord(value)) return null;
  return { enabled: value.enabled !== false };
}
```

Import `WorkActivitySetting` from `@shared/types`, then add in `normalizeSettingValue`:

```ts
if (key === 'workActivity') {
  return normalizeWorkActivitySetting(value) as AppSettings[K];
}
```

**Step 6: Run tests**

Run: `pnpm vitest run electron/database/repositories/work-activity.test.ts electron/database/repositories/settings.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add electron/database/repositories/work-activity.ts electron/database/repositories/work-activity.test.ts shared/types.ts electron/database/repositories/settings.ts
git commit -m "feat(activity): add activity repository"
```

## Task 4: Activity Service And IPC/API

**Files:**
- Create: `electron/services/work-activity-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`
- Create: `src/hooks/use-work-activity.ts`

**Step 1: Implement service**

Create `electron/services/work-activity-service.ts`:

```ts
import type { NewWorkActivityEvent, WorkActivityWeekParams } from '@shared/work-activity-types';

import { SettingsRepository } from '../database/repositories/settings';
import { WorkActivityRepository } from '../database/repositories/work-activity';

export const workActivityService = {
  async record(event: NewWorkActivityEvent) {
    const settings = await SettingsRepository.getAll();
    if (settings.workActivity.enabled === false) return null;
    return WorkActivityRepository.record(event);
  },

  async getRange(params: WorkActivityWeekParams) {
    return WorkActivityRepository.getRange(params);
  },

  async deleteBefore(before: string) {
    return WorkActivityRepository.deleteBefore(before);
  },

  async deleteAll() {
    return WorkActivityRepository.deleteAll();
  },
};
```

**Step 2: Add IPC handlers**

Modify `electron/ipc/handlers.ts`. Import service and types, then register:

```ts
ipcMain.handle('workActivity:record', (_, event: NewWorkActivityEvent) =>
  workActivityService.record(event),
);
ipcMain.handle('workActivity:getRange', (_, params: WorkActivityWeekParams) =>
  workActivityService.getRange(params),
);
ipcMain.handle('workActivity:deleteBefore', (_, before: string) =>
  workActivityService.deleteBefore(before),
);
ipcMain.handle('workActivity:deleteAll', () => workActivityService.deleteAll());
```

Place near other app-level data handlers, before agent handlers is fine.

**Step 3: Add preload bridge**

Modify `electron/preload.ts` exported API object:

```ts
workActivity: {
  record: (event: import('@shared/work-activity-types').NewWorkActivityEvent) =>
    ipcRenderer.invoke('workActivity:record', event),
  getRange: (params: import('@shared/work-activity-types').WorkActivityWeekParams) =>
    ipcRenderer.invoke('workActivity:getRange', params),
  deleteBefore: (before: string) => ipcRenderer.invoke('workActivity:deleteBefore', before),
  deleteAll: () => ipcRenderer.invoke('workActivity:deleteAll'),
},
```

**Step 4: Add renderer API types**

Modify `src/lib/api.ts` imports:

```ts
import type {
  NewWorkActivityEvent,
  WorkActivityEvent,
  WorkActivityWeekParams,
} from '@shared/work-activity-types';
```

Add to `API` interface:

```ts
workActivity: {
  record: (event: NewWorkActivityEvent) => Promise<WorkActivityEvent | null>;
  getRange: (params: WorkActivityWeekParams) => Promise<WorkActivityEvent[]>;
  deleteBefore: (before: string) => Promise<void>;
  deleteAll: () => Promise<void>;
};
```

Add stub in fallback `api` object if this file has dev/test fallback implementations.

**Step 5: Add React Query hooks**

Create `src/hooks/use-work-activity.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { WorkActivityWeekParams } from '@shared/work-activity-types';

export function useWorkActivity(params: WorkActivityWeekParams) {
  return useQuery({
    queryKey: ['work-activity', params],
    queryFn: () => api.workActivity.getRange(params),
  });
}

export function useDeleteWorkActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { before?: string } | undefined) =>
      params?.before
        ? api.workActivity.deleteBefore(params.before)
        : api.workActivity.deleteAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-activity'] });
    },
  });
}
```

**Step 6: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 7: Commit**

```bash
git add electron/services/work-activity-service.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts src/hooks/use-work-activity.ts
git commit -m "feat(activity): expose work activity API"
```

## Task 5: Log Task Prompt Events

**Files:**
- Modify: `electron/services/work-activity-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/hooks/use-agent.ts`

**Step 1: Add service helper for step prompt logging**

In `electron/services/work-activity-service.ts`, add `recordTaskPrompt` that accepts `{ stepId, prompt, occurredAt }`, looks up task step, task, project, and stores denormalized event.

Use repositories already available for tasks/projects/task steps. If repository helpers are missing, use Kysely in service only as last resort.

Rules:

- best effort: catch errors at call site or inside service and log with `dbg`.
- work item ids from `task.workItemIds ?? []`.
- `providerId` from project work item provider or repo provider.
- `azureOrgId` should use provider id/base URL-derived org id only if existing code exposes it; otherwise store provider id as org fallback and add TODO in metadata.
- `azureProjectId` from `project.workItemProjectId ?? project.repoProjectId`.
- prompt snapshot via `buildPromptSnapshot`.

**Step 2: Log follow-up prompts in main process**

Modify `electron/ipc/handlers.ts` `AGENT_CHANNELS.SEND_MESSAGE` handler:

```ts
ipcMain.handle(AGENT_CHANNELS.SEND_MESSAGE, async (_, stepId: string, parts: PromptPart[]) => {
  dbg.ipc('agent:sendMessage %s (parts: %d)', stepId, parts.length);
  void workActivityService.recordTaskPrompt({
    stepId,
    prompt: promptPartsToText(parts),
    occurredAt: new Date().toISOString(),
  });
  return agentService.sendMessage(stepId, parts);
});
```

Add small local helper:

```ts
function promptPartsToText(parts: PromptPart[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : 'text' in part ? part.text : ''))
    .join('\n')
    .trim();
}
```

Adjust helper to match actual `PromptPart` union if TypeScript needs it.

**Step 3: Log new task prompt after task creation succeeds**

In `src/features/new-task/ui-new-task-overlay/index.tsx`, after `mutateAsync(...).then((task) => {`, call `api.workActivity.record(...)` best-effort with the newly created `task` and known draft data.

Use available values:

- `occurredAt`: timestamp captured before `mutateAsync`, e.g. `const submittedAt = new Date().toISOString();`
- `type`: `task_prompted`
- `projectId`: `task.projectId`
- `projectName`: `selectedProject?.name ?? null`
- `taskId`: `task.id`
- `taskTitle`: `task.name ?? null`
- `promptSnippet/promptLength`: `buildPromptSnapshot(finalPrompt)`
- `workItemIds`: current `workItemIds`
- `workItems`: map ids to `{ id, providerId, azureOrgId, azureProjectId }` from selected project context.

Do not await this call. It must not block task creation UX.

**Step 4: Avoid duplicate logging for initial auto-start**

Confirm new task creation does not call `AGENT_CHANNELS.SEND_MESSAGE`. If it does, remove renderer-side logging and log only in main process create-task path. Verify by searching for `agentService.start` in task creation handlers.

**Step 5: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 6: Commit**

```bash
git add electron/services/work-activity-service.ts electron/ipc/handlers.ts src/features/new-task/ui-new-task-overlay/index.tsx src/hooks/use-agent.ts
git commit -m "feat(activity): log task prompts"
```

## Task 6: Log PR Comment And Approval Events

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`

**Step 1: Add local helper**

In `src/hooks/use-pull-requests.ts`, add a helper near PR mutation hooks:

```ts
function buildPrActivityContext({
  repoInfo,
  projectId,
  prId,
  pr,
  workItems,
}: {
  repoInfo: NonNullable<ReturnType<typeof useProjectRepoInfo>>;
  projectId: string;
  prId: number;
  pr?: AzureDevOpsPullRequestDetails | AzureDevOpsPullRequest;
  workItems?: Array<{ id: number | string }>;
}) {
  const workItemIds = (workItems ?? []).map((item) => String(item.id));
  return {
    projectId,
    projectName: null,
    providerId: repoInfo.providerId,
    azureOrgId: repoInfo.providerId,
    azureProjectId: repoInfo.projectId,
    repoId: repoInfo.repoId,
    taskId: null,
    taskTitle: null,
    stepId: null,
    promptSnippet: null,
    promptLength: null,
    workItemIds,
    workItems: workItemIds.map((id) => ({
      id,
      providerId: repoInfo.providerId,
      azureOrgId: repoInfo.providerId,
      azureProjectId: repoInfo.projectId,
    })),
    pullRequest: {
      providerId: repoInfo.providerId,
      azureOrgId: repoInfo.providerId,
      azureProjectId: repoInfo.projectId,
      repoId: repoInfo.repoId,
      pullRequestId: String(prId),
      title: pr?.title ?? null,
      url: pr?.url ?? null,
    },
  };
}
```

If hook typing rejects `ReturnType<typeof useProjectRepoInfo>`, inline repoInfo shape.

**Step 2: Log PR top-level comments**

Modify `useAddPullRequestComment` `onSuccess` to call `api.workActivity.record` with `type: 'pr_comment_added'`.

Use cached PR from query client if available:

```ts
const pr = queryClient.getQueryData<AzureDevOpsPullRequestDetails>(['pull-request', projectId, prId]);
void api.workActivity.record({
  occurredAt: new Date().toISOString(),
  type: 'pr_comment_added',
  ...buildPrActivityContext({ repoInfo: repoInfo!, projectId, prId, pr }),
  metadata: { commentKind: 'thread' },
});
```

**Step 3: Log PR file comments**

Modify `useAddPullRequestFileComment` similarly with metadata:

```ts
metadata: { commentKind: 'file', filePath: params.filePath }
```

Use `onSuccess: (_result, params) => { ... }`.

**Step 4: Log approvals only**

Modify `useVotePullRequest` `onSuccess` after `voteStatus` computed:

```ts
if (voteStatus === 'approved' || voteStatus === 'approved-with-suggestions') {
  const pr = queryClient.getQueryData<AzureDevOpsPullRequestDetails>(['pull-request', projectId, prId]);
  void api.workActivity.record({
    occurredAt: new Date().toISOString(),
    type: 'pr_approved',
    ...buildPrActivityContext({ repoInfo: repoInfo!, projectId, prId, pr }),
    metadata: { vote: params.vote, voteStatus },
  });
}
```

Do not log reset/reject/waiting votes.

**Step 5: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/hooks/use-pull-requests.ts
git commit -m "feat(activity): log pull request review actions"
```

## Task 7: Activity Overlay UI

**Files:**
- Create: `src/features/work-activity/ui-work-activity-overlay/index.tsx`
- Modify: `src/stores/overlays.ts`
- Modify: `src/routes/__root.tsx`
- Modify: `src/layout/ui-header/index.tsx`

**Step 1: Add overlay type**

Modify `src/stores/overlays.ts`:

```ts
  | 'work-activity'
```

**Step 2: Create overlay component**

Create `src/features/work-activity/ui-work-activity-overlay/index.tsx`.

Component requirements:

- Portal overlay like `UsageOverlay`.
- `useKeyboardLayer('dialog', { exclusive: true })`.
- `esc` command closes overlay.
- Week selector: previous week, current week label, next week.
- Fetch events with `useWorkActivity(getWeekRange(selectedDate.toISOString()))`.
- Metrics: events, unique projects, unique work items, unique PRs, unique tasks.
- Group with `groupWorkActivityEvents`.
- Render day -> project -> work item.
- Button `Copy Timesheet` copies compact markdown to clipboard.
- Delete all button uses `useDeleteWorkActivity`; protect with `window.confirm`.

Keep UI minimal. Match existing overlay colors/classes from usage overlay.

**Step 3: Add root container**

Modify `src/routes/__root.tsx` imports:

```ts
import { WorkActivityOverlay } from '@/features/work-activity/ui-work-activity-overlay';
```

Add container near `UsageContainer`:

```tsx
function WorkActivityContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'work-activity');
  const close = useOverlaysStore((s) => s.close);

  if (!isOpen) return null;
  return <WorkActivityOverlay onClose={() => close('work-activity')} />;
}
```

Render it next to `<UsageContainer />`.

**Step 4: Add header icon button**

Modify `src/layout/ui-header/index.tsx`.

Use existing `BarChart3` import. Add:

```tsx
const openOverlay = useOverlaysStore((s) => s.open);
```

Place icon-only button beside usage metrics:

```tsx
<Button
  variant="ghost"
  size="icon"
  title="Work activity"
  onClick={() => openOverlay('work-activity')}
>
  <BarChart3 className="h-4 w-4" />
</Button>
```

Use exact local button props/classes based on nearby header buttons.

**Step 5: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/features/work-activity/ui-work-activity-overlay/index.tsx src/stores/overlays.ts src/routes/__root.tsx src/layout/ui-header/index.tsx
git commit -m "feat(activity): add work activity overlay"
```

## Task 8: Settings Controls

**Files:**
- Modify: `src/features/work-activity/ui-work-activity-overlay/index.tsx`
- Modify: existing settings hook/file if needed

**Step 1: Find settings hook**

Search for `useSettings`, `useUpdateSetting`, or `useUISetting`.

Use existing settings mutation pattern. Do not create duplicate settings API if one already exists.

**Step 2: Add logging toggle**

In activity overlay footer/header, add checkbox/switch:

```tsx
<label className="flex items-center gap-2 text-xs text-ink-2">
  <input
    type="checkbox"
    checked={settings.workActivity.enabled}
    onChange={(event) => updateSetting.mutate({ key: 'workActivity', value: { enabled: event.target.checked } })}
  />
  Log work activity
</label>
```

Adapt to repo's settings hook API.

**Step 3: Add delete before date**

Add date input and button:

- Input stores `YYYY-MM-DD`.
- Button calls `deleteMutation.mutate({ before: new Date(`${date}T00:00:00.000Z`).toISOString() })`.
- Confirm before deleting.

**Step 4: Add raw JSON export**

Add button:

```ts
void navigator.clipboard.writeText(JSON.stringify(events, null, 2));
```

Label: `Copy JSON`.

**Step 5: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/features/work-activity/ui-work-activity-overlay/index.tsx
git commit -m "feat(activity): add activity privacy controls"
```

## Task 9: Final Verification

**Files:**
- Any files changed by lint fix

**Step 1: Install deps**

Run: `pnpm install`

Expected: succeeds; no unexpected lockfile change unless package manager updates metadata.

**Step 2: Run tests**

Run: `pnpm test`

Expected: PASS.

**Step 3: Fix lint**

Run: `pnpm lint --fix`

Expected: fixes formatting/import order if needed.

**Step 4: Type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Final lint**

Run: `pnpm lint`

Expected: PASS.

**Step 6: Inspect diff**

Run: `git status --short && git diff --stat`

Expected: only intended files changed.

**Step 7: Commit verification fixes**

If lint changed files:

```bash
git add <changed-files>
git commit -m "chore(activity): apply verification fixes"
```

Do not commit changelog files unless explicitly requested.
