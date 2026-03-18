# Pipelines Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Pipelines overlay to the app header that lets users monitor running pipelines across all projects, view stage-level detail with logs, and trigger new pipeline runs.

**Architecture:** Header button (`Cmd+Shift+P`) opens a full-screen overlay following the Settings overlay pattern (sidebar + content). Left sidebar shows projects with nested pipeline definitions and "Run" buttons. Main area shows a chronological run list with expandable rows revealing stage timelines and logs. New Azure DevOps API methods for build/release detail, timeline, logs, branches, triggering, and canceling.

**Tech Stack:** Electron IPC, Azure DevOps REST API, React Query, Zustand (overlays store), Kysely, lucide-react icons

---

### Task 1: Extend Pipeline Types

**Files:**
- Modify: `shared/pipeline-types.ts`

**Step 1: Add new types for build/release detail, timeline, logs, branches, and trigger params**

Append to the end of `shared/pipeline-types.ts`:

```typescript
// --- Build Detail & Timeline ---

export interface AzureBuildDetail {
  id: number;
  buildNumber: string;
  status: string; // notStarted | inProgress | completed | cancelling
  result: string; // succeeded | partiallySucceeded | failed | canceled | none
  definition: { id: number; name: string };
  sourceBranch: string;
  sourceVersion: string;
  startTime: string | null;
  finishTime: string | null;
  requestedFor: { displayName: string; uniqueName: string };
  url: string;
  _links?: { web?: { href: string } };
}

export interface AzureBuildTimelineRecord {
  id: string;
  parentId: string | null;
  type: string; // Stage | Job | Task
  name: string;
  state: string; // pending | inProgress | completed
  result: string | null; // succeeded | failed | canceled | skipped | abandoned
  startTime: string | null;
  finishTime: string | null;
  order: number;
  log?: { id: number; url: string };
  errorCount: number;
  warningCount: number;
  issues?: Array<{ type: string; message: string }>;
}

export interface AzureBuildTimeline {
  records: AzureBuildTimelineRecord[];
}

// --- Release Detail ---

export interface AzureReleaseDetail {
  id: number;
  name: string;
  status: string;
  releaseDefinition: { id: number; name: string };
  createdBy: { displayName: string; uniqueName: string };
  createdOn: string;
  environments: Array<{
    id: number;
    name: string;
    status: string;
    deploySteps: Array<{
      status: string;
      operationStatus: string;
      releaseDeployPhases: Array<{
        name: string;
        status: string;
        deploymentJobs: Array<{
          job: { name: string; status: string };
          tasks: Array<{
            name: string;
            status: string;
            startTime: string | null;
            finishTime: string | null;
            logUrl: string | null;
            issues: Array<{ issueType: string; message: string }>;
          }>;
        }>;
      }>;
    }>;
  }>;
  artifacts: Array<{
    alias: string;
    type: string;
    definitionReference: Record<string, { id: string; name: string }>;
  }>;
  _links?: { web?: { href: string } };
}

// --- Branches ---

export interface AzureGitRef {
  name: string; // refs/heads/main
  objectId: string;
}

// --- Build Definition Parameters ---

export interface AzureBuildDefinitionParameter {
  name: string;
  displayName: string;
  type: 'string' | 'boolean' | 'number';
  defaultValue: string;
  allowedValues?: string[];
}

export interface AzureBuildDefinitionDetail {
  id: number;
  name: string;
  variables?: Record<
    string,
    {
      value: string;
      allowOverride?: boolean;
      isSecret?: boolean;
    }
  >;
  processParameters?: {
    inputs: Array<{
      name: string;
      label: string;
      type: string; // string | boolean | pickList | radio
      defaultValue: string;
      options?: Record<string, string>;
      helpMarkDown?: string;
    }>;
  };
}

// --- Trigger Params ---

export interface QueueBuildParams {
  providerId: string;
  projectId: string;
  definitionId: number;
  sourceBranch: string;
  parameters?: Record<string, string>;
}

export interface CreateReleaseParams {
  providerId: string;
  projectId: string;
  definitionId: number;
  description?: string;
}

// --- Pipeline Runs (unified for UI) ---

export type PipelineRunKind = 'build' | 'release';

export interface PipelineRunSummary {
  id: number;
  kind: PipelineRunKind;
  definitionId: number;
  definitionName: string;
  displayNumber: string;
  status: string;
  result: string | null;
  sourceBranch: string | null;
  startTime: string | null;
  finishTime: string | null;
  triggeredBy: string | null;
  webUrl: string | null;
  projectId: string; // jean-claude project ID (not Azure)
}
```

**Step 2: Commit**

```bash
git add shared/pipeline-types.ts
git commit -m "feat(pipelines): add types for build/release detail, timeline, logs, branches, and trigger params"
```

---

### Task 2: Add Azure DevOps Service Methods

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add new API methods**

Append these functions after the existing `listReleases` function (around line 1850):

```typescript
export async function getBuild(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<AzureBuildDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build: ${error}`);
  }

  return response.json();
}

export async function getBuildTimeline(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<AzureBuildTimeline> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}/timeline?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build timeline: ${error}`);
  }

  return response.json();
}

export async function getBuildLog(params: {
  providerId: string;
  projectId: string;
  buildId: number;
  logId: number;
}): Promise<string> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}/logs/${params.logId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'text/plain' },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build log: ${error}`);
  }

  return response.text();
}

export async function getRelease(params: {
  providerId: string;
  projectId: string;
  releaseId: number;
}): Promise<AzureReleaseDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases/${params.releaseId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get release: ${error}`);
  }

  return response.json();
}

export async function listBranches(params: {
  providerId: string;
  repoId: string;
}): Promise<AzureGitRef[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  // Note: branches are under the org level, not project-scoped
  const url = `https://dev.azure.com/${orgName}/_apis/git/repositories/${params.repoId}/refs?filter=heads/&api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list branches: ${error}`);
  }

  const data: { value: AzureGitRef[] } = await response.json();
  return data.value;
}

