# Pipeline & Release Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track Azure DevOps build pipelines and release pipelines per-project with adaptive polling, desktop notifications, and an in-app notification center.

**Architecture:** Two new DB tables (`notifications`, `tracked_pipelines`), a polling service in the main process, IPC bridge for renderer communication, a Zustand notification store, and UI components for the header notification bar, notification center overlay, and project pipeline settings.

**Tech Stack:** Kysely (migrations/repositories), Electron IPC, Zustand, React Query, Azure DevOps REST API

---

### Task 1: Database Migration — `notifications` table

**Files:**
- Create: `electron/database/migrations/041_notifications.ts`
- Modify: `electron/database/migrator.ts:41-83`
- Modify: `electron/database/schema.ts:29-46,293-304`

**Step 1: Create the migration file**

Create `electron/database/migrations/041_notifications.ts`:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.references('projects.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('sourceUrl', 'text')
    .addColumn('read', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('meta', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').execute();
}
```

**Step 2: Register the migration in migrator.ts**

In `electron/database/migrator.ts`, add import at line 42 (after the last import):

```typescript
import * as m041 from './migrations/041_notifications';
```

Add to the `migrations` record at line 83 (after the last entry):

```typescript
  '041_notifications': m041,
```

**Step 3: Add schema types**

In `electron/database/schema.ts`, add to the `Database` interface (after line 45 `pr_view_snapshots`):

```typescript
  notifications: NotificationTable;
```

Add the table interface at the end of the file (after line 304):

```typescript
export interface NotificationTable {
  id: Generated<string>;
  projectId: string | null;
  type: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  read: number; // 0/1 boolean
  meta: string | null; // JSON
  createdAt: Generated<string>;
}

export type NotificationRow = Selectable<NotificationTable>;
export type NewNotificationRow = Insertable<NotificationTable>;
export type UpdateNotificationRow = Updateable<NotificationTable>;
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/database/migrations/041_notifications.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat: add notifications database table"
```

---

### Task 2: Database Migration — `tracked_pipelines` table

**Files:**
- Create: `electron/database/migrations/042_tracked_pipelines.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

Create `electron/database/migrations/042_tracked_pipelines.ts`:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('tracked_pipelines')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('azurePipelineId', 'integer', (col) => col.notNull())
    .addColumn('kind', 'text', (col) => col.notNull()) // 'build' | 'release'
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('lastCheckedRunId', 'integer')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tracked_pipelines').execute();
}
```

**Step 2: Register migration and add schema types**

In `electron/database/migrator.ts`, add:

```typescript
import * as m042 from './migrations/042_tracked_pipelines';
```

And in the record:

```typescript
  '042_tracked_pipelines': m042,
```

In `electron/database/schema.ts`, add to the `Database` interface:

```typescript
  tracked_pipelines: TrackedPipelineTable;
```

Add the table interface:

```typescript
export interface TrackedPipelineTable {
  id: Generated<string>;
  projectId: string;
  azurePipelineId: number;
  kind: string; // 'build' | 'release'
  name: string;
  enabled: number; // 0/1
  lastCheckedRunId: number | null;
  createdAt: Generated<string>;
}

export type TrackedPipelineRow = Selectable<TrackedPipelineTable>;
export type NewTrackedPipelineRow = Insertable<TrackedPipelineTable>;
export type UpdateTrackedPipelineRow = Updateable<TrackedPipelineTable>;
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/database/migrations/042_tracked_pipelines.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat: add tracked_pipelines database table"
```

---

### Task 3: Notification Repository

**Files:**
- Create: `electron/database/repositories/notifications.ts`

**Step 1: Create the repository**

Create `electron/database/repositories/notifications.ts`:

```typescript
import { db } from '../index';
import type { NewNotificationRow } from '../schema';

export const NotificationRepository = {
  async create(notification: NewNotificationRow) {
    return db
      .insertInto('notifications')
      .values(notification)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async findAll({ limit = 100 }: { limit?: number } = {}) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  },

  async findByProject(projectId: string, { limit = 100 }: { limit?: number } = {}) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  },

  async markAsRead(id: string) {
    await db
      .updateTable('notifications')
      .set({ read: 1 })
      .where('id', '=', id)
      .execute();
  },

  async markAllAsRead() {
    await db
      .updateTable('notifications')
      .set({ read: 1 })
      .where('read', '=', 0)
      .execute();
  },

  async deleteById(id: string) {
    await db
      .deleteFrom('notifications')
      .where('id', '=', id)
      .execute();
  },

  async deleteOlderThan(isoDate: string) {
    await db
      .deleteFrom('notifications')
      .where('createdAt', '<', isoDate)
      .execute();
  },

  async getUnreadCount() {
    const result = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('read', '=', 0)
      .executeTakeFirstOrThrow();
    return result.count;
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/database/repositories/notifications.ts
git commit -m "feat: add notification repository with CRUD and cleanup"
```

---

### Task 4: Tracked Pipelines Repository

**Files:**
- Create: `electron/database/repositories/tracked-pipelines.ts`

**Step 1: Create the repository**

Create `electron/database/repositories/tracked-pipelines.ts`:

```typescript
import { db } from '../index';
import type { NewTrackedPipelineRow } from '../schema';

export const TrackedPipelineRepository = {
  async findByProject(projectId: string) {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('kind', 'asc')
      .orderBy('name', 'asc')
      .execute();
  },

  async findAllEnabled() {
    return db
      .selectFrom('tracked_pipelines')
      .selectAll()
      .where('enabled', '=', 1)
      .execute();
  },

  async upsertMany(pipelines: NewTrackedPipelineRow[]) {
    if (pipelines.length === 0) return;
    for (const pipeline of pipelines) {
      await db
        .insertInto('tracked_pipelines')
        .values(pipeline)
        .onConflict((oc) =>
          oc
            .columns(['projectId', 'azurePipelineId', 'kind'])
            .doUpdateSet({ name: pipeline.name }),
        )
        .execute();
    }
  },

  async toggleEnabled(id: string, enabled: boolean) {
    await db
      .updateTable('tracked_pipelines')
      .set({ enabled: enabled ? 1 : 0 })
      .where('id', '=', id)
      .execute();
  },

  async updateLastCheckedRunId(id: string, runId: number) {
    await db
      .updateTable('tracked_pipelines')
      .set({ lastCheckedRunId: runId })
      .where('id', '=', id)
      .execute();
  },

  async deleteByProject(projectId: string) {
    await db
      .deleteFrom('tracked_pipelines')
      .where('projectId', '=', projectId)
      .execute();
  },
};
```

**Step 2: Add unique constraint for upsert**

Update the migration `042_tracked_pipelines.ts` to add a unique index after the table creation:

```typescript
  await db.schema
    .createIndex('idx_tracked_pipelines_unique')
    .on('tracked_pipelines')
    .columns(['projectId', 'azurePipelineId', 'kind'])
    .unique()
    .execute();
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/database/repositories/tracked-pipelines.ts electron/database/migrations/042_tracked_pipelines.ts
git commit -m "feat: add tracked pipelines repository with upsert support"
```

---

### Task 5: Shared Types for Notifications and Pipelines

**Files:**
- Create: `shared/notification-types.ts`
- Create: `shared/pipeline-types.ts`

**Step 1: Create notification types**

Create `shared/notification-types.ts`:

```typescript
export type NotificationType =
  | 'pipeline-completed'
  | 'pipeline-failed'
  | 'release-completed'
  | 'release-failed';

export interface AppNotification {
  id: string;
  projectId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  sourceUrl: string | null;
  read: boolean;
  meta: Record<string, unknown> | null;
  createdAt: string;
}
```

**Step 2: Create pipeline types**

Create `shared/pipeline-types.ts`:

```typescript
export type TrackedPipelineKind = 'build' | 'release';

export interface TrackedPipeline {
  id: string;
  projectId: string;
  azurePipelineId: number;
  kind: TrackedPipelineKind;
  name: string;
  enabled: boolean;
  lastCheckedRunId: number | null;
  createdAt: string;
}

export interface AzureBuildDefinition {
  id: number;
  name: string;
  path: string;
  type: string;
}

export interface AzureReleaseDefinition {
  id: number;
  name: string;
  path: string;
}

export interface AzureBuildRun {
  id: number;
  buildNumber: string;
  status: string; // 'completed' | 'inProgress' | 'cancelling' | 'postponed' | 'notStarted' | 'none'
  result: string; // 'succeeded' | 'partiallySucceeded' | 'failed' | 'canceled' | 'none'
  definition: { id: number; name: string };
  sourceBranch: string;
  startTime: string;
  finishTime: string | null;
  url: string;
  _links: { web: { href: string } };
}

export interface AzureRelease {
  id: number;
  name: string;
  status: string; // 'active' | 'abandoned' | 'draft' | 'undefined'
  releaseDefinition: { id: number; name: string };
  environments: Array<{
    id: number;
    name: string;
    status: string; // 'succeeded' | 'rejected' | 'inProgress' | 'notStarted' | 'partiallySucceeded' | 'canceled' | 'queued' | 'scheduled' | 'undefined'
  }>;
  createdOn: string;
  _links: { web: { href: string } };
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add shared/notification-types.ts shared/pipeline-types.ts
git commit -m "feat: add shared types for notifications and pipeline tracking"
```

---

### Task 6: Azure DevOps API — Pipeline and Release Endpoints

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add build pipeline API methods**

Add to the end of `electron/services/azure-devops-service.ts` (before any closing exports):

```typescript
// ─── Pipeline & Release Tracking APIs ────────────────────────────────

export async function listBuildDefinitions(params: {
  providerId: string;
  projectId: string;
}): Promise<AzureBuildDefinition[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/definitions?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list build definitions: ${error}`);
  }

  const data: { value: AzureBuildDefinition[] } = await response.json();
  return data.value;
}

export async function listReleaseDefinitions(params: {
  providerId: string;
  projectId: string;
}): Promise<AzureReleaseDefinition[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  // Release API uses vsrm subdomain
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/definitions?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list release definitions: ${error}`);
  }

  const data: { value: AzureReleaseDefinition[] } = await response.json();
  return data.value;
}

export async function listBuilds(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  minId?: number;
}): Promise<AzureBuildRun[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  let url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds?definitions=${params.definitionId}&api-version=7.0`;
  if (params.minId) {
    url += `&minId=${params.minId}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list builds: ${error}`);
  }

  const data: { value: AzureBuildRun[] } = await response.json();
  return data.value;
}

export async function listReleases(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  minCreatedTime?: string;
}): Promise<AzureRelease[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  let url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases?definitionId=${params.definitionId}&api-version=7.0`;
  if (params.minCreatedTime) {
    url += `&minCreatedTime=${encodeURIComponent(params.minCreatedTime)}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list releases: ${error}`);
  }

  const data: { value: AzureRelease[] } = await response.json();
  return data.value;
}
```

**Step 2: Import the types at the top of the file**

Add to the imports area of `azure-devops-service.ts`:

```typescript
import type {
  AzureBuildDefinition,
  AzureReleaseDefinition,
  AzureBuildRun,
  AzureRelease,
} from '@shared/pipeline-types';
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add Azure DevOps pipeline and release API methods"
```

---

### Task 7: Pipeline Tracking Service

**Files:**
- Create: `electron/services/pipeline-tracking-service.ts`

**Step 1: Create the service**

Create `electron/services/pipeline-tracking-service.ts`:

```typescript
import { BrowserWindow } from 'electron';

