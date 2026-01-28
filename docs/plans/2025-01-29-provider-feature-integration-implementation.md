# Provider Feature Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Link Jean-Claude projects to Azure DevOps repos (for PR creation) and work item sources (for task creation from user stories/bugs).

**Architecture:** Extends the existing project and task entities with nullable link fields. Two independent associations on projects (repo link, work items link) and traceability fields on tasks (work item origin, PR created). Backend uses Azure DevOps REST API v7.0 via existing token/provider auth. UI extends project details page and new task form.

**Tech Stack:** TypeScript, Kysely (SQLite), Electron IPC, React, TanStack React Query, Tailwind CSS, Azure DevOps REST API

**Design doc:** `docs/plans/2025-01-29-provider-feature-integration-design.md`

---

## Phase 1 — Data Model & Project Linking UI

### Task 1: Database Migration

Add new columns to `projects` and `tasks` tables.

**Files:**
- Create: `electron/database/migrations/020_provider_integration.ts`
- Modify: `electron/database/migrator.ts`

**Step 1: Write the migration file**

Create `electron/database/migrations/020_provider_integration.ts`:

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Project repo link columns
  await db.schema
    .alterTable('projects')
    .addColumn('repoProviderId', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('repoProjectId', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('repoProjectName', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('repoId', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('repoName', 'text')
    .execute();

  // Project work items link columns
  await db.schema
    .alterTable('projects')
    .addColumn('workItemProviderId', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('workItemProjectId', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('workItemProjectName', 'text')
    .execute();

  // Task work item and PR tracking columns
  await db.schema
    .alterTable('tasks')
    .addColumn('workItemId', 'text')
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('workItemUrl', 'text')
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('pullRequestId', 'text')
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('pullRequestUrl', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop task columns
  await db.schema.alterTable('tasks').dropColumn('pullRequestUrl').execute();
  await db.schema.alterTable('tasks').dropColumn('pullRequestId').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemUrl').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemId').execute();

  // Drop project work items link columns
  await db.schema.alterTable('projects').dropColumn('workItemProjectName').execute();
  await db.schema.alterTable('projects').dropColumn('workItemProjectId').execute();
  await db.schema.alterTable('projects').dropColumn('workItemProviderId').execute();

  // Drop project repo link columns
  await db.schema.alterTable('projects').dropColumn('repoName').execute();
  await db.schema.alterTable('projects').dropColumn('repoId').execute();
  await db.schema.alterTable('projects').dropColumn('repoProjectName').execute();
  await db.schema.alterTable('projects').dropColumn('repoProjectId').execute();
  await db.schema.alterTable('projects').dropColumn('repoProviderId').execute();
}
```

**Step 2: Register the migration**

In `electron/database/migrator.ts`, add:
- Import: `import * as m020 from './migrations/020_provider_integration';`
- Entry: `'020_provider_integration': m020,` at the end of the migrations object

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/database/migrations/020_provider_integration.ts electron/database/migrator.ts
git commit -m "feat: add migration for provider integration columns"
```

---

### Task 2: Update Schema Types

Update database schema and shared types to include new columns.

**Files:**
- Modify: `electron/database/schema.ts`
- Modify: `shared/types.ts`

**Step 1: Update ProjectTable in schema.ts**

Add after `defaultBranch: string | null;` (line 65):

```typescript
  // Repo link (for PR creation)
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoProjectName: string | null;
  repoId: string | null;
  repoName: string | null;
  // Work items link (for task creation from work items)
  workItemProviderId: string | null;
  workItemProjectId: string | null;
  workItemProjectName: string | null;
```

**Step 2: Update TaskTable in schema.ts**

Add after `sortOrder: number;` (line 85):

```typescript
  // Provider integration tracking
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
```

**Step 3: Update Project type in shared/types.ts**

Add after `defaultBranch: string | null;` (line 80):

```typescript
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoProjectName: string | null;
  repoId: string | null;
  repoName: string | null;
  workItemProviderId: string | null;
  workItemProjectId: string | null;
  workItemProjectName: string | null;
```

**Step 4: Update UpdateProject type in shared/types.ts**

Add after `defaultBranch?: string | null;` (line 108):

```typescript
  repoProviderId?: string | null;
  repoProjectId?: string | null;
  repoProjectName?: string | null;
  repoId?: string | null;
  repoName?: string | null;
  workItemProviderId?: string | null;
  workItemProjectId?: string | null;
  workItemProjectName?: string | null;
```

**Step 5: Update Task type in shared/types.ts**

Add after `sessionAllowedTools: string[];` (line 126):

```typescript
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
```

**Step 6: Update NewTask type in shared/types.ts**

Add after `sessionAllowedTools?: string[];` (line 145):

```typescript
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
```

**Step 7: Update UpdateTask type in shared/types.ts**

Add after `sessionAllowedTools?: string[];` (line 163):

```typescript
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
```

**Step 8: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 9: Commit**

```bash
git add electron/database/schema.ts shared/types.ts
git commit -m "feat: add provider integration fields to Project and Task types"
```

---

### Task 3: Update Task Repository

The task repository has `CreateTaskInput`/`UpdateTaskInput` interfaces and `toTask`/`toDbValues` conversion functions that need the new fields.

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Update CreateTaskInput interface**

Add after `sessionAllowedTools?: string[];` (line 19):

```typescript
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
```

**Step 2: Update UpdateTaskInput interface**

Add after `sessionAllowedTools?: string[];` (line 36):

```typescript
  workItemId?: string | null;
  workItemUrl?: string | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
```

Note: The `toTask` function already uses spread (`...rest`) so the new nullable string columns will pass through automatically—no changes needed to `toTask` or `toDbValues`.

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/database/repositories/tasks.ts
git commit -m "feat: add provider integration fields to task repository"
```

---

### Task 4: Repo Link UI Component

Create the repo link section that goes on the project details page.

**Files:**
- Create: `src/features/project/ui-repo-link/index.tsx`

**Step 1: Create the component**

Create `src/features/project/ui-repo-link/index.tsx`:

```tsx
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { useUpdateProject } from '@/hooks/use-projects';

import type { Project } from '../../../../shared/types';

export function RepoLink({ project }: { project: Project }) {
  const { data: providers } = useProviders();
  const updateProject = useUpdateProject();

  const azureProviders = providers?.filter((p) => p.type === 'azure-devops') ?? [];

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');

  const { data: details, isLoading: detailsLoading } = useProviderDetails(
    selectedProviderId,
    !!selectedProviderId,
  );

  // Reset downstream selections when provider changes
  useEffect(() => {
    setSelectedProjectId('');
    setSelectedRepoId('');
  }, [selectedProviderId]);

  // Reset repo selection when project changes
  useEffect(() => {
    setSelectedRepoId('');
  }, [selectedProjectId]);

  const selectedDevOpsProject = details?.projects.find(
    (p) => p.project.id === selectedProjectId,
  );
  const repos = selectedDevOpsProject?.repos ?? [];

  const isLinked = !!project.repoId;

  async function handleLink() {
    const provider = azureProviders.find((p) => p.id === selectedProviderId);
    const devOpsProject = details?.projects.find(
      (p) => p.project.id === selectedProjectId,
    );
    const repo = repos.find((r) => r.id === selectedRepoId);
    if (!provider || !devOpsProject || !repo) return;

    await updateProject.mutateAsync({
      id: project.id,
      data: {
        repoProviderId: provider.id,
        repoProjectId: devOpsProject.project.id,
        repoProjectName: devOpsProject.project.name,
        repoId: repo.id,
        repoName: repo.name,
      },
    });
  }

  async function handleUnlink() {
    await updateProject.mutateAsync({
      id: project.id,
      data: {
        repoProviderId: null,
        repoProjectId: null,
        repoProjectName: null,
        repoId: null,
        repoName: null,
      },
    });
  }

  if (isLinked) {
    return (
      <div className="rounded-lg border border-neutral-700 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Link2 className="h-4 w-4" />
          Repository
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">
            {project.repoProjectName} / {project.repoName}
          </span>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={updateProject.isPending}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <Link2Off className="h-3 w-3" />
            Unlink
          </button>
        </div>
      </div>
    );
  }

  if (azureProviders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Link2 className="h-4 w-4" />
          Link Repository
        </div>
        <p className="text-xs text-neutral-500">
          Add an Azure DevOps organization in Settings first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-700 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-300">
        <Link2 className="h-4 w-4" />
        Link Repository
      </div>
      <div className="space-y-3">
        {/* Provider selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Organization
          </label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select organization…</option>
            {azureProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project selector */}
        {selectedProviderId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Project
            </label>
            {detailsLoading ? (
              <div className="flex items-center gap-2 py-1.5 text-xs text-neutral-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading projects…
              </div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
              >
                <option value="">Select project…</option>
                {details?.projects.map((p) => (
                  <option key={p.project.id} value={p.project.id}>
                    {p.project.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Repo selector */}
        {selectedProjectId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Repository
            </label>
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
            >
              <option value="">Select repository…</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Link button */}
        {selectedRepoId && (
          <button
            type="button"
            onClick={handleLink}
            disabled={updateProject.isPending}
            className="w-full cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateProject.isPending ? 'Linking…' : 'Link Repository'}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/project/ui-repo-link/index.tsx
git commit -m "feat: add repo link UI component for project details"
```

---

### Task 5: Work Items Link UI Component

Create the work items link section for the project details page. Same cascading pattern as repo link but without the repo selector.

**Files:**
- Create: `src/features/project/ui-work-items-link/index.tsx`

**Step 1: Create the component**

Create `src/features/project/ui-work-items-link/index.tsx`:

```tsx
import { ListTodo, Link2Off, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useProviders, useProviderDetails } from '@/hooks/use-providers';
import { useUpdateProject } from '@/hooks/use-projects';

import type { Project } from '../../../../shared/types';

export function WorkItemsLink({ project }: { project: Project }) {
  const { data: providers } = useProviders();
  const updateProject = useUpdateProject();

  const azureProviders = providers?.filter((p) => p.type === 'azure-devops') ?? [];

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const { data: details, isLoading: detailsLoading } = useProviderDetails(
    selectedProviderId,
    !!selectedProviderId,
  );

  // Reset project selection when provider changes
  useEffect(() => {
    setSelectedProjectId('');
  }, [selectedProviderId]);

  const isLinked = !!project.workItemProjectId;

  async function handleLink() {
    const devOpsProject = details?.projects.find(
      (p) => p.project.id === selectedProjectId,
    );
    if (!devOpsProject) return;

    await updateProject.mutateAsync({
      id: project.id,
      data: {
        workItemProviderId: selectedProviderId,
        workItemProjectId: devOpsProject.project.id,
        workItemProjectName: devOpsProject.project.name,
      },
    });
  }

  async function handleUnlink() {
    await updateProject.mutateAsync({
      id: project.id,
      data: {
        workItemProviderId: null,
        workItemProjectId: null,
        workItemProjectName: null,
      },
    });
  }

  if (isLinked) {
    return (
      <div className="rounded-lg border border-neutral-700 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <ListTodo className="h-4 w-4" />
          Work Items
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">
            {project.workItemProjectName}
          </span>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={updateProject.isPending}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <Link2Off className="h-3 w-3" />
            Unlink
          </button>
        </div>
      </div>
    );
  }

  if (azureProviders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <ListTodo className="h-4 w-4" />
          Link Work Items
        </div>
        <p className="text-xs text-neutral-500">
          Add an Azure DevOps organization in Settings first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-700 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-300">
        <ListTodo className="h-4 w-4" />
        Link Work Items
      </div>
      <div className="space-y-3">
        {/* Provider selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Organization
          </label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select organization…</option>
            {azureProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project selector */}
        {selectedProviderId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Project
            </label>
            {detailsLoading ? (
              <div className="flex items-center gap-2 py-1.5 text-xs text-neutral-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading projects…
              </div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
              >
                <option value="">Select project…</option>
                {details?.projects.map((p) => (
                  <option key={p.project.id} value={p.project.id}>
                    {p.project.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Link button */}
        {selectedProjectId && (
          <button
            type="button"
            onClick={handleLink}
            disabled={updateProject.isPending}
            className="w-full cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateProject.isPending ? 'Linking…' : 'Link Work Items'}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/project/ui-work-items-link/index.tsx
git commit -m "feat: add work items link UI component for project details"
```

---

### Task 6: Integrate Link Components into Project Details Page

Add both link components to the existing project details page.

**Files:**
- Modify: `src/routes/projects/$projectId/details.tsx`

**Step 1: Add imports**

Add after the existing imports (after line 13):

```typescript
import { RepoLink } from '@/features/project/ui-repo-link';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';
```

**Step 2: Add link sections to the page**

Insert between the "Default Branch" section closing `</div>` (around line 191) and the Save button `{hasChanges && (` (around line 194):

```tsx
          {/* Provider Integration */}
          <div className="border-t border-neutral-700 pt-6">
            <h2 className="mb-4 text-lg font-semibold text-neutral-200">
              Integrations
            </h2>
            <div className="space-y-4">
              <RepoLink project={project} />
              <WorkItemsLink project={project} />
            </div>
          </div>
```

Note: The link components handle their own save via `updateProject.mutateAsync`, so they don't need to participate in the page-level `hasChanges` / `handleSave` logic.

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/routes/projects/$projectId/details.tsx
git commit -m "feat: add repo and work items link sections to project details"
```

---

## Phase 2 — Work Items Browser

### Task 7: Azure DevOps Work Items Service

Add `queryWorkItems` to the Azure DevOps service.

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add the AzureDevOpsWorkItem type**

Add after the `AzureDevOpsOrgDetails` interface (after line 30):

```typescript
export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;
    state: string;
    assignedTo?: string;
    description?: string;
  };
}

interface WiqlResponse {
  workItems: Array<{ id: number; url: string }>;
}

interface WorkItemsBatchResponse {
  count: number;
  value: Array<{
    id: number;
    url: string;
    fields: {
      'System.Title': string;
      'System.WorkItemType': string;
      'System.State': string;
      'System.AssignedTo'?: { displayName: string };
      'System.Description'?: string;
    };
  }>;
}
```

**Step 2: Add the queryWorkItems function**

Add before `export async function getProviderDetails` (before line 194):

```typescript
export async function queryWorkItems(params: {
  providerId: string;
  projectId: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
  };
}): Promise<AzureDevOpsWorkItem[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Build WIQL query
  const conditions: string[] = [
    `[System.TeamProject] = '${params.projectId}'`,
  ];
  if (params.filters.states && params.filters.states.length > 0) {
    const stateList = params.filters.states.map((s) => `'${s}'`).join(', ');
    conditions.push(`[System.State] IN (${stateList})`);
  }
  if (params.filters.workItemTypes && params.filters.workItemTypes.length > 0) {
    const typeList = params.filters.workItemTypes
      .map((t) => `'${t}'`)
      .join(', ');
    conditions.push(`[System.WorkItemType] IN (${typeList})`);
  }

  const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

  // Step 1: Execute WIQL query to get work item IDs
  const wiqlResponse = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/wit/wiql?api-version=7.0&$top=50`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: wiql }),
    },
  );

  if (!wiqlResponse.ok) {
    const error = await wiqlResponse.text();
    throw new Error(`Failed to query work items: ${error}`);
  }

  const wiqlData: WiqlResponse = await wiqlResponse.json();

  if (wiqlData.workItems.length === 0) {
    return [];
  }

  // Step 2: Batch fetch work item details
  const ids = wiqlData.workItems.map((wi) => wi.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Title,System.WorkItemType,System.State,System.AssignedTo,System.Description&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  return batchData.value.map((wi) => ({
    id: wi.id,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
    },
  }));
}
```

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add queryWorkItems method to Azure DevOps service"
```

---

### Task 8: Work Items IPC + API Layer

Wire up the work items query through IPC, preload, and renderer API.

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handler**

In `electron/ipc/handlers.ts`, add the import for `queryWorkItems` to the existing azure-devops-service import (line 53-57):

```typescript
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
  queryWorkItems,
} from '../services/azure-devops-service';
```

Then add the handler after the existing Azure DevOps handlers (after line 365):

```typescript
  ipcMain.handle(
    'azureDevOps:queryWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        filters: { states?: string[]; workItemTypes?: string[] };
      },
    ) => queryWorkItems(params),
  );
```

**Step 2: Add preload bridge**

In `electron/preload.ts`, add inside the `azureDevOps` object (after line 103):

```typescript
    queryWorkItems: (params: {
      providerId: string;
      projectId: string;
      filters: { states?: string[]; workItemTypes?: string[] };
    }) => ipcRenderer.invoke('azureDevOps:queryWorkItems', params),
```

**Step 3: Add API types and interface**

In `src/lib/api.ts`, add the `AzureDevOpsWorkItem` type after the `ProviderDetails` interface (after line 82):

```typescript
export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;
    state: string;
    assignedTo?: string;
    description?: string;
  };
}
```

Then add the method to the `azureDevOps` section of the `Api` interface (after line 186):

```typescript
    queryWorkItems: (params: {
      providerId: string;
      projectId: string;
      filters: { states?: string[]; workItemTypes?: string[] };
    }) => Promise<AzureDevOpsWorkItem[]>;
```

Then add the fallback stub in the `azureDevOps` section of the fallback object (after line 381):

```typescript
        queryWorkItems: async () => [],
```

**Step 4: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: wire up work items query through IPC layer"
```

---

### Task 9: Work Items React Query Hook

Create the React Query hook for fetching work items.

**Files:**
- Create: `src/hooks/use-work-items.ts`

**Step 1: Create the hook file**

Create `src/hooks/use-work-items.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';

import { api, type AzureDevOpsWorkItem } from '@/lib/api';

export function useWorkItems(params: {
  providerId: string;
  projectId: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
  };
}) {
  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: [
      'work-items',
      params.providerId,
      params.projectId,
      params.filters,
    ],
    queryFn: () => api.azureDevOps.queryWorkItems(params),
    enabled: !!params.providerId && !!params.projectId,
    staleTime: 60_000, // 1 minute
  });
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/use-work-items.ts
git commit -m "feat: add useWorkItems React Query hook"
```

---

### Task 10: Work Items Browser Component

Create the work items browser panel/dialog for the new task form.

**Files:**
- Create: `src/features/agent/ui-work-items-browser/index.tsx`

**Step 1: Create the component**

Create `src/features/agent/ui-work-items-browser/index.tsx`:

```tsx
import { Bug, FileText, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useWorkItems } from '@/hooks/use-work-items';

import type { AzureDevOpsWorkItem } from '../../../lib/api';

const STATUS_OPTIONS = ['Active', 'New', 'Resolved', 'Closed'];
const TYPE_OPTIONS = ['User Story', 'Bug', 'Task', 'Feature'];

function WorkItemTypeIcon({ type }: { type: string }) {
  if (type === 'Bug') {
    return <Bug className="h-3.5 w-3.5 text-red-400" />;
  }
  return <FileText className="h-3.5 w-3.5 text-blue-400" />;
}

export function WorkItemsBrowser({
  providerId,
  projectId,
  onSelect,
  onClose,
}: {
  providerId: string;
  projectId: string;
  onSelect: (workItem: AzureDevOpsWorkItem) => void;
  onClose: () => void;
}) {
  const [stateFilter, setStateFilter] = useState<string[]>(['Active']);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const { data: workItems, isLoading, error } = useWorkItems({
    providerId,
    projectId,
    filters: {
      states: stateFilter.length > 0 ? stateFilter : undefined,
      workItemTypes: typeFilter.length > 0 ? typeFilter : undefined,
    },
  });

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">
          Select Work Item
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Status
          </label>
          <select
            value={stateFilter[0] ?? ''}
            onChange={(e) =>
              setStateFilter(e.target.value ? [e.target.value] : [])
            }
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-400">
            Type
          </label>
          <select
            value={typeFilter[0] ?? ''}
            onChange={(e) =>
              setTypeFilter(e.target.value ? [e.target.value] : [])
            }
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
          >
            <option value="">All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="max-h-64 overflow-auto rounded-md border border-neutral-700">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading work items…
          </div>
        )}
        {error && (
          <div className="px-3 py-8 text-center text-sm text-red-400">
            Failed to load work items: {error.message}
          </div>
        )}
        {!isLoading && !error && workItems?.length === 0 && (
          <div className="py-8 text-center text-sm text-neutral-500">
            No work items found
          </div>
        )}
        {workItems?.map((wi) => (
          <button
            key={wi.id}
            type="button"
            onClick={() => onSelect(wi)}
            className="flex w-full cursor-pointer items-center gap-3 border-b border-neutral-700 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-neutral-800"
          >
            <span className="w-12 shrink-0 text-xs text-neutral-500">
              {wi.id}
            </span>
            <WorkItemTypeIcon type={wi.fields.workItemType} />
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
              {wi.fields.title}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">
              {wi.fields.state}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/agent/ui-work-items-browser/index.tsx
git commit -m "feat: add work items browser component"
```

---

### Task 11: Integrate Work Items Browser into New Task Form

Add the "From Work Item" button to the new task form and wire up the selection flow.

**Files:**
- Modify: `src/routes/projects/$projectId/tasks/new.tsx`
- Modify: `src/stores/new-task-form.ts`

**Step 1: Add work item fields to the draft store**

In `src/stores/new-task-form.ts`, update the `NewTaskFormDraft` interface (add after `interactionMode: InteractionMode;`):

```typescript
  workItemId: string | null;
  workItemUrl: string | null;
```

And update `defaultDraft` (add after `interactionMode: 'ask',`):

```typescript
  workItemId: null,
  workItemUrl: null,
```

**Step 2: Update the new task form**

In `src/routes/projects/$projectId/tasks/new.tsx`, add imports:

```typescript
import { ListTodo } from 'lucide-react';
import { useState } from 'react';

import { WorkItemsBrowser } from '@/features/agent/ui-work-items-browser';
import { useProject } from '@/hooks/use-projects';
```

Update the component to add the work items browser. Add after the `useNewTaskFormStore` hook:

```typescript
  const { data: project } = useProject(projectId);
  const [showWorkItems, setShowWorkItems] = useState(false);
  const hasWorkItemsLink = !!project?.workItemProviderId && !!project?.workItemProjectId;
```

Also destructure `workItemId` and `workItemUrl` from draft:

```typescript
  const { name, prompt, useWorktree, interactionMode, workItemId, workItemUrl } = draft;
```

Update `handleCreateTask` to include work item fields in the task creation:

```typescript
    const task = await createTask.mutateAsync({
      id: nanoid(),
      projectId,
      name: taskName,
      prompt,
      status: 'waiting',
      interactionMode,
      useWorktree,
      workItemId,
      workItemUrl,
      updatedAt: new Date().toISOString(),
    });
```

Add the work item browser section in the JSX, between the worktree checkbox and the submit row:

```tsx
          {/* Work Items */}
          {hasWorkItemsLink && (
            <div>
              {showWorkItems ? (
                <WorkItemsBrowser
                  providerId={project!.workItemProviderId!}
                  projectId={project!.workItemProjectId!}
                  onSelect={(wi) => {
                    setDraft({
                      name: wi.fields.title.slice(0, 100),
                      prompt: `[AB#${wi.id}] ${wi.fields.title}\n\n${wi.fields.description ?? ''}`.trim(),
                      workItemId: String(wi.id),
                      workItemUrl: wi.url,
                    });
                    setShowWorkItems(false);
                  }}
                  onClose={() => setShowWorkItems(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowWorkItems(true)}
                  className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  <ListTodo className="h-4 w-4" />
                  {workItemId ? `From AB#${workItemId}` : 'From Work Item'}
                </button>
              )}
            </div>
          )}
```

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/routes/projects/$projectId/tasks/new.tsx src/stores/new-task-form.ts
git commit -m "feat: integrate work items browser into new task form"
```

---

## Phase 3 — PR Creation

### Task 12: Azure DevOps Create PR Service

Add `createPullRequest` to the Azure DevOps service.

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add the createPullRequest function**

Add after the `queryWorkItems` function:

```typescript
export async function createPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  isDraft: boolean;
}): Promise<{ id: number; url: string }> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests?api-version=7.0`,
    {
      method: 'POST',
      headers: {
        Authorization: createAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceRefName: `refs/heads/${params.sourceBranch}`,
        targetRefName: `refs/heads/${params.targetBranch}`,
        title: params.title,
        description: params.description,
        isDraft: params.isDraft,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create pull request: ${error}`);
  }

  const pr = await response.json();
  return {
    id: pr.pullRequestId,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
  };
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat: add createPullRequest method to Azure DevOps service"
```

---

### Task 13: Push Branch Service

Add `pushBranch` to the worktree service.

**Files:**
- Modify: `electron/services/worktree-service.ts`

**Step 1: Add the pushBranch function**

Add at the end of the file (before the closing of the module):

```typescript
/**
 * Pushes the current branch to a remote.
 */
export async function pushBranch(params: {
  worktreePath: string;
  branchName: string;
  remote?: string;
}): Promise<void> {
  const remote = params.remote ?? 'origin';
  await execAsync(
    `git push -u ${remote} ${params.branchName}`,
    { cwd: params.worktreePath },
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "feat: add pushBranch method to worktree service"
```

---

### Task 14: PR Creation IPC + API Layer

Wire up PR creation and push branch through IPC, preload, and renderer API.

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers**

In `electron/ipc/handlers.ts`, update the azure-devops-service import to include `createPullRequest`:

```typescript
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
  queryWorkItems,
  createPullRequest,
} from '../services/azure-devops-service';
```

Update the worktree-service import to include `pushBranch`:

```typescript
import {
  createWorktree,
  getWorktreeDiff,
  getWorktreeFileContent,
  getProjectBranches,
  getWorktreeStatus,
  commitWorktreeChanges,
  mergeWorktree,
  pushBranch,
} from '../services/worktree-service';
```

Add handlers after the `azureDevOps:queryWorkItems` handler:

```typescript
  ipcMain.handle(
    'azureDevOps:createPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description: string;
        isDraft: boolean;
      },
    ) => createPullRequest(params),
  );

  ipcMain.handle(
    'tasks:worktree:pushBranch',
    async (
      _,
      taskId: string,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath || !task?.branchName) {
        throw new Error(`Task ${taskId} does not have a worktree with a branch`);
      }
      return pushBranch({
        worktreePath: task.worktreePath,
        branchName: task.branchName,
      });
    },
  );
```

**Step 2: Add preload bridge**

In `electron/preload.ts`, add to the `azureDevOps` object (after the `queryWorkItems` entry):

```typescript
    createPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => ipcRenderer.invoke('azureDevOps:createPullRequest', params),
```

Add to the `tasks.worktree` object (after the `getBranches` entry):

```typescript
      pushBranch: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:pushBranch', taskId),
```

**Step 3: Update API interface**

In `src/lib/api.ts`, add to the `azureDevOps` section of the `Api` interface (after `queryWorkItems`):

```typescript
    createPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => Promise<{ id: number; url: string }>;
```

Add `pushBranch` to the `tasks.worktree` section (after `getBranches`):

```typescript
      pushBranch: (taskId: string) => Promise<void>;
```

Add fallback stubs — in the `azureDevOps` fallback (after `queryWorkItems`):

```typescript
        createPullRequest: async () => {
          throw new Error('API not available');
        },
```

In the `tasks.worktree` fallback (after `getBranches`):

```typescript
          pushBranch: async () => {},
```

**Step 4: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: wire up PR creation and push branch through IPC layer"
```

---

### Task 15: Create PR React Query Hook

Create the mutation hook for PR creation.

**Files:**
- Create: `src/hooks/use-create-pull-request.ts`

**Step 1: Create the hook file**

Create `src/hooks/use-create-pull-request.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function usePushBranch() {
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.worktree.pushBranch(taskId),
  });
}

export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => api.azureDevOps.createPullRequest(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/use-create-pull-request.ts
git commit -m "feat: add useCreatePullRequest and usePushBranch hooks"
```

---

### Task 16: Create PR Dialog Component

Create the PR creation dialog that appears when the user clicks "Create PR".

**Files:**
- Create: `src/features/agent/ui-create-pr-dialog/index.tsx`

**Step 1: Create the component**

Create `src/features/agent/ui-create-pr-dialog/index.tsx`:

```tsx
import { ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  useCreatePullRequest,
  usePushBranch,
} from '@/hooks/use-create-pull-request';
import { useUpdateTask } from '@/hooks/use-tasks';

export function CreatePrDialog({
  isOpen,
  onClose,
  taskId,
  taskName,
  taskPrompt,
  branchName,
  targetBranch,
  workItemId,
  // Project repo link fields
  repoProviderId,
  repoProjectId,
  repoId,
}: {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskName: string | null;
  taskPrompt: string;
  branchName: string;
  targetBranch: string;
  workItemId: string | null;
  repoProviderId: string;
  repoProjectId: string;
  repoId: string;
}) {
  const [title, setTitle] = useState(taskName ?? taskPrompt.split('\n')[0].slice(0, 100));
  const [description, setDescription] = useState(
    workItemId
      ? `AB#${workItemId}\n\n${taskPrompt}`
      : taskPrompt,
  );
  const [isDraft, setIsDraft] = useState(true);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pushBranch = usePushBranch();
  const createPr = useCreatePullRequest();
  const updateTask = useUpdateTask();

  const isPending =
    pushBranch.isPending || createPr.isPending || updateTask.isPending;

  async function handleCreate() {
    setError(null);
    try {
      // Step 1: Push branch
      await pushBranch.mutateAsync(taskId);

      // Step 2: Create PR
      const result = await createPr.mutateAsync({
        providerId: repoProviderId,
        projectId: repoProjectId,
        repoId,
        sourceBranch: branchName,
        targetBranch,
        title,
        description,
        isDraft,
      });

      // Step 3: Save PR info to task
      await updateTask.mutateAsync({
        id: taskId,
        data: {
          pullRequestId: String(result.id),
          pullRequestUrl: result.url,
        },
      });

      setPrUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    }
  }

  if (!isOpen) return null;

  // Success state
  if (prUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-green-400">
            Pull Request Created
          </h2>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex items-center gap-2 text-sm text-blue-400 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Azure DevOps
          </a>
          <button
            type="button"
            onClick={() => {
              setPrUrl(null);
              onClose();
            }}
            className="w-full cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-neutral-200">
          Create Pull Request
        </h2>
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Target branch */}
          <div className="text-xs text-neutral-500">
            {branchName} → {targetBranch}
          </div>

          {/* Draft toggle */}
          <div className="flex items-center gap-2">
            <input
              id="isDraft"
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label
              htmlFor="isDraft"
              className="cursor-pointer text-sm text-neutral-300"
            >
              Create as draft
            </label>
          </div>

          {/* Work item reference */}
          {workItemId && (
            <div className="text-xs text-neutral-500">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !title.trim()}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? 'Creating…' : 'Create PR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/agent/ui-create-pr-dialog/index.tsx
git commit -m "feat: add create PR dialog component"
```

---

### Task 17: Integrate Create PR into Worktree Actions

Add the "Create PR" button to the worktree actions component. It only shows when the project has a linked repo.

**Files:**
- Modify: `src/features/agent/ui-worktree-actions/index.tsx`

**Step 1: Update props interface**

Update `WorktreeActionsProps` to include project repo link fields:

```typescript
interface WorktreeActionsProps {
  taskId: string;
  branchName: string;
  defaultBranch: string | null;
  taskName: string | null;
  taskPrompt: string;
  workItemId: string | null;
  // Project repo link (nullable — only show PR button when linked)
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoId: string | null;
  onMergeComplete: () => void;
}
```

**Step 2: Add imports and state**

Add imports:

```typescript
import { GitCommit, GitMerge, GitPullRequest, Loader2 } from 'lucide-react';
```

```typescript
import { CreatePrDialog } from '../ui-create-pr-dialog';
```

Add to destructured props:

```typescript
  taskPrompt,
  workItemId,
  repoProviderId,
  repoProjectId,
  repoId,
```

Add state:

```typescript
  const [isPrDialogOpen, setIsPrDialogOpen] = useState(false);
  const hasRepoLink = !!repoProviderId && !!repoProjectId && !!repoId;
```

**Step 3: Add Create PR button and dialog**

Add after the Merge button's closing `</div>` (the merge section) and before the Modals comment:

```tsx
      {/* Create PR */}
      {hasRepoLink && (
        <button
          type="button"
          onClick={() => setIsPrDialogOpen(true)}
          disabled={!canMerge}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          title={canMerge ? 'Create pull request' : 'Commit changes first'}
        >
          <GitPullRequest className="h-4 w-4" />
          Create PR
        </button>
      )}
```

Add the PR dialog at the end of the modals section:

```tsx
      {hasRepoLink && (
        <CreatePrDialog
          isOpen={isPrDialogOpen}
          onClose={() => setIsPrDialogOpen(false)}
          taskId={taskId}
          taskName={taskName}
          taskPrompt={taskPrompt}
          branchName={branchName}
          targetBranch={selectedBranch}
          workItemId={workItemId}
          repoProviderId={repoProviderId!}
          repoProjectId={repoProjectId!}
          repoId={repoId!}
        />
      )}
```

**Step 4: Update the parent component that renders WorktreeActions**

The parent that renders `<WorktreeActions>` needs to pass the new props (`taskPrompt`, `workItemId`, `repoProviderId`, `repoProjectId`, `repoId`). Find where `WorktreeActions` is used and add the project's repo link fields and task's work item fields. This will be in the task route file — look for the component invocation and pass the additional props from the loaded project and task data.

To find this, search for `WorktreeActions` usage:

Run: `grep -r "WorktreeActions" src/`

Update the parent call site to pass the new props.

**Step 5: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 6: Commit**

```bash
git add src/features/agent/ui-worktree-actions/index.tsx
git commit -m "feat: add Create PR button to worktree actions"
```

---

### Task 18: PR Badge Component

Create a small badge component that displays a clickable PR link on task views.

**Files:**
- Create: `src/features/agent/ui-pr-badge/index.tsx`

**Step 1: Create the component**

Create `src/features/agent/ui-pr-badge/index.tsx`:

```tsx
import { ExternalLink, GitPullRequest } from 'lucide-react';

export function PrBadge({
  pullRequestId,
  pullRequestUrl,
}: {
  pullRequestId: string;
  pullRequestUrl: string;
}) {
  return (
    <a
      href={pullRequestUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-900"
      title="Open pull request in Azure DevOps"
    >
      <GitPullRequest className="h-3 w-3" />
      PR #{pullRequestId}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/agent/ui-pr-badge/index.tsx
git commit -m "feat: add PR badge component"
```

---

### Task 19: Add PR Indicator to Task List Item

Show a small PR icon in the task list sidebar for tasks that have a PR.

**Files:**
- Modify: `src/features/task/ui-task-list-item/index.tsx`

**Step 1: Add PR indicator**

Add `GitPullRequest` to the lucide-react import:

```typescript
import { AlertCircle, GitBranch, GitPullRequest } from 'lucide-react';
```

Add the PR indicator after the worktree branch span (after line 87, before the `formatRelativeTime` span):

```tsx
      {task.pullRequestUrl && (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <GitPullRequest className="h-3 w-3 shrink-0" />
          <span className="truncate">PR #{task.pullRequestId}</span>
        </span>
      )}
```

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/task/ui-task-list-item/index.tsx
git commit -m "feat: add PR indicator to task list item"
```

---

### Task 20: Final Integration — Update Parent Components

Ensure all parent components that render `WorktreeActions` pass the new required props. Also add the `PrBadge` to the task view header area.

**Files:**
- Modify: The file that renders `<WorktreeActions>` (find via grep)
- Modify: The task view that should show `<PrBadge>`

**Step 1: Find and update the WorktreeActions parent**

Run: `grep -rn "WorktreeActions" src/ --include="*.tsx"` to find all usage sites.

For each site, ensure the following new props are passed:
- `taskPrompt={task.prompt}`
- `workItemId={task.workItemId}`
- `repoProviderId={project.repoProviderId}`
- `repoProjectId={project.repoProjectId}`
- `repoId={project.repoId}`

**Step 2: Add PrBadge to task view**

In the task route file (`src/routes/projects/$projectId/tasks/$taskId.tsx` or similar), add a `<PrBadge>` near the task header when `task.pullRequestId` and `task.pullRequestUrl` are present:

```tsx
import { PrBadge } from '@/features/agent/ui-pr-badge';

// In the JSX, near the task name/header:
{task.pullRequestId && task.pullRequestUrl && (
  <PrBadge
    pullRequestId={task.pullRequestId}
    pullRequestUrl={task.pullRequestUrl}
  />
)}
```

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire up PR creation to task view and worktree actions"
```

---

## Summary

| Task | Phase | Description |
|------|-------|-------------|
| 1 | 1 | Database migration — add columns to projects and tasks |
| 2 | 1 | Update schema and shared types |
| 3 | 1 | Update task repository with new fields |
| 4 | 1 | Repo link UI component |
| 5 | 1 | Work items link UI component |
| 6 | 1 | Integrate link components into project details page |
| 7 | 2 | Azure DevOps `queryWorkItems` service method |
| 8 | 2 | Work items IPC + API layer |
| 9 | 2 | Work items React Query hook |
| 10 | 2 | Work items browser component |
| 11 | 2 | Integrate work items browser into new task form |
| 12 | 3 | Azure DevOps `createPullRequest` service method |
| 13 | 3 | Push branch worktree service method |
| 14 | 3 | PR creation IPC + API layer |
| 15 | 3 | Create PR React Query hooks |
| 16 | 3 | Create PR dialog component |
| 17 | 3 | Integrate Create PR into worktree actions |
| 18 | 3 | PR badge component |
| 19 | 3 | PR indicator in task list item |
| 20 | 3 | Final integration — wire parents and build verification |