export async function getBuildDefinitionDetail(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
}): Promise<AzureBuildDefinitionDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/definitions/${params.definitionId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build definition: ${error}`);
  }

  return response.json();
}

export async function queueBuild(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  sourceBranch: string;
  parameters?: Record<string, string>;
}): Promise<AzureBuildRun> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds?api-version=7.0`;

  const body: Record<string, unknown> = {
    definition: { id: params.definitionId },
    sourceBranch: params.sourceBranch.startsWith('refs/')
      ? params.sourceBranch
      : `refs/heads/${params.sourceBranch}`,
  };

  if (params.parameters && Object.keys(params.parameters).length > 0) {
    body.parameters = JSON.stringify(params.parameters);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to queue build: ${error}`);
  }

  return response.json();
}

export async function createRelease(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  description?: string;
}): Promise<AzureRelease> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases?api-version=7.0`;

  const body: Record<string, unknown> = {
    definitionId: params.definitionId,
  };

  if (params.description) {
    body.description = params.description;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create release: ${error}`);
  }

  return response.json();
}

export async function cancelBuild(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelling' }),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to cancel build: ${error}`);
  }
}
```

**Step 2: Add imports at the top of the file**

Add these imports from `shared/pipeline-types.ts` (alongside the existing `AzureBuildDefinition`, `AzureReleaseDefinition`, `AzureBuildRun`, `AzureRelease` imports):

```typescript
import type {
  AzureBuildDetail,
  AzureBuildTimeline,
  AzureReleaseDetail,
  AzureGitRef,
  AzureBuildDefinitionDetail,
} from '@shared/pipeline-types';
```

**Step 3: Commit**

```bash
git add electron/services/azure-devops-service.ts
git commit -m "feat(pipelines): add Azure DevOps API methods for build/release detail, timeline, logs, branches, trigger, and cancel"
```

---

### Task 3: Add IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers in `electron/ipc/handlers.ts`**

Add these handlers after the existing `tracked-pipelines:discover` handler:

```typescript
// --- Pipeline Runs ---

ipcMain.handle(
  'pipelines:listRuns',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      kind: 'build' | 'release';
    },
  ) => {
    if (params.kind === 'build') {
      return azureDevOpsService.listBuilds({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
      });
    }
    return azureDevOpsService.listReleases({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      definitionId: params.definitionId,
    });
  },
);

ipcMain.handle(
  'pipelines:getBuild',
  async (
    _,
    params: { providerId: string; azureProjectId: string; buildId: number },
  ) => {
    return azureDevOpsService.getBuild({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      buildId: params.buildId,
    });
  },
);

ipcMain.handle(
  'pipelines:getBuildTimeline',
  async (
    _,
    params: { providerId: string; azureProjectId: string; buildId: number },
  ) => {
    return azureDevOpsService.getBuildTimeline({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      buildId: params.buildId,
    });
  },
);

ipcMain.handle(
  'pipelines:getBuildLog',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
      logId: number;
    },
  ) => {
    return azureDevOpsService.getBuildLog({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      buildId: params.buildId,
      logId: params.logId,
    });
  },
);

ipcMain.handle(
  'pipelines:getRelease',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      releaseId: number;
    },
  ) => {
    return azureDevOpsService.getRelease({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      releaseId: params.releaseId,
    });
  },
);

ipcMain.handle(
  'pipelines:listBranches',
  async (_, params: { providerId: string; repoId: string }) => {
    return azureDevOpsService.listBranches(params);
  },
);

ipcMain.handle(
  'pipelines:getDefinitionParams',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
    },
  ) => {
    return azureDevOpsService.getBuildDefinitionDetail({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      definitionId: params.definitionId,
    });
  },
);

ipcMain.handle(
  'pipelines:queueBuild',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      sourceBranch: string;
      parameters?: Record<string, string>;
    },
  ) => {
    return azureDevOpsService.queueBuild({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      definitionId: params.definitionId,
      sourceBranch: params.sourceBranch,
      parameters: params.parameters,
    });
  },
);

ipcMain.handle(
  'pipelines:createRelease',
  async (
    _,
    params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      description?: string;
    },
  ) => {
    return azureDevOpsService.createRelease({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      definitionId: params.definitionId,
      description: params.description,
    });
  },
);

ipcMain.handle(
  'pipelines:cancelBuild',
  async (
    _,
    params: { providerId: string; azureProjectId: string; buildId: number },
  ) => {
    return azureDevOpsService.cancelBuild({
      providerId: params.providerId,
      projectId: params.azureProjectId,
      buildId: params.buildId,
    });
  },
);
```

**Step 2: Add preload bridge in `electron/preload.ts`**

Add after the `trackedPipelines` section (around line 600):

```typescript
pipelines: {
  listRuns: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    kind: 'build' | 'release';
  }) => ipcRenderer.invoke('pipelines:listRuns', params),
  getBuild: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => ipcRenderer.invoke('pipelines:getBuild', params),
  getBuildTimeline: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => ipcRenderer.invoke('pipelines:getBuildTimeline', params),
  getBuildLog: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
    logId: number;
  }) => ipcRenderer.invoke('pipelines:getBuildLog', params),
  getRelease: (params: {
    providerId: string;
    azureProjectId: string;
    releaseId: number;
  }) => ipcRenderer.invoke('pipelines:getRelease', params),
  listBranches: (params: { providerId: string; repoId: string }) =>
    ipcRenderer.invoke('pipelines:listBranches', params),
  getDefinitionParams: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
  }) => ipcRenderer.invoke('pipelines:getDefinitionParams', params),
  queueBuild: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    sourceBranch: string;
    parameters?: Record<string, string>;
  }) => ipcRenderer.invoke('pipelines:queueBuild', params),
  createRelease: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    description?: string;
  }) => ipcRenderer.invoke('pipelines:createRelease', params),
  cancelBuild: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => ipcRenderer.invoke('pipelines:cancelBuild', params),
},
```

**Step 3: Add API types in `src/lib/api.ts`**

Add imports at the top:

```typescript
import type {
  AzureBuildRun,
  AzureRelease,
  AzureBuildDetail,
  AzureBuildTimeline,
  AzureReleaseDetail,
  AzureGitRef,
  AzureBuildDefinitionDetail,
} from '@shared/pipeline-types';
```

Add the `pipelines` section to the API interface (after `trackedPipelines`):

```typescript
pipelines: {
  listRuns: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    kind: 'build' | 'release';
  }) => Promise<AzureBuildRun[] | AzureRelease[]>;
  getBuild: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => Promise<AzureBuildDetail>;
  getBuildTimeline: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => Promise<AzureBuildTimeline>;
  getBuildLog: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
    logId: number;
  }) => Promise<string>;
  getRelease: (params: {
    providerId: string;
    azureProjectId: string;
    releaseId: number;
  }) => Promise<AzureReleaseDetail>;
  listBranches: (params: {
    providerId: string;
    repoId: string;
  }) => Promise<AzureGitRef[]>;
  getDefinitionParams: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
  }) => Promise<AzureBuildDefinitionDetail>;
  queueBuild: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    sourceBranch: string;
    parameters?: Record<string, string>;
  }) => Promise<AzureBuildRun>;
  createRelease: (params: {
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    description?: string;
  }) => Promise<AzureRelease>;
  cancelBuild: (params: {
    providerId: string;
    azureProjectId: string;
    buildId: number;
  }) => Promise<void>;
};
```

Add default stub in the fallback section:

```typescript
pipelines: {
  listRuns: async () => [],
  getBuild: async () => ({ id: 0, buildNumber: '', status: '', result: '', definition: { id: 0, name: '' }, sourceBranch: '', sourceVersion: '', startTime: null, finishTime: null, requestedFor: { displayName: '', uniqueName: '' }, url: '' }),
  getBuildTimeline: async () => ({ records: [] }),
  getBuildLog: async () => '',
  getRelease: async () => ({ id: 0, name: '', status: '', releaseDefinition: { id: 0, name: '' }, createdBy: { displayName: '', uniqueName: '' }, createdOn: '', environments: [], artifacts: [] }),
  listBranches: async () => [],
  getDefinitionParams: async () => ({ id: 0, name: '' }),
  queueBuild: async () => ({ id: 0, buildNumber: '', status: '', result: '', definition: { id: 0, name: '' }, sourceBranch: '', startTime: '', finishTime: null, url: '' }),
  createRelease: async () => ({ id: 0, name: '', status: '', releaseDefinition: { id: 0, name: '' }, environments: [], createdOn: '' }),
  cancelBuild: async () => {},
},
```

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat(pipelines): add IPC handlers, preload bridge, and API types for pipeline runs"
```