import { NotificationRepository } from '../database/repositories/notifications';
import { TrackedPipelineRepository } from '../database/repositories/tracked-pipelines';
import { ProjectRepository } from '../database/repositories/projects';
import { dbg } from '../lib/debug';
import type { TrackedPipelineRow } from '../database/schema';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';
import type { AppNotification } from '@shared/notification-types';

import * as azureDevOps from './azure-devops-service';
import { notificationService } from './notification-service';

const ACTIVE_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_INTERVAL_MS = 5 * 60_000; // 5 minutes
const CLEANUP_MAX_AGE_DAYS = 7;

class PipelineTrackingService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs = IDLE_INTERVAL_MS;
  private isPolling = false;

  start() {
    dbg.main('Pipeline tracking service started');
    this.cleanupOldNotifications();
    this.scheduleNext(IDLE_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(intervalMs: number) {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.currentIntervalMs = intervalMs;
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const enabledPipelines = await TrackedPipelineRepository.findAllEnabled();
      if (enabledPipelines.length === 0) {
        this.switchToIdle();
        return;
      }

      // Group by project to reuse auth
      const byProject = new Map<string, TrackedPipelineRow[]>();
      for (const p of enabledPipelines) {
        const existing = byProject.get(p.projectId) ?? [];
        existing.push(p);
        byProject.set(p.projectId, existing);
      }

      let hasActiveRuns = false;

      for (const [projectId, pipelines] of byProject) {
        const project = await ProjectRepository.findById(projectId);
        if (!project?.repoProviderId || !project?.repoProjectId) continue;

        for (const pipeline of pipelines) {
          try {
            if (pipeline.kind === 'build') {
              const hadActive = await this.checkBuilds(
                project.repoProviderId,
                project.repoProjectId,
                pipeline,
                projectId,
              );
              if (hadActive) hasActiveRuns = true;
            } else {
              const hadActive = await this.checkReleases(
                project.repoProviderId,
                project.repoProjectId,
                pipeline,
                projectId,
              );
              if (hadActive) hasActiveRuns = true;
            }
          } catch (err) {
            dbg.main('Pipeline poll error for %s: %O', pipeline.name, err);
          }
        }
      }

      // Adapt polling interval
      if (hasActiveRuns && this.currentIntervalMs !== ACTIVE_INTERVAL_MS) {
        dbg.main('Switching to active polling interval (30s)');
        this.scheduleNext(ACTIVE_INTERVAL_MS);
      } else if (!hasActiveRuns && this.currentIntervalMs !== IDLE_INTERVAL_MS) {
        this.switchToIdle();
      }
    } finally {
      this.isPolling = false;
    }
  }

  private switchToIdle() {
    if (this.currentIntervalMs !== IDLE_INTERVAL_MS) {
      dbg.main('Switching to idle polling interval (5min)');
      this.scheduleNext(IDLE_INTERVAL_MS);
    }
  }

  private async checkBuilds(
    providerId: string,
    azureProjectId: string,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ): Promise<boolean> {
    const builds = await azureDevOps.listBuilds({
      providerId,
      projectId: azureProjectId,
      definitionId: pipeline.azurePipelineId,
      minId: pipeline.lastCheckedRunId ?? undefined,
    });

    let hasActive = false;
    let maxId = pipeline.lastCheckedRunId ?? 0;

    for (const build of builds) {
      if (build.id > maxId) maxId = build.id;

      if (build.status === 'inProgress') {
        hasActive = true;
        continue;
      }

      // Only notify for completed builds we haven't seen
      if (
        build.status === 'completed' &&
        build.id > (pipeline.lastCheckedRunId ?? 0)
      ) {
        await this.createBuildNotification(build, pipeline, projectId);
      }
    }

    if (maxId > (pipeline.lastCheckedRunId ?? 0)) {
      await TrackedPipelineRepository.updateLastCheckedRunId(pipeline.id, maxId);
    }

    return hasActive;
  }

  private async checkReleases(
    providerId: string,
    azureProjectId: string,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ): Promise<boolean> {
    const releases = await azureDevOps.listReleases({
      providerId,
      projectId: azureProjectId,
      definitionId: pipeline.azurePipelineId,
    });

    let hasActive = false;
    let maxId = pipeline.lastCheckedRunId ?? 0;

    for (const release of releases) {
      if (release.id > maxId) maxId = release.id;

      const activeEnvs = release.environments.filter(
        (e) => e.status === 'inProgress' || e.status === 'queued',
      );
      if (activeEnvs.length > 0) {
        hasActive = true;
        continue;
      }

      if (release.id > (pipeline.lastCheckedRunId ?? 0)) {
        await this.createReleaseNotification(release, pipeline, projectId);
      }
    }

    if (maxId > (pipeline.lastCheckedRunId ?? 0)) {
      await TrackedPipelineRepository.updateLastCheckedRunId(pipeline.id, maxId);
    }

    return hasActive;
  }

  private async createBuildNotification(
    build: AzureBuildRun,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ) {
    const isSuccess = build.result === 'succeeded';
    const type = isSuccess ? 'pipeline-completed' : 'pipeline-failed';
    const title = `${pipeline.name} #${build.buildNumber} ${isSuccess ? 'succeeded' : 'failed'}`;
    const body = `Branch: ${build.sourceBranch.replace('refs/heads/', '')}`;
    const sourceUrl = build._links?.web?.href ?? null;

    const notification = await NotificationRepository.create({
      projectId,
      type,
      title,
      body,
      sourceUrl,
      meta: JSON.stringify({
        pipelineId: pipeline.azurePipelineId,
        buildId: build.id,
        buildNumber: build.buildNumber,
        result: build.result,
        branch: build.sourceBranch,
      }),
    });

    this.emitToRenderer(this.rowToAppNotification(notification));

    notificationService.notify({
      id: `pipeline-${build.id}`,
      title,
      body,
    });
  }

  private async createReleaseNotification(
    release: AzureRelease,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ) {
    const failedEnvs = release.environments.filter(
      (e) => e.status === 'rejected',
    );
    const isSuccess = failedEnvs.length === 0;
    const type = isSuccess ? 'release-completed' : 'release-failed';
    const envSummary = release.environments
      .map((e) => `${e.name}: ${e.status}`)
      .join(', ');
    const title = `${pipeline.name} ${release.name} ${isSuccess ? 'succeeded' : 'failed'}`;
    const body = envSummary;
    const sourceUrl = release._links?.web?.href ?? null;

    const notification = await NotificationRepository.create({
      projectId,
      type,
      title,
      body,
      sourceUrl,
      meta: JSON.stringify({
        pipelineId: pipeline.azurePipelineId,
        releaseId: release.id,
        releaseName: release.name,
        environments: release.environments.map((e) => ({
          name: e.name,
          status: e.status,
        })),
      }),
    });

    this.emitToRenderer(this.rowToAppNotification(notification));

    notificationService.notify({
      id: `release-${release.id}`,
      title,
      body,
    });
  }

  private rowToAppNotification(row: {
    id: string;
    projectId: string | null;
    type: string;
    title: string;
    body: string;
    sourceUrl: string | null;
    read: number;
    meta: string | null;
    createdAt: string;
  }): AppNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as AppNotification['type'],
      title: row.title,
      body: row.body,
      sourceUrl: row.sourceUrl,
      read: row.read === 1,
      meta: row.meta ? JSON.parse(row.meta) : null,
      createdAt: row.createdAt,
    };
  }

  private emitToRenderer(notification: AppNotification) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('notifications:new', notification);
    }
  }

  async discoverPipelines(projectId: string) {
    const project = await ProjectRepository.findById(projectId);
    if (!project?.repoProviderId || !project?.repoProjectId) {
      throw new Error('Project has no linked Azure DevOps repo');
    }

    const [buildDefs, releaseDefs] = await Promise.all([
      azureDevOps
        .listBuildDefinitions({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
        })
        .catch(() => []),
      azureDevOps
        .listReleaseDefinitions({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
        })
        .catch(() => []),
    ]);

    const rows = [
      ...buildDefs.map((d) => ({
        projectId,
        azurePipelineId: d.id,
        kind: 'build' as const,
        name: d.name,
        enabled: 0,
      })),
      ...releaseDefs.map((d) => ({
        projectId,
        azurePipelineId: d.id,
        kind: 'release' as const,
        name: d.name,
        enabled: 0,
      })),
    ];

    await TrackedPipelineRepository.upsertMany(rows);
    return TrackedPipelineRepository.findByProject(projectId);
  }

  private async cleanupOldNotifications() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_MAX_AGE_DAYS);
    await NotificationRepository.deleteOlderThan(cutoff.toISOString());
    dbg.main('Cleaned up notifications older than %d days', CLEANUP_MAX_AGE_DAYS);
  }
}