---

### Task 4: Add React Query Hooks

**Files:**
- Create: `src/hooks/use-pipeline-runs.ts`

**Step 1: Create the hooks file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';

export function usePipelineRuns(params: {
  providerId: string;
  azureProjectId: string;
  definitionId: number;
  kind: 'build' | 'release';
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'pipeline-runs',
      params.providerId,
      params.azureProjectId,
      params.definitionId,
      params.kind,
    ],
    queryFn: () =>
      api.pipelines.listRuns({
        providerId: params.providerId,
        azureProjectId: params.azureProjectId,
        definitionId: params.definitionId,
        kind: params.kind,
      }),
    staleTime: 30_000,
    enabled: params.enabled !== false,
  });
}

export function useAllPipelineRuns(params: {
  pipelines: Array<{
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    kind: 'build' | 'release';
    jcProjectId: string;
  }>;
  enabled?: boolean;
}) {
  // Use a single query that fetches all pipelines in parallel
  const key = params.pipelines
    .map((p) => `${p.providerId}:${p.definitionId}:${p.kind}`)
    .join(',');

  return useQuery({
    queryKey: ['pipeline-runs-all', key],
    queryFn: async () => {
      const results = await Promise.allSettled(
        params.pipelines.map(async (p) => {
          const runs = await api.pipelines.listRuns({
            providerId: p.providerId,
            azureProjectId: p.azureProjectId,
            definitionId: p.definitionId,
            kind: p.kind,
          });
          return { runs, jcProjectId: p.jcProjectId, kind: p.kind };
        }),
      );

      return results
        .filter(
          (r): r is PromiseFulfilledResult<(typeof results)[number] extends PromiseFulfilledResult<infer T> ? T : never> =>
            r.status === 'fulfilled',
        )
        .flatMap((r) => r.value);
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: params.enabled !== false && params.pipelines.length > 0,
  });
}

export function useBuildTimeline(params: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'build-timeline',
      params.providerId,
      params.azureProjectId,
      params.buildId,
    ],
    queryFn: () =>
      api.pipelines.getBuildTimeline({
        providerId: params.providerId,
        azureProjectId: params.azureProjectId,
        buildId: params.buildId,
      }),
    staleTime: 15_000,
    refetchInterval: 15_000,
    enabled: params.enabled !== false,
  });
}

export function useBuildLog(params: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  logId: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'build-log',
      params.providerId,
      params.azureProjectId,
      params.buildId,
      params.logId,
    ],
    queryFn: () =>
      api.pipelines.getBuildLog({
        providerId: params.providerId,
        azureProjectId: params.azureProjectId,
        buildId: params.buildId,
        logId: params.logId,
      }),
    staleTime: 60_000,
    enabled: params.enabled !== false,
  });
}

export function useReleaseDetail(params: {
  providerId: string;
  azureProjectId: string;
  releaseId: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'release-detail',
      params.providerId,
      params.azureProjectId,
      params.releaseId,
    ],
    queryFn: () =>
      api.pipelines.getRelease({
        providerId: params.providerId,
        azureProjectId: params.azureProjectId,
        releaseId: params.releaseId,
      }),
    staleTime: 15_000,
    refetchInterval: 15_000,
    enabled: params.enabled !== false,
  });
}

export function useBranches(params: {
  providerId: string;
  repoId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['branches', params.providerId, params.repoId],
    queryFn: () =>
      api.pipelines.listBranches({
        providerId: params.providerId,
        repoId: params.repoId,
      }),
    staleTime: 300_000,
    enabled: params.enabled !== false,
  });
}

export function useBranchNames(params: {
  providerId: string;
  repoId: string;
  enabled?: boolean;
}) {
  const query = useBranches(params);
  const branchNames = useMemo(
    () =>
      (query.data ?? []).map((ref) =>
        ref.name.replace(/^refs\/heads\//, ''),
      ),
    [query.data],
  );
  return { ...query, data: branchNames };
}

export function useBuildDefinitionParams(params: {
  providerId: string;
  azureProjectId: string;
  definitionId: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'build-definition-params',
      params.providerId,
      params.azureProjectId,
      params.definitionId,
    ],
    queryFn: () =>
      api.pipelines.getDefinitionParams({
        providerId: params.providerId,
        azureProjectId: params.azureProjectId,
        definitionId: params.definitionId,
      }),
    staleTime: 300_000,
    enabled: params.enabled !== false,
  });
}

export function useQueueBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      sourceBranch: string;
      parameters?: Record<string, string>;
    }) => api.pipelines.queueBuild(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
    },
  });
}

export function useCreateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      description?: string;
    }) => api.pipelines.createRelease(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
    },
  });
}

export function useCancelBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => api.pipelines.cancelBuild(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
      queryClient.invalidateQueries({ queryKey: ['build-timeline'] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-pipeline-runs.ts
git commit -m "feat(pipelines): add React Query hooks for pipeline runs, timeline, logs, branches, trigger, and cancel"
```

---

### Task 5: Register Pipelines Overlay

**Files:**
- Modify: `src/stores/overlays.ts`
- Modify: `src/routes/__root.tsx`
- Modify: `src/layout/ui-header/index.tsx`

**Step 1: Add `'pipelines'` to `OverlayType` in `src/stores/overlays.ts`**

Add `'pipelines'` to the union type:

```typescript
export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'background-jobs'
  | 'settings'
  | 'project-backlog'
  | 'notification-center'
  | 'pipelines';
```

**Step 2: Add header button in `src/layout/ui-header/index.tsx`**

Add a Pipelines button after the Backlog button (inside the left `<div className="flex min-w-0 flex-1 px-2">` section). Import `Workflow` from `lucide-react`.

```tsx
<Button
  type="button"
  onClick={() => openOverlay('pipelines')}
  className="ml-2 flex h-7 shrink-0 items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
  style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
  title="Pipelines"
  aria-label="Open pipelines"
>
  <Workflow className="h-3.5 w-3.5" />
  <span className="text-xs">Pipelines</span>
  <Kbd shortcut="cmd+shift+p" className="text-[9px]" />
</Button>
```

**Step 3: Add overlay container in `src/routes/__root.tsx`**

Add a `PipelinesContainer` function following the existing pattern:

```tsx
function PipelinesContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'pipelines');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands('pipelines-trigger', [
    {
      shortcut: { key: 'p', cmd: true, shift: true },
      label: 'Open Pipelines',
      section: 'Navigation',
      handler: () => {
        toggle('pipelines');
      },
    },
  ]);

  if (!isOpen) return null;
  return <PipelinesOverlay onClose={() => close('pipelines')} />;
}
```

Add `<PipelinesContainer />` in the `RootLayout` alongside the other overlay containers.

Import `PipelinesOverlay` from `@/features/pipelines/ui-pipelines-overlay`.

**Step 4: Commit**

```bash
git add src/stores/overlays.ts src/routes/__root.tsx src/layout/ui-header/index.tsx
git commit -m "feat(pipelines): register pipelines overlay with header button and Cmd+Shift+P shortcut"
```

---

### Task 6: Build Pipelines Overlay — Shell & Sidebar

**Files:**
- Create: `src/features/pipelines/ui-pipelines-overlay/index.tsx`
- Create: `src/features/pipelines/ui-pipelines-overlay/sidebar.tsx`

**Step 1: Create the main overlay component**

Create `src/features/pipelines/ui-pipelines-overlay/index.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useProjects } from '@/hooks/use-projects';
import { useTrackedPipelines } from '@/hooks/use-tracked-pipelines';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

import { PipelinesSidebar } from './sidebar';
import { RunList } from './run-list';
import { TriggerRunDialog } from './trigger-run-dialog';

export type SidebarFilter =
  | { type: 'all' }
  | { type: 'project'; projectId: string }
  | { type: 'definition'; projectId: string; pipeline: TrackedPipeline };

export function PipelinesOverlay({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<SidebarFilter>({ type: 'all' });
  const [triggerPipeline, setTriggerPipeline] = useState<{
    project: Project;
    pipeline: TrackedPipeline;
  } | null>(null);

  const { data: projects = [] } = useProjects();

  // Filter to projects with Azure DevOps repo linked
  const azureProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.repoProviderId && p.repoProjectId && p.repoId,
      ),
    [projects],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  useRegisterKeyboardBindings('pipelines-overlay', [
    { key: 'Escape', handler: onClose },
  ]);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleBackdropClick}
          tabIndex={-1}
          role="dialog"
        >
          <div
            className="flex h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"
            onClick={handlePanelClick}
          >
            {/* Top bar */}
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <Button
                onClick={onClose}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                aria-label="Close pipelines"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm font-medium text-neutral-100">
                Pipelines
              </span>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              <PipelinesSidebar
                projects={azureProjects}
                filter={filter}
                onFilterChange={setFilter}
                onTriggerRun={(project, pipeline) =>
                  setTriggerPipeline({ project, pipeline })
                }
              />

              <div className="flex-1 overflow-y-auto p-6">
                <RunList
                  projects={azureProjects}
                  filter={filter}
                />
              </div>
            </div>

            {/* Footer tips */}
            <div className="flex shrink-0 items-center gap-3 border-t border-neutral-700 px-4 py-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Kbd shortcut="escape" /> close
              </span>
            </div>
          </div>
        </div>

        {triggerPipeline && (
          <TriggerRunDialog
            project={triggerPipeline.project}
            pipeline={triggerPipeline.pipeline}
            onClose={() => setTriggerPipeline(null)}
          />
        )}
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
```

**Step 2: Create the sidebar component**

Create `src/features/pipelines/ui-pipelines-overlay/sidebar.tsx`:

```tsx
import { useMemo } from 'react';
import { ChevronDown, ChevronRight, Play, Settings } from 'lucide-react';
import clsx from 'clsx';

import { Button } from '@/common/ui/button';
import { useTrackedPipelines } from '@/hooks/use-tracked-pipelines';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

import type { SidebarFilter } from '.';