export const pipelineTrackingService = new PipelineTrackingService();
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS (may need to adjust imports — check that ProjectRepository has `findById`)

**Step 3: Commit**

```bash
git add electron/services/pipeline-tracking-service.ts
git commit -m "feat: add pipeline tracking service with adaptive polling and notifications"
```

---

### Task 8: IPC Handlers for Notifications and Pipelines

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add imports at the top of handlers.ts**

Add with the other service imports:

```typescript
import { NotificationRepository } from '../database/repositories/notifications';
import { TrackedPipelineRepository } from '../database/repositories/tracked-pipelines';
import { pipelineTrackingService } from '../services/pipeline-tracking-service';
```

Add type imports:

```typescript
import type { AppNotification } from '@shared/notification-types';
import type { TrackedPipeline } from '@shared/pipeline-types';
```

**Step 2: Add notification IPC handlers**

Add within the `registerIpcHandlers` function (find a logical location near the end, before the closing brace):

```typescript
  // ─── Notifications ────────────────────────────────────────────────

  ipcMain.handle('notifications:list', async () => {
    const rows = await NotificationRepository.findAll();
    return rows.map((row) => ({
      ...row,
      read: row.read === 1,
      meta: row.meta ? JSON.parse(row.meta) : null,
    })) as AppNotification[];
  });

  ipcMain.handle('notifications:markRead', async (_, id: string | 'all') => {
    if (id === 'all') {
      await NotificationRepository.markAllAsRead();
    } else {
      await NotificationRepository.markAsRead(id);
    }
  });

  ipcMain.handle('notifications:delete', async (_, id: string) => {
    await NotificationRepository.deleteById(id);
  });

  // ─── Tracked Pipelines ────────────────────────────────────────────

  ipcMain.handle(
    'tracked-pipelines:list',
    async (_, projectId: string) => {
      const rows = await TrackedPipelineRepository.findByProject(projectId);
      return rows.map((row) => ({
        ...row,
        enabled: row.enabled === 1,
      })) as TrackedPipeline[];
    },
  );

  ipcMain.handle(
    'tracked-pipelines:toggle',
    async (_, id: string, enabled: boolean) => {
      await TrackedPipelineRepository.toggleEnabled(id, enabled);
    },
  );

  ipcMain.handle(
    'tracked-pipelines:discover',
    async (_, projectId: string) => {
      const rows = await pipelineTrackingService.discoverPipelines(projectId);
      return rows.map((row) => ({
        ...row,
        enabled: row.enabled === 1,
      })) as TrackedPipeline[];
    },
  );
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handlers for notifications and tracked pipelines"
```

---

### Task 9: Preload Bridge and API Types

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add to preload.ts**

Add a new `notifications` namespace and `trackedPipelines` namespace in the `contextBridge.exposeInMainWorld('api', { ... })` object:

```typescript
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    markRead: (id: string | 'all') =>
      ipcRenderer.invoke('notifications:markRead', id),
    delete: (id: string) => ipcRenderer.invoke('notifications:delete', id),
    onNew: (callback: (notification: unknown) => void) => {
      const handler = (_: unknown, notification: unknown) =>
        callback(notification);
      ipcRenderer.on('notifications:new', handler);
      return () =>
        ipcRenderer.removeListener('notifications:new', handler);
    },
  },
  trackedPipelines: {
    list: (projectId: string) =>
      ipcRenderer.invoke('tracked-pipelines:list', projectId),
    toggle: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('tracked-pipelines:toggle', id, enabled),
    discover: (projectId: string) =>
      ipcRenderer.invoke('tracked-pipelines:discover', projectId),
  },
```

**Step 2: Add types to api.ts**

Add the import at the top of `src/lib/api.ts`:

```typescript
import type { AppNotification } from '@shared/notification-types';
import type { TrackedPipeline } from '@shared/pipeline-types';
```

Add to the `Api` interface:

```typescript
  notifications: {
    list: () => Promise<AppNotification[]>;
    markRead: (id: string | 'all') => Promise<void>;
    delete: (id: string) => Promise<void>;
    onNew: (callback: (notification: AppNotification) => void) => () => void;
  };
  trackedPipelines: {
    list: (projectId: string) => Promise<TrackedPipeline[]>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
    discover: (projectId: string) => Promise<TrackedPipeline[]>;
  };
```