function ProjectGroup({
  project,
  filter,
  onFilterChange,
  onTriggerRun,
}: {
  project: Project;
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
}) {
  const { data: pipelines = [] } = useTrackedPipelines(project.id);
  const enabledPipelines = useMemo(
    () => pipelines.filter((p) => p.enabled),
    [pipelines],
  );

  if (enabledPipelines.length === 0) return null;

  const isProjectSelected =
    filter.type === 'project' && filter.projectId === project.id;
  const isExpanded =
    isProjectSelected ||
    (filter.type === 'definition' && filter.projectId === project.id);

  return (
    <div>
      <Button
        onClick={() =>
          onFilterChange({ type: 'project', projectId: project.id })
        }
        className={clsx(
          'flex w-full items-center gap-1.5 rounded px-3 py-1.5 text-left text-sm transition-colors',
          isProjectSelected
            ? 'bg-neutral-700 font-medium text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{project.name}</span>
      </Button>

      {isExpanded && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {enabledPipelines.map((pipeline) => {
            const isSelected =
              filter.type === 'definition' &&
              filter.pipeline.id === pipeline.id;

            return (
              <div key={pipeline.id} className="group flex items-center gap-1">
                <Button
                  onClick={() =>
                    onFilterChange({
                      type: 'definition',
                      projectId: project.id,
                      pipeline,
                    })
                  }
                  className={clsx(
                    'flex-1 truncate rounded px-2 py-1 text-left text-xs transition-colors',
                    isSelected
                      ? 'bg-neutral-700 font-medium text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300',
                  )}
                >
                  {pipeline.name}
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTriggerRun(project, pipeline);
                  }}
                  className="rounded p-1 text-neutral-600 opacity-0 transition-all hover:bg-neutral-700 hover:text-green-400 group-hover:opacity-100"
                  title={`Run ${pipeline.name}`}
                >
                  <Play className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PipelinesSidebar({
  projects,
  filter,
  onFilterChange,
  onTriggerRun,
}: {
  projects: Project[];
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onTriggerRun: (project: Project, pipeline: TrackedPipeline) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col justify-between border-r border-neutral-700 p-3">
      <nav className="flex flex-col gap-1">
        <Button
          onClick={() => onFilterChange({ type: 'all' })}
          className={clsx(
            'rounded px-3 py-1.5 text-left text-sm transition-colors',
            filter.type === 'all'
              ? 'bg-neutral-700 font-medium text-neutral-100'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
          )}
        >
          All Projects
        </Button>

        <div className="my-1 border-t border-neutral-800" />

        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            filter={filter}
            onFilterChange={onFilterChange}
            onTriggerRun={onTriggerRun}
          />
        ))}
      </nav>

      <Button
        onClick={() => {
          // Navigate to settings pipeline section
          // This would need integration with settings overlay navigation
        }}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </Button>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/features/pipelines/ui-pipelines-overlay/index.tsx src/features/pipelines/ui-pipelines-overlay/sidebar.tsx
git commit -m "feat(pipelines): build pipelines overlay shell with sidebar, project groups, and definition tree"
```

---

### Task 7: Build Run List

**Files:**
- Create: `src/features/pipelines/ui-pipelines-overlay/run-list.tsx`
- Create: `src/features/pipelines/ui-pipelines-overlay/run-row.tsx`

**Step 1: Create the run list component**

Create `src/features/pipelines/ui-pipelines-overlay/run-list.tsx`:

```tsx
import { useMemo } from 'react';

import { useTrackedPipelines } from '@/hooks/use-tracked-pipelines';
import { useAllPipelineRuns } from '@/hooks/use-pipeline-runs';
import type { Project } from '@shared/types';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import type { SidebarFilter } from '.';
import { RunRow } from './run-row';

function isInProgress(run: AzureBuildRun | AzureRelease): boolean {
  if ('buildNumber' in run) {
    return run.status === 'inProgress' || run.status === 'notStarted';
  }
  return (
    run.status === 'active' ||
    run.environments?.some(
      (e) => e.status === 'inProgress' || e.status === 'queued',
    )
  );
}

function getRunTime(run: AzureBuildRun | AzureRelease): string {
  if ('buildNumber' in run) {
    return run.finishTime ?? run.startTime ?? '';
  }
  return run.createdOn ?? '';
}

export function RunList({
  projects,
  filter,
}: {
  projects: Project[];
  filter: SidebarFilter;
}) {
  // Determine which pipelines to fetch runs for
  const projectsToFetch = useMemo(() => {
    if (filter.type === 'all') return projects;
    return projects.filter((p) => p.id === filter.projectId);
  }, [projects, filter]);

  // Collect all tracked pipeline configs across relevant projects
  const pipelineConfigs = useMemo(() => {
    // This will be populated by the child hook pattern below
    return [];
  }, []);

  // For now, render a per-project run fetcher
  return (
    <div className="flex flex-col gap-1">
      {projectsToFetch.length === 0 && (
        <div className="py-12 text-center text-sm text-neutral-500">
          No projects with tracked pipelines.
          <br />
          Link an Azure DevOps repository and enable pipelines in Settings.
        </div>
      )}

      {projectsToFetch.map((project) => (
        <ProjectRunList
          key={project.id}
          project={project}
          filter={filter}
        />
      ))}
    </div>
  );
}

function ProjectRunList({
  project,
  filter,
}: {
  project: Project;
  filter: SidebarFilter;
}) {
  const { data: pipelines = [] } = useTrackedPipelines(project.id);

  const enabledPipelines = useMemo(
    () => pipelines.filter((p) => p.enabled),
    [pipelines],
  );

  const filteredPipelines = useMemo(() => {
    if (filter.type === 'definition') {
      return enabledPipelines.filter(
        (p) => p.id === filter.pipeline.id,
      );
    }
    return enabledPipelines;
  }, [enabledPipelines, filter]);

  const pipelineParams = useMemo(
    () =>
      filteredPipelines.map((p) => ({
        providerId: project.repoProviderId!,
        azureProjectId: project.repoProjectId!,
        definitionId: p.azurePipelineId,
        kind: p.kind,
        jcProjectId: project.id,
      })),
    [filteredPipelines, project],
  );

  const { data: results = [], isLoading } = useAllPipelineRuns({
    pipelines: pipelineParams,
  });

  // Flatten and sort: in-progress first, then by time descending
  const sortedRuns = useMemo(() => {
    const allRuns = results.flatMap((result) =>
      (result.runs as (AzureBuildRun | AzureRelease)[]).map((run) => ({
        run,
        kind: result.kind as 'build' | 'release',
        projectName: project.name,
        providerId: project.repoProviderId!,
        azureProjectId: project.repoProjectId!,
      })),
    );

    return allRuns.sort((a, b) => {
      const aInProgress = isInProgress(a.run);
      const bInProgress = isInProgress(b.run);

      if (aInProgress && !bInProgress) return -1;
      if (!aInProgress && bInProgress) return 1;

      const aTime = getRunTime(a.run);
      const bTime = getRunTime(b.run);
      return bTime.localeCompare(aTime);
    });
  }, [results, project]);

  if (isLoading) {
    return (
      <div className="py-4 text-center text-xs text-neutral-500">
        Loading runs...
      </div>
    );
  }

  if (sortedRuns.length === 0) return null;

  return (
    <>
      {sortedRuns.map((item) => (
        <RunRow
          key={`${'buildNumber' in item.run ? 'build' : 'release'}-${item.run.id}`}
          run={item.run}
          kind={item.kind}
          projectName={item.projectName}
          providerId={item.providerId}
          azureProjectId={item.azureProjectId}
        />
      ))}
    </>
  );
}
```

**Step 2: Create the run row component**

Create `src/features/pipelines/ui-pipelines-overlay/run-row.tsx`:

```tsx
import { useState } from 'react';
import {
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  User,
} from 'lucide-react';
import clsx from 'clsx';

import { Button } from '@/common/ui/button';
import { formatRelativeTime, formatDuration } from '@/lib/time';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import { RunDetail } from './run-detail';

function StatusIcon({ status, result }: { status: string; result: string | null }) {
  if (status === 'inProgress' || status === 'notStarted') {
    return <Circle className="h-3.5 w-3.5 animate-pulse text-blue-400" />;
  }
  if (result === 'succeeded') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  }
  if (result === 'failed') {
    return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  }
  if (result === 'canceled' || result === 'cancelling') {
    return <Clock className="h-3.5 w-3.5 text-neutral-400" />;
  }
  if (result === 'partiallySucceeded') {
    return <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />;
  }
  return <Circle className="h-3.5 w-3.5 text-neutral-500" />;
}

function getBuildRunInfo(run: AzureBuildRun) {
  return {
    definitionName: run.definition.name,
    displayNumber: `#${run.buildNumber}`,
    status: run.status,
    result: run.result,
    sourceBranch: run.sourceBranch?.replace(/^refs\/heads\//, '') ?? null,
    startTime: run.startTime,
    finishTime: run.finishTime,
    triggeredBy: null as string | null, // detail fetch needed
    webUrl: run._links?.web?.href ?? null,
  };
}

function getReleaseRunInfo(run: AzureRelease) {
  const envStatus = run.environments?.find(
    (e) => e.status === 'inProgress' || e.status === 'rejected',
  );
  const overallResult = run.environments?.every(
    (e) => e.status === 'succeeded',
  )
    ? 'succeeded'
    : run.environments?.some((e) => e.status === 'rejected')
      ? 'failed'
      : null;

  return {
    definitionName: run.releaseDefinition.name,
    displayNumber: run.name,
    status: run.status,
    result: overallResult,
    sourceBranch: null,
    startTime: run.createdOn,
    finishTime: null as string | null,
    triggeredBy: null as string | null,
    webUrl: run._links?.web?.href ?? null,
  };
}

export function RunRow({
  run,
  kind,
  projectName,
  providerId,
  azureProjectId,
}: {
  run: AzureBuildRun | AzureRelease;
  kind: 'build' | 'release';
  projectName: string;
  providerId: string;
  azureProjectId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const info =
    kind === 'build'
      ? getBuildRunInfo(run as AzureBuildRun)
      : getReleaseRunInfo(run as AzureRelease);

  const duration =
    info.startTime && info.finishTime
      ? formatDuration(
          new Date(info.finishTime).getTime() -
            new Date(info.startTime).getTime(),
        )
      : info.startTime
        ? 'running...'
        : null;

  const relativeTime = info.finishTime
    ? formatRelativeTime(info.finishTime)
    : info.startTime
      ? formatRelativeTime(info.startTime)
      : null;

  return (
    <div
      className={clsx(
        'rounded border transition-colors',
        expanded
          ? 'border-neutral-600 bg-neutral-800/50'
          : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30',
      )}
    >
      <Button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
      >
        <div className="flex shrink-0 items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
          )}
          <StatusIcon status={info.status} result={info.result} />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-neutral-200">
            {info.definitionName}
          </span>
          <span className="text-xs text-neutral-500">
            {info.displayNumber}
          </span>

          {info.sourceBranch && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <GitBranch className="h-3 w-3" />
              {info.sourceBranch}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
          {relativeTime && <span>{relativeTime}</span>}
          {duration && <span>⏱ {duration}</span>}
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {projectName}
          </span>
        </div>
      </Button>

      {expanded && (
        <RunDetail
          run={run}
          kind={kind}
          providerId={providerId}
          azureProjectId={azureProjectId}
        />
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/features/pipelines/ui-pipelines-overlay/run-list.tsx src/features/pipelines/ui-pipelines-overlay/run-row.tsx
git commit -m "feat(pipelines): build run list with chronological sorting and run row with status icons"
```

---

### Task 8: Build Run Detail with Stage Timeline

**Files:**
- Create: `src/features/pipelines/ui-pipelines-overlay/run-detail.tsx`
- Create: `src/features/pipelines/ui-pipelines-overlay/stages-timeline.tsx`

**Step 1: Create stages timeline component**

Create `src/features/pipelines/ui-pipelines-overlay/stages-timeline.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import clsx from 'clsx';

import { Button } from '@/common/ui/button';
import { formatDuration } from '@/lib/time';
import type { AzureBuildTimelineRecord } from '@shared/pipeline-types';
import { useBuildLog } from '@/hooks/use-pipeline-runs';

function StageStatusIcon({ state, result }: { state: string; result: string | null }) {
  if (state === 'inProgress') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
  }
  if (result === 'succeeded') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  }
  if (result === 'failed') {
    return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  }
  if (result === 'skipped') {
    return <MinusCircle className="h-3.5 w-3.5 text-neutral-500" />;
  }
  return <Circle className="h-3.5 w-3.5 text-neutral-500" />;
}

function TaskLogView({
  providerId,
  azureProjectId,
  buildId,
  logId,
}: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  logId: number;
}) {
  const { data: logContent, isLoading } = useBuildLog({
    providerId,
    azureProjectId,
    buildId,
    logId,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-xs text-neutral-500">Loading logs...</div>
    );
  }

  return (
    <pre className="max-h-60 overflow-auto rounded bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">
      {logContent || 'No log content available.'}
    </pre>
  );
}

function JobRow({
  job,
  tasks,
  providerId,
  azureProjectId,
  buildId,
  defaultExpanded,
}: {
  job: AzureBuildTimelineRecord;
  tasks: AzureBuildTimelineRecord[];
  providerId: string;
  azureProjectId: string;
  buildId: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const duration =
    job.startTime && job.finishTime
      ? formatDuration(
          new Date(job.finishTime).getTime() -
            new Date(job.startTime).getTime(),
        )
      : null;

  return (
    <div className="ml-4 border-l border-neutral-700 pl-3">
      <Button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-neutral-800"
      >
        <StageStatusIcon state={job.state} result={job.result} />
        <span className="text-xs text-neutral-300">{job.name}</span>
        {duration && (
          <span className="text-xs text-neutral-500">{duration}</span>
        )}
      </Button>

      {expanded && (
        <div className="mt-1 flex flex-col gap-0.5 pl-4">
          {tasks.map((task) => (
            <div key={task.id}>
              <Button
                onClick={() =>
                  setExpandedTaskId(
                    expandedTaskId === task.id ? null : task.id,
                  )
                }
                className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left hover:bg-neutral-800"
              >
                <StageStatusIcon state={task.state} result={task.result} />
                <span className="text-[11px] text-neutral-400">
                  {task.name}
                </span>
                {task.issues && task.issues.length > 0 && (
                  <span className="text-[10px] text-red-400">
                    {task.issues.length} issue(s)
                  </span>
                )}
              </Button>

              {expandedTaskId === task.id && task.log?.id && (
                <div className="ml-6 mt-1 mb-2">
                  <TaskLogView
                    providerId={providerId}
                    azureProjectId={azureProjectId}
                    buildId={buildId}
                    logId={task.log.id}
                  />
                </div>
              )}

              {expandedTaskId === task.id &&
                task.issues &&
                task.issues.length > 0 && (
                  <div className="ml-6 mt-1 mb-2 rounded bg-red-950/30 p-2">
                    {task.issues.map((issue, i) => (
                      <div
                        key={i}
                        className="text-xs text-red-300"
                      >
                        {issue.message}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StagesTimeline({
  records,
  providerId,
  azureProjectId,
  buildId,
}: {
  records: AzureBuildTimelineRecord[];
  providerId: string;
  azureProjectId: string;
  buildId: number;
}) {
  // Organize into hierarchy: Stage → Job → Task
  const stages = useMemo(() => {
    const stageRecords = records
      .filter((r) => r.type === 'Stage')
      .sort((a, b) => a.order - b.order);

    return stageRecords.map((stage) => {
      const jobs = records
        .filter((r) => r.type === 'Job' && r.parentId === stage.id)
        .sort((a, b) => a.order - b.order);

      const jobsWithTasks = jobs.map((job) => ({
        job,
        tasks: records
          .filter((r) => r.type === 'Task' && r.parentId === job.id)
          .sort((a, b) => a.order - b.order),
      }));

      return { stage, jobs: jobsWithTasks };
    });
  }, [records]);

  const [expandedStageId, setExpandedStageId] = useState<string | null>(() => {
    // Auto-expand failed or running stage
    const failedStage = stages.find((s) => s.stage.result === 'failed');
    if (failedStage) return failedStage.stage.id;
    const runningStage = stages.find(
      (s) => s.stage.state === 'inProgress',
    );
    if (runningStage) return runningStage.stage.id;
    return null;
  });

  return (
    <div className="space-y-3">
      {/* Horizontal stage chips */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {stages.map((s, i) => {
          const duration =
            s.stage.startTime && s.stage.finishTime
              ? formatDuration(
                  new Date(s.stage.finishTime).getTime() -
                    new Date(s.stage.startTime).getTime(),
                )
              : null;

          return (
            <div key={s.stage.id} className="flex items-center gap-1">
              {i > 0 && (
                <div className="h-px w-4 bg-neutral-600" />
              )}
              <Button
                onClick={() =>
                  setExpandedStageId(
                    expandedStageId === s.stage.id ? null : s.stage.id,
                  )
                }
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors',
                  expandedStageId === s.stage.id
                    ? 'border-neutral-500 bg-neutral-700'
                    : 'border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800',
                )}
              >
                <StageStatusIcon
                  state={s.stage.state}
                  result={s.stage.result}
                />
                <span className="text-neutral-200">{s.stage.name}</span>
                {duration && (
                  <span className="text-neutral-500">{duration}</span>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Expanded stage detail */}
      {expandedStageId && (
        <div className="rounded border border-neutral-700 bg-neutral-800/30 p-3">
          {stages
            .filter((s) => s.stage.id === expandedStageId)
            .map((s) => (
              <div key={s.stage.id} className="space-y-1">
                <div className="mb-2 text-xs font-medium text-neutral-300">
                  {s.stage.name}
                </div>
                {s.jobs.map(({ job, tasks }) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    tasks={tasks}
                    providerId={providerId}
                    azureProjectId={azureProjectId}
                    buildId={buildId}
                    defaultExpanded={job.result === 'failed'}
                  />
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create the run detail component**

Create `src/features/pipelines/ui-pipelines-overlay/run-detail.tsx`:

```tsx
import { ExternalLink, XCircle } from 'lucide-react';

import { Button } from '@/common/ui/button';
import { useBuildTimeline, useCancelBuild } from '@/hooks/use-pipeline-runs';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import { StagesTimeline } from './stages-timeline';

export function RunDetail({
  run,
  kind,
  providerId,
  azureProjectId,
}: {
  run: AzureBuildRun | AzureRelease;
  kind: 'build' | 'release';
  providerId: string;
  azureProjectId: string;
}) {
  const buildId = kind === 'build' ? (run as AzureBuildRun).id : null;
  const isRunning =
    kind === 'build'
      ? (run as AzureBuildRun).status === 'inProgress'
      : false;

  const { data: timeline, isLoading: timelineLoading } = useBuildTimeline({
    providerId,
    azureProjectId,
    buildId: buildId ?? 0,
    enabled: kind === 'build' && buildId !== null,
  });

  const cancelBuild = useCancelBuild();

  const webUrl =
    run._links?.web?.href ?? null;

  return (
    <div className="border-t border-neutral-700 px-4 py-3">
      {kind === 'build' && (
        <>
          {timelineLoading && (
            <div className="py-3 text-xs text-neutral-500">
              Loading timeline...
            </div>
          )}
          {timeline && timeline.records.length > 0 && (
            <StagesTimeline
              records={timeline.records}
              providerId={providerId}
              azureProjectId={azureProjectId}
              buildId={buildId!}
            />
          )}
          {timeline && timeline.records.length === 0 && (
            <div className="py-3 text-xs text-neutral-500">
              No stage information available.
            </div>
          )}
        </>
      )}

      {kind === 'release' && (
        <div className="py-2 text-xs text-neutral-500">
          Release environment detail view coming soon.
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-700 pt-3">
        {isRunning && kind === 'build' && (
          <Button
            onClick={() =>
              cancelBuild.mutate({
                providerId,
                azureProjectId,
                buildId: buildId!,
              })
            }
            disabled={cancelBuild.isPending}
            className="flex items-center gap-1.5 rounded border border-red-800 bg-red-950/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-900/40"
          >
            <XCircle className="h-3.5 w-3.5" />
            {cancelBuild.isPending ? 'Cancelling...' : 'Cancel'}
          </Button>
        )}

        {webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Azure DevOps
          </a>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/features/pipelines/ui-pipelines-overlay/run-detail.tsx src/features/pipelines/ui-pipelines-overlay/stages-timeline.tsx
git commit -m "feat(pipelines): build run detail with stages timeline, job/task drill-down, and log viewer"
```

---

### Task 9: Build Trigger Run Dialog

**Files:**
- Create: `src/features/pipelines/ui-pipelines-overlay/trigger-run-dialog.tsx`

**Step 1: Create the trigger run dialog**

Create `src/features/pipelines/ui-pipelines-overlay/trigger-run-dialog.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';
import FocusLock from 'react-focus-lock';

import { Button } from '@/common/ui/button';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import {
  useBranchNames,
  useBuildDefinitionParams,
  useQueueBuild,
  useCreateRelease,
} from '@/hooks/use-pipeline-runs';
import type { TrackedPipeline } from '@shared/pipeline-types';
import type { Project } from '@shared/types';

export function TriggerRunDialog({
  project,
  pipeline,
  onClose,
}: {
  project: Project;
  pipeline: TrackedPipeline;
  onClose: () => void;
}) {
  const providerId = project.repoProviderId!;
  const azureProjectId = project.repoProjectId!;
  const repoId = project.repoId!;

  const [branch, setBranch] = useState(project.defaultBranch ?? 'main');
  const [branchFilter, setBranchFilter] = useState('');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');

  const { data: branchNames = [] } = useBranchNames({
    providerId,
    repoId,
  });

  const { data: definitionDetail } = useBuildDefinitionParams({
    providerId,
    azureProjectId,
    definitionId: pipeline.azurePipelineId,
    enabled: pipeline.kind === 'build',
  });

  const queueBuild = useQueueBuild();
  const createRelease = useCreateRelease();

  const filteredBranches = useMemo(
    () =>
      branchNames.filter((b) =>
        b.toLowerCase().includes(branchFilter.toLowerCase()),
      ),
    [branchNames, branchFilter],
  );

  // Extract overridable parameters from definition
  const paramInputs = useMemo(() => {
    if (!definitionDetail?.processParameters?.inputs) return [];
    return definitionDetail.processParameters.inputs;
  }, [definitionDetail]);

  // Initialize parameter defaults
  useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const input of paramInputs) {
      defaults[input.name] = input.defaultValue ?? '';
    }
    setParameters((prev) =>
      Object.keys(prev).length === 0 ? defaults : prev,
    );
  }, [paramInputs]);

  const handleSubmit = useCallback(() => {
    if (pipeline.kind === 'build') {
      queueBuild.mutate(
        {
          providerId,
          azureProjectId,
          definitionId: pipeline.azurePipelineId,
          sourceBranch: branch,
          parameters:
            Object.keys(parameters).length > 0 ? parameters : undefined,
        },
        { onSuccess: onClose },
      );
    } else {
      createRelease.mutate(
        {
          providerId,
          azureProjectId,
          definitionId: pipeline.azurePipelineId,
          description: description || undefined,
        },
        { onSuccess: onClose },
      );
    }
  }, [
    pipeline,
    providerId,
    azureProjectId,
    branch,
    parameters,
    description,
    queueBuild,
    createRelease,
    onClose,
  ]);

  const isPending = queueBuild.isPending || createRelease.isPending;
  const error = queueBuild.error || createRelease.error;

  useRegisterKeyboardBindings('trigger-run-dialog', [
    { key: 'Escape', handler: onClose },
  ]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <FocusLock returnFocus>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
        onClick={handleBackdropClick}
      >
        <div
          className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-4 text-sm font-medium text-neutral-100">
            Run {pipeline.name}
          </h3>

          {/* Branch selector (build only) */}
          {pipeline.kind === 'build' && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-neutral-400">
                Branch
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={showBranchDropdown ? branchFilter : branch}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setBranch(e.target.value);
                    setShowBranchDropdown(true);
                  }}
                  onFocus={() => {
                    setBranchFilter(branch);
                    setShowBranchDropdown(true);
                  }}
                  onBlur={() => {
                    // Delay to allow click on dropdown item
                    setTimeout(() => setShowBranchDropdown(false), 200);
                  }}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500"
                  placeholder="Type branch name..."
                />

                {showBranchDropdown && filteredBranches.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-neutral-700 bg-neutral-800 py-1">
                    {filteredBranches.slice(0, 20).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onMouseDown={() => {
                          setBranch(b);
                          setShowBranchDropdown(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Release description */}
          {pipeline.kind === 'release' && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-neutral-400">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500"
                placeholder="Triggered from Jean-Claude"
              />
            </div>
          )}

          {/* Parameters (build only) */}
          {pipeline.kind === 'build' && paramInputs.length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-neutral-400">
                Parameters
              </label>
              <div className="space-y-3">
                {paramInputs.map((input) => (
                  <div key={input.name}>
                    <label className="mb-1 block text-[11px] text-neutral-500">
                      {input.label || input.name}
                    </label>

                    {/* Boolean → checkbox */}
                    {input.type === 'boolean' && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={parameters[input.name] === 'true'}
                          onChange={(e) =>
                            setParameters((prev) => ({
                              ...prev,
                              [input.name]: e.target.checked
                                ? 'true'
                                : 'false',
                            }))
                          }
                          className="rounded border-neutral-600"
                        />
                        <span className="text-xs text-neutral-300">
                          {input.label || input.name}
                        </span>
                      </label>
                    )}

                    {/* Enum (pickList/radio) → select */}
                    {(input.type === 'pickList' || input.type === 'radio') &&
                      input.options && (
                        <select
                          value={parameters[input.name] ?? input.defaultValue}
                          onChange={(e) =>
                            setParameters((prev) => ({
                              ...prev,
                              [input.name]: e.target.value,
                            }))
                          }
                          className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500"
                        >
                          {Object.entries(input.options).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      )}

                    {/* String/number → text input */}
                    {input.type === 'string' && (
                      <input
                        type="text"
                        value={parameters[input.name] ?? input.defaultValue}
                        onChange={(e) =>
                          setParameters((prev) => ({
                            ...prev,
                            [input.name]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-3 rounded bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error instanceof Error ? error.message : 'Failed to trigger run'}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              onClick={onClose}
              className="rounded border border-neutral-700 px-4 py-2 text-xs text-neutral-400 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded bg-green-700 px-4 py-2 text-xs text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              {isPending
                ? 'Queuing...'
                : pipeline.kind === 'build'
                  ? 'Queue Build'
                  : 'Create Release'}
            </Button>
          </div>
        </div>
      </div>
    </FocusLock>,
    document.body,
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pipelines/ui-pipelines-overlay/trigger-run-dialog.tsx
git commit -m "feat(pipelines): build trigger run dialog with branch combobox and typed parameter inputs"
```

---

### Task 10: Lint, Type-Check, and Final Adjustments

**Step 1: Install any missing dependencies (if needed)**

```bash
pnpm install
```

**Step 2: Run lint with auto-fix**

```bash
pnpm lint --fix
```

**Step 3: Run TypeScript check**

```bash
pnpm ts-check
```

**Step 4: Fix any errors reported by lint or ts-check**

Common issues to watch for:
- Missing imports (e.g., `formatDuration` and `formatRelativeTime` may not exist in `@/lib/time` — check and create utility functions if needed)
- The `Button` component import path may differ — verify against existing usage
- The `useAllPipelineRuns` hook's `Promise.allSettled` type inference may need adjustment
- Azure DevOps service imports may need updating in `handlers.ts` (ensure the new functions are exported and imported)

**Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix(pipelines): address lint and type-check errors"
```

---

### Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Extend pipeline types | `shared/pipeline-types.ts` |
| 2 | Add Azure DevOps service methods | `electron/services/azure-devops-service.ts` |
| 3 | Add IPC handlers, preload, API types | `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/lib/api.ts` |
| 4 | Add React Query hooks | `src/hooks/use-pipeline-runs.ts` |
| 5 | Register overlay (store, header, root) | `src/stores/overlays.ts`, `src/routes/__root.tsx`, `src/layout/ui-header/index.tsx` |
| 6 | Build overlay shell + sidebar | `src/features/pipelines/ui-pipelines-overlay/index.tsx`, `sidebar.tsx` |
| 7 | Build run list + run row | `run-list.tsx`, `run-row.tsx` |
| 8 | Build run detail + stages timeline | `run-detail.tsx`, `stages-timeline.tsx` |
| 9 | Build trigger run dialog | `trigger-run-dialog.tsx` |
| 10 | Lint, type-check, fix | All modified files |