Also add fallback implementations in the mock api object at the bottom of the file:

```typescript
  notifications: {
    list: async () => [],
    markRead: async () => {},
    delete: async () => {},
    onNew: () => () => {},
  },
  trackedPipelines: {
    list: async () => [],
    toggle: async () => {},
    discover: async () => [],
  },
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/preload.ts src/lib/api.ts
git commit -m "feat: add preload bridge and API types for notifications and pipelines"
```

---

### Task 10: Start Pipeline Tracking Service on App Launch

**Files:**
- Modify: `electron/main.ts:9-14`

**Step 1: Import and start the service**

Add import at line 14 (after `runCommandService` import):

```typescript
import { pipelineTrackingService } from './services/pipeline-tracking-service';
```

Find the `app.whenReady()` or window creation callback and add after database migration:

```typescript
pipelineTrackingService.start();
```

Find the `app.on('before-quit')` or window close handler and add:

```typescript
pipelineTrackingService.stop();
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: start pipeline tracking service on app launch"
```

---

### Task 11: Notification Store (Zustand)

**Files:**
- Create: `src/stores/notifications.ts`

**Step 1: Create the store**

Create `src/stores/notifications.ts`:

```typescript
import { create } from 'zustand';

import { api } from '@/lib/api';
import type { AppNotification } from '@shared/notification-types';

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;

  // Actions
  loadNotifications: () => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: async () => {
    const notifications = await api.notifications.list();
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  },

  addNotification: (notification) => {
    set((state) => {
      const notifications = [notification, ...state.notifications];
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAsRead: async (id) => {
    await api.notifications.markRead(id);
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAllAsRead: async () => {
    await api.notifications.markRead('all');
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  removeNotification: async (id) => {
    await api.notifications.delete(id);
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },
}));

// Initialize: load notifications and subscribe to new ones
let initialized = false;
export function initNotificationsStore() {
  if (initialized) return;
  initialized = true;

  const store = useNotificationsStore.getState();
  store.loadNotifications();

  api.notifications.onNew((notification) => {
    useNotificationsStore.getState().addNotification(notification);
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/stores/notifications.ts
git commit -m "feat: add Zustand notification store with IPC subscription"
```

---

### Task 12: React Query Hooks for Tracked Pipelines

**Files:**
- Create: `src/hooks/use-tracked-pipelines.ts`

**Step 1: Create the hooks**

Create `src/hooks/use-tracked-pipelines.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useTrackedPipelines(projectId: string) {
  return useQuery({
    queryKey: ['tracked-pipelines', projectId],
    queryFn: () => api.trackedPipelines.list(projectId),
    staleTime: 60_000,
  });
}

export function useToggleTrackedPipeline(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.trackedPipelines.toggle(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
    },
  });
}

export function useDiscoverPipelines(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.trackedPipelines.discover(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/use-tracked-pipelines.ts
git commit -m "feat: add React Query hooks for tracked pipeline management"
```

---

### Task 13: Header Notification Bar UI

**Files:**
- Create: `src/layout/ui-header/notification-bar.tsx`
- Modify: `src/layout/ui-header/index.tsx:121-128`

**Step 1: Create the notification bar component**

Create `src/layout/ui-header/notification-bar.tsx`:

```typescript
import { Bell } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/common/ui/button';
import {
  initNotificationsStore,
  useNotificationsStore,
} from '@/stores/notifications';
import { useOverlaysStore } from '@/stores/overlays';

export function NotificationBar() {
  useEffect(() => {
    initNotificationsStore();
  }, []);

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const openOverlay = useOverlaysStore((s) => s.open);

  const latestNotification = notifications[0] ?? null;

  return (
    <Button
      type="button"
      onClick={() => openOverlay('notification-center')}
      className="flex h-7 max-w-[280px] items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300"
    >
      <Bell className="h-3.5 w-3.5 shrink-0" />
      {unreadCount > 0 && (
        <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
          {unreadCount}
        </span>
      )}
      {latestNotification && (
        <span className="truncate text-xs">
          {latestNotification.title}
        </span>
      )}
    </Button>
  );
}
```

**Step 2: Add NotificationBar to the header**

In `src/layout/ui-header/index.tsx`, add the import:

```typescript
import { NotificationBar } from './notification-bar';
```

Modify the usage display area (lines 121-128) to add NotificationBar before CompletionCostDisplay:

Replace:
```tsx
      {/* Usage display */}
      <div
        className="flex items-center gap-1 px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>
```

With:
```tsx
      {/* Notification bar + Usage display */}
      <div
        className="flex items-center gap-1 px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <NotificationBar />
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>
```

**Step 3: Add `'notification-center'` to the overlay types**

In `src/stores/overlays.ts`, add to `OverlayType`:

```typescript
export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'background-jobs'
  | 'settings'
  | 'project-backlog'
  | 'notification-center';
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/layout/ui-header/notification-bar.tsx src/layout/ui-header/index.tsx src/stores/overlays.ts
git commit -m "feat: add notification bar to app header with unread count"
```

---

### Task 14: Notification Center Overlay

**Files:**
- Create: `src/features/notifications/ui-notification-center/index.tsx`
- Modify: `src/routes/__root.tsx` (render the overlay when active)

**Step 1: Create the notification center overlay**

Create `src/features/notifications/ui-notification-center/index.tsx`:

```typescript
import clsx from 'clsx';
import { CheckCircle, XCircle, Bell, ExternalLink } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { useNotificationsStore } from '@/stores/notifications';
import type { AppNotification } from '@shared/notification-types';

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function groupByDay(notifications: AppNotification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: AppNotification[] }[] = [];
  const todayItems: AppNotification[] = [];
  const yesterdayItems: AppNotification[] = [];
  const olderItems: AppNotification[] = [];

  for (const n of notifications) {
    const date = new Date(n.createdAt);
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) todayItems.push(n);
    else if (date.getTime() === yesterday.getTime()) yesterdayItems.push(n);
    else olderItems.push(n);
  }

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length)
    groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (olderItems.length) groups.push({ label: 'Older', items: olderItems });

  return groups;
}

function NotificationIcon({ type }: { type: string }) {
  if (type.includes('failed')) {
    return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
  }
  return <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />;
}

export function NotificationCenterOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const notifications = useNotificationsStore((s) => s.notifications);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const groups = useMemo(() => groupByDay(notifications), [notifications]);

  useRegisterKeyboardBindings('notification-center', {
    escape: () => {
      onClose();
      return true;
    },
  });

  const handleItemClick = useCallback(
    (notification: AppNotification) => {
      if (!notification.read) {
        markAsRead(notification.id);
      }
      if (notification.sourceUrl) {
        window.open(notification.sourceUrl, '_blank');
      }
    },
    [markAsRead],
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-start justify-end pt-12 pr-4"
          onClick={handleBackdropClick}
          tabIndex={-1}
        >
          <div
            className="flex max-h-[70svh] w-[420px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-neutral-400" />
                <span className="text-sm font-medium text-neutral-200">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <Button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Mark all as read
                </Button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-neutral-500">
                  <Bell className="h-8 w-8" />
                  <span className="text-sm">No notifications yet</span>
                  <span className="text-xs">
                    Enable pipeline tracking in project settings
                  </span>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 bg-neutral-900/95 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 backdrop-blur">
                      {group.label}
                    </div>
                    {group.items.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleItemClick(notification)}
                        className={clsx(
                          'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-800/60',
                          !notification.read &&
                            'border-l-2 border-l-blue-500 bg-neutral-800/30',
                        )}
                      >
                        <NotificationIcon type={notification.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={clsx(
                                'truncate text-sm',
                                notification.read
                                  ? 'text-neutral-400'
                                  : 'font-medium text-neutral-200',
                              )}
                            >
                              {notification.title}
                            </span>
                            <span className="shrink-0 text-[11px] text-neutral-500">
                              {getRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-neutral-500">
                            {notification.body}
                          </p>
                        </div>
                        {notification.sourceUrl && (
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-neutral-600" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
```

**Step 2: Render the overlay in __root.tsx**

In `src/routes/__root.tsx`, find where other overlays are conditionally rendered. Add the import:

```typescript
import { NotificationCenterOverlay } from '@/features/notifications/ui-notification-center';
```

Add alongside other overlay renders (look for patterns like `activeOverlay === 'background-jobs'`):

```tsx
{activeOverlay === 'notification-center' && (
  <NotificationCenterOverlay onClose={() => closeOverlay('notification-center')} />
)}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Run lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/notifications/ui-notification-center/index.tsx src/routes/__root.tsx
git commit -m "feat: add notification center overlay with grouped timeline"
```

---

### Task 15: Project Pipeline Settings UI

**Files:**
- Create: `src/features/project/ui-project-pipeline-settings/index.tsx`
- Modify: `src/features/project/ui-project-settings/index.tsx:24-31,45-53`
- Modify: `src/features/settings/ui-settings-overlay/index.tsx:45-53`

**Step 1: Create the pipeline settings component**

Create `src/features/project/ui-project-pipeline-settings/index.tsx`:

```typescript
import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';

import {
  useTrackedPipelines,
  useToggleTrackedPipeline,
  useDiscoverPipelines,
} from '@/hooks/use-tracked-pipelines';
import { useProject } from '@/hooks/use-projects';
import type { TrackedPipeline } from '@shared/pipeline-types';

function PipelineRow({
  pipeline,
  projectId,
}: {
  pipeline: TrackedPipeline;
  projectId: string;
}) {
  const toggleMutation = useToggleTrackedPipeline(projectId);

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-neutral-200">{pipeline.name}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={pipeline.enabled}
        onClick={() =>
          toggleMutation.mutate({
            id: pipeline.id,
            enabled: !pipeline.enabled,
          })
        }
        disabled={toggleMutation.isPending}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
          pipeline.enabled ? 'bg-blue-600' : 'bg-neutral-700'
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            pipeline.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function ProjectPipelineSettings({
  projectId,
}: {
  projectId: string;
}) {
  const { data: project } = useProject(projectId);
  const { data: pipelines, isLoading } = useTrackedPipelines(projectId);
  const discoverMutation = useDiscoverPipelines(projectId);

  const hasRepoLink = !!(
    project?.repoProviderId &&
    project?.repoProjectId &&
    project?.repoId
  );

  const buildPipelines = useMemo(
    () => (pipelines ?? []).filter((p) => p.kind === 'build'),
    [pipelines],
  );

  const releasePipelines = useMemo(
    () => (pipelines ?? []).filter((p) => p.kind === 'release'),
    [pipelines],
  );

  if (!hasRepoLink) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-200">
          Pipeline Tracking
        </h2>
        <p className="text-sm text-neutral-500">
          Link an Azure DevOps repository in Integrations to track pipelines.
        </p>
      </div>
    );
  }

  const hasPipelines =
    buildPipelines.length > 0 || releasePipelines.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">
          Pipeline Tracking
        </h2>
        <button
          type="button"
          onClick={() => discoverMutation.mutate()}
          disabled={discoverMutation.isPending}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3 w-3 ${discoverMutation.isPending ? 'animate-spin' : ''}`}
          />
          {discoverMutation.isPending ? 'Discovering...' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading pipelines...</p>
      ) : !hasPipelines ? (
        <div className="rounded-lg border border-neutral-800 px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">
            No pipelines found for this repository.
          </p>
          <button
            type="button"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="mt-2 cursor-pointer text-sm text-blue-400 hover:text-blue-300"
          >
            Discover pipelines
          </button>
        </div>
      ) : (
        <>
          {buildPipelines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-400">
                Build Pipelines
              </h3>
              <div className="space-y-1">
                {buildPipelines.map((p) => (
                  <PipelineRow
                    key={p.id}
                    pipeline={p}
                    projectId={projectId}
                  />
                ))}
              </div>
            </div>
          )}

          {releasePipelines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-400">
                Release Pipelines
              </h3>
              <div className="space-y-1">
                {releasePipelines.map((p) => (
                  <PipelineRow
                    key={p.id}
                    pipeline={p}
                    projectId={projectId}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 2: Add "pipelines" to ProjectSettingsMenuItem**

In `src/features/project/ui-project-settings/index.tsx`, update the type (line 24-31):

```typescript
export type ProjectSettingsMenuItem =
  | 'details'
  | 'autocomplete'
  | 'integrations'
  | 'pipelines'
  | 'run-commands'
  | 'skills'
  | 'mcp-overrides'
  | 'danger-zone';
```

Add the import:

```typescript
import { ProjectPipelineSettings } from '@/features/project/ui-project-pipeline-settings';
```

Add the case in the switch statement (after `'integrations'` case, before `'run-commands'`):

```typescript
    case 'pipelines':
      content = <ProjectPipelineSettings projectId={projectId} />;
      break;
```

**Step 3: Add "Pipelines" menu item to settings overlay**

In `src/features/settings/ui-settings-overlay/index.tsx`, update `PROJECT_MENU_ITEMS` (lines 45-53) to add the new item after "Integrations":

```typescript
const PROJECT_MENU_ITEMS: { id: ProjectSettingsMenuItem; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'run-commands', label: 'Run Commands' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp-overrides', label: 'MCP Overrides' },
  { id: 'danger-zone', label: 'Danger Zone' },
];
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Run lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 6: Commit**

```bash
git add src/features/project/ui-project-pipeline-settings/index.tsx src/features/project/ui-project-settings/index.tsx src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat: add pipeline tracking settings to project settings"
```

---

### Task 16: Auto-discover Pipelines on First Visit

**Files:**
- Modify: `src/features/project/ui-project-pipeline-settings/index.tsx`

**Step 1: Add auto-discover on mount when no pipelines exist**

In the `ProjectPipelineSettings` component, add a `useEffect` that triggers discovery when the component mounts and no pipelines have been discovered yet:

```typescript
import { useEffect, useMemo, useRef } from 'react';
```

Add after the hooks:

```typescript
  const hasAutoDiscovered = useRef(false);

  useEffect(() => {
    if (
      hasRepoLink &&
      !isLoading &&
      pipelines !== undefined &&
      pipelines.length === 0 &&
      !hasAutoDiscovered.current
    ) {
      hasAutoDiscovered.current = true;
      discoverMutation.mutate();
    }
  }, [hasRepoLink, isLoading, pipelines]);
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/project/ui-project-pipeline-settings/index.tsx
git commit -m "feat: auto-discover pipelines on first settings visit"
```

---

### Task 17: Final Verification

**Step 1: Run full TypeScript check**

Run: `pnpm ts-check`
Expected: PASS

**Step 2: Run linting**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 3: Verify no import cycles or missing exports**

Run: `pnpm install`
Expected: PASS
