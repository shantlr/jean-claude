# Assigned Work Items Feed & Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show Azure DevOps work items assigned to the current user as feed items, and navigate to a work item details page when clicked.

**Architecture:** Add a new `'work-item'` feed source alongside the existing task/PR/note sources. The backend polls Azure DevOps for assigned work items (cached, like PRs). A new route `/all/work-items/$projectId/$workItemId` renders the details page using an enriched version of the existing `WorkItemDetails` component. Feed items use `'assigned-work-item'` attention with medium-high priority (score 75, between completed=70 and has-question=85).

**Tech Stack:** TypeScript, React, TanStack Router, TanStack React Query, Zustand, Electron IPC, Azure DevOps REST API (WIQL)

---

### Task 1: Extend Feed Types with Work Item Source

**Files:**
- Modify: `shared/feed-types.ts`

**Step 1: Add work-item source and attention types**

In `shared/feed-types.ts`, extend the union types and add work-item fields to `FeedItem`:

```typescript
export type FeedItemSource = 'task' | 'pull-request' | 'note' | 'work-item';

export type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'pr-approved-by-me'
  | 'waiting'
  | 'note'
  | 'assigned-work-item';
```

Add to the `FeedItem` interface:

```typescript
  // Work item tracking (only present when source === 'work-item')
  workItemId?: number;
  workItemUrl?: string;
  workItemType?: string;
  workItemState?: string;
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS (new union members are additive)

---

### Task 2: Add Feed Scoring for Work Items

**Files:**
- Modify: `src/features/feed/utils-feed-scoring.ts`

**Step 1: Add assigned-work-item base urgency**

In the `BASE_URGENCY` record, add the new attention type with score 75 (between completed=70 and has-question=85, making it "medium-high" priority):

```typescript
const BASE_URGENCY: Record<FeedItemAttention, number> = {
  errored: 100,
  'needs-permission': 90,
  'has-question': 85,
  'assigned-work-item': 75,  // <-- add this line
  completed: 70,
  interrupted: 60,
  'review-requested': 50,
  'pr-comments': 45,
  running: 30,
  'pr-approved-by-me': 15,
  note: 105,
  waiting: 10,
};
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 3: Add `queryAssignedWorkItems` to Azure DevOps Service

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add the function**

Add a new exported function after `queryWorkItems` (~line 430). This function queries work items assigned to `@Me` (Azure DevOps macro for current user) across a given project. It reuses the same auth + WIQL pattern as `queryWorkItems` but with a fixed `[System.AssignedTo] = @Me` filter and only fetches active/new items:

```typescript
export async function queryAssignedWorkItems(params: {
  providerId: string;
  projectName: string;
}): Promise<AzureDevOpsWorkItem[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const conditions: string[] = [
    `[System.TeamProject] = '${params.projectName}'`,
    `[System.AssignedTo] = @Me`,
    `[System.State] IN ('New', 'Active')`,
    `[System.WorkItemType] <> 'Test Suite'`,
    `[System.WorkItemType] <> 'Test Plan'`,
  ];

  const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

  const wiqlResponse = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/wiql?api-version=7.0&$top=50`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: wiqlQuery }),
    },
  );

  if (!wiqlResponse.ok) {
    const error = await wiqlResponse.text();
    throw new Error(`Failed to query assigned work items: ${error}`);
  }

  const wiqlData: WiqlResponse = await wiqlResponse.json();

  if (wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.map((wi) => wi.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch assigned work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  const getParentId = (relations?: WorkItemRelation[]): number | undefined => {
    if (!relations) return undefined;
    const parentRelation = relations.find(
      (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse',
    );
    if (!parentRelation) return undefined;
    const match = parentRelation.url.match(/\/workItems\/(\d+)$/i);
    return match ? parseInt(match[1], 10) : undefined;
  };

  return batchData.value.map((wi) => ({
    id: wi.id,
    url: `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
    },
    parentId: getParentId(wi.relations),
  }));
}
```

Note: The `getParentId` helper already exists as a local function in `queryWorkItems`. Consider extracting it to module-level if the linter complains about duplication; otherwise keep it local since both functions are independent.

**Step 2: Verify `getProviderAuth` is available**

The `getProviderAuth` helper already exists (used by `getIterations`). It returns `{ authHeader, orgName }`. Confirm it's in scope.

**Step 3: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 4: Add Work Item Feed Source to Feed Service

**Files:**
- Modify: `electron/services/feed-service.ts`

**Step 1: Add import**

At the top of the file, add `queryAssignedWorkItems` to the import from `./azure-devops-service`:

```typescript
import {
  getCurrentUser,
  getPullRequestActivityMetadata,
  listPullRequests,
  queryAssignedWorkItems,
} from './azure-devops-service';
```

**Step 2: Add work item cache**

Below the existing PR cache declarations (~line 35), add a similar cache for work items:

```typescript
let workItemCache: { items: FeedItem[]; fetchedAt: number } | null = null;
const WORK_ITEM_CACHE_TTL_MS = 3 * 60 * 1000;
```

**Step 3: Add `fetchWorkItemFeedItems` function**

Add before the closing export section, after `fetchPrFeedItems`:

```typescript
async function fetchWorkItemFeedItems(): Promise<FeedItem[]> {
  // Return cached items if still fresh
  if (
    workItemCache &&
    Date.now() - workItemCache.fetchedAt < WORK_ITEM_CACHE_TTL_MS
  ) {
    dbg.feed(
      'fetchWorkItemFeedItems: using cache (%d items)',
      workItemCache.items.length,
    );
    return workItemCache.items;
  }

  dbg.feed('fetchWorkItemFeedItems: fetching from Azure DevOps');
  const projects = await ProjectRepository.findAll();
  // Only projects that have work item linking configured
  const wiProjects = projects.filter(
    (p) => p.workItemProviderId && p.workItemProjectName,
  );

  if (wiProjects.length === 0) {
    workItemCache = { items: [], fetchedAt: Date.now() };
    return [];
  }

  const feedItems: FeedItem[] = [];

  // Deduplicate by providerId+projectName to avoid querying the same Azure DevOps project twice
  const seen = new Set<string>();

  for (const project of wiProjects) {
    const key = `${project.workItemProviderId}:${project.workItemProjectName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const workItems = await queryAssignedWorkItems({
        providerId: project.workItemProviderId!,
        projectName: project.workItemProjectName!,
      });

      for (const wi of workItems) {
        feedItems.push({
          id: `work-item:${project.id}:${wi.id}`,
          source: 'work-item',
          attention: 'assigned-work-item',
          timestamp: new Date().toISOString(), // Work items don't have a clean "assigned date" from WIQL
          projectId: project.id,
          projectName: project.name,
          projectColor: project.color,
          projectPriority: (project.priority as 'high' | 'normal' | 'low') ?? 'normal',
          title: wi.fields.title,
          subtitle: `${wi.fields.workItemType} #${wi.id}`,
          workItemId: wi.id,
          workItemUrl: wi.url,
          workItemType: wi.fields.workItemType,
          workItemState: wi.fields.state,
        });
      }
    } catch (err) {
      dbg.feed(
        'fetchWorkItemFeedItems: error fetching work items for project %s: %O',
        project.id,
        err,
      );
    }
  }

  workItemCache = { items: feedItems, fetchedAt: Date.now() };
  dbg.feed(
    'fetchWorkItemFeedItems: cached %d work item items',
    feedItems.length,
  );
  return feedItems;
}
```

**Step 4: Integrate into `getFeedItems`**

In the `getFeedItems` function, after the PR and note fetches (~line 194-198), add work items:

```typescript
  // Fetch work item items (with cache)
  const workItemItems = await fetchWorkItemFeedItems();
```

Update the aggregation:

```typescript
  const allItems = [...feedItems, ...prItems, ...noteItems, ...workItemItems];

  dbg.feed(
    'getFeedItems: returning %d items (%d tasks, %d PRs, %d notes, %d work items)',
    allItems.length,
    feedItems.length,
    prItems.length,
    noteItems.length,
    workItemItems.length,
  );
```

**Step 5: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 5: Add IPC Handler and API for Single Work Item Fetch

We need an IPC endpoint to fetch a single work item's full details (for the details page). The existing `queryWorkItems` fetches by project+filters. We need a simpler `getWorkItemById` that returns a single item with full details.

**Files:**
- Modify: `electron/services/azure-devops-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add `getWorkItemById` to azure-devops-service**

Add a new function in `azure-devops-service.ts`:

```typescript
export async function getWorkItemById(params: {
  providerId: string;
  workItemId: number;
}): Promise<AzureDevOpsWorkItem | null> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.text();
    throw new Error(`Failed to fetch work item ${params.workItemId}: ${error}`);
  }

  const wi = await response.json();

  const getParentId = (relations?: WorkItemRelation[]): number | undefined => {
    if (!relations) return undefined;
    const parentRelation = relations.find(
      (r: WorkItemRelation) => r.rel === 'System.LinkTypes.Hierarchy-Reverse',
    );
    if (!parentRelation) return undefined;
    const match = parentRelation.url.match(/\/workItems\/(\d+)$/i);
    return match ? parseInt(match[1], 10) : undefined;
  };

  // We need to determine the project name from the URL or org
  // The work item URL contains the project info
  const projectMatch = wi._links?.html?.href?.match(
    /dev\.azure\.com\/[^/]+\/([^/]+)\/_workitems/,
  );
  const projectName = projectMatch
    ? decodeURIComponent(projectMatch[1])
    : 'unknown';

  return {
    id: wi.id,
    url: wi._links?.html?.href ?? `https://dev.azure.com/${orgName}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
    },
    parentId: getParentId(wi.relations),
  };
}
```

**Step 2: Add IPC handler**

In `electron/ipc/handlers.ts`, add alongside the existing `azureDevOps:queryWorkItems` handler:

```typescript
  ipcMain.handle(
    'azureDevOps:getWorkItemById',
    async (
      _event,
      params: { providerId: string; workItemId: number },
    ) => {
      const { getWorkItemById } = await import(
        '../services/azure-devops-service'
      );
      return getWorkItemById(params);
    },
  );
```

**Step 3: Add to preload bridge**

In `electron/preload.ts`, add within the `azureDevOps` section:

```typescript
    getWorkItemById: (params: { providerId: string; workItemId: number }) =>
      ipcRenderer.invoke('azureDevOps:getWorkItemById', params),
```

**Step 4: Add to API type**

In `src/lib/api.ts`, add to the `azureDevOps` section of the `Api` interface:

```typescript
    getWorkItemById: (params: {
      providerId: string;
      workItemId: number;
    }) => Promise<AzureDevOpsWorkItem | null>;
```

And add the fallback in the mock API:

```typescript
    getWorkItemById: async () => null,
```

**Step 5: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 6: Add React Hook for Single Work Item

**Files:**
- Modify: `src/hooks/use-work-items.ts`

**Step 1: Add `useWorkItemById` hook**

```typescript
export function useWorkItemById(params: {
  providerId: string | null;
  workItemId: number | null;
}) {
  return useQuery({
    queryKey: ['work-item', params.providerId, params.workItemId],
    queryFn: () =>
      api.azureDevOps.getWorkItemById({
        providerId: params.providerId!,
        workItemId: params.workItemId!,
      }),
    enabled: !!params.providerId && !!params.workItemId,
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 7: Create Work Item Details Page Component

**Files:**
- Create: `src/features/feed/ui-feed-work-item-details/index.tsx`

**Step 1: Create the component**

This is the full-page work item details view displayed when clicking a work item feed card. It reuses the existing `WorkItemTypeIcon` pattern from `src/features/new-task/ui-work-item-details/index.tsx` and `AzureHtmlContent` for the description. It also needs to resolve the `providerId` from the project.

```tsx
import { ExternalLink, Loader2 } from 'lucide-react';
import { Bug, BookOpen, CheckSquare, FileText } from 'lucide-react';

import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { useProject } from '@/hooks/use-projects';
import { useWorkItemById } from '@/hooks/use-work-items';

function WorkItemTypeIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (type) {
    case 'Bug':
      return <Bug className={`${sizeClass} shrink-0 text-red-400`} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={`${sizeClass} shrink-0 text-blue-400`} />;
    case 'Task':
      return <CheckSquare className={`${sizeClass} shrink-0 text-green-400`} />;
    default:
      return <FileText className={`${sizeClass} shrink-0 text-neutral-400`} />;
  }
}

function StateBadge({ state }: { state: string }) {
  let colorClasses = 'bg-neutral-700/60 text-neutral-300';
  if (state === 'Active') {
    colorClasses = 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30';
  } else if (state === 'New') {
    colorClasses = 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/30';
  } else if (state === 'Resolved' || state === 'Done' || state === 'Closed') {
    colorClasses = 'bg-green-500/20 text-green-300 ring-1 ring-green-400/30';
  }
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${colorClasses}`}>
      {state}
    </span>
  );
}

export function FeedWorkItemDetails({
  projectId,
  workItemId,
}: {
  projectId: string;
  workItemId: number;
}) {
  const { data: project } = useProject(projectId);
  const providerId = project?.workItemProviderId ?? null;

  const { data: workItem, isLoading, error } = useWorkItemById({
    providerId,
    workItemId,
  });

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-500">
          {error ? 'Failed to load work item' : 'Work item not found'}
        </p>
      </div>
    );
  }

  const { fields } = workItem;
  const description = fields.description || fields.reproSteps;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-700/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <WorkItemTypeIcon type={fields.workItemType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-400">
                #{workItem.id}
              </span>
              <span className="text-xs text-neutral-600">•</span>
              <span className="text-xs text-neutral-400">
                {fields.workItemType}
              </span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-neutral-100">
              {fields.title}
            </h1>
          </div>
          {workItem.url && (
            <a
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
              title="Open in Azure DevOps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StateBadge state={fields.state} />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-500">Assigned to:</span>
            <span className="text-neutral-300">
              {fields.assignedTo ?? 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-500">Project:</span>
            <span className="text-neutral-300">{project.name}</span>
          </div>
        </div>
      </div>

      {/* Description (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {description ? (
          <AzureHtmlContent
            html={description}
            providerId={providerId ?? undefined}
            className="text-sm text-neutral-300"
          />
        ) : (
          <p className="text-sm italic text-neutral-500">
            No description provided.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 8: Add Route for Work Item Details

**Files:**
- Create: `src/routes/all/work-items/$projectId.$workItemId.tsx`

**Step 1: Create the route file**

```tsx
import { createFileRoute } from '@tanstack/react-router';

import { FeedWorkItemDetails } from '@/features/feed/ui-feed-work-item-details';

export const Route = createFileRoute(
  '/all/work-items/$projectId/$workItemId',
)({
  component: WorkItemPage,
});

function WorkItemPage() {
  const { projectId, workItemId } = Route.useParams();

  return (
    <FeedWorkItemDetails
      projectId={projectId}
      workItemId={Number(workItemId)}
    />
  );
}
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 9: Wire Up Feed Item Card Click for Work Items

**Files:**
- Modify: `src/features/feed/ui-feed-list/feed-item-card.tsx`

**Step 1: Add work item icon import**

Add `ClipboardList` (or suitable icon) to the lucide imports:

```typescript
import { ClipboardList } from 'lucide-react';
```

**Step 2: Update `AttentionIcon` for work items**

Add a case in the `AttentionIcon` switch:

```typescript
    case 'assigned-work-item':
      return (
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-teal-400" />
      );
```

**Step 3: Update `handleClick` for work item navigation**

In the `FeedItemCard` component, update the `handleClick` callback to handle work items:

```typescript
  const handleClick = useCallback(() => {
    if (item.source === 'work-item' && item.workItemId) {
      navigate({
        to: '/all/work-items/$projectId/$workItemId',
        params: {
          projectId: item.projectId,
          workItemId: String(item.workItemId),
        },
      });
    } else if (item.source === 'pull-request' && item.pullRequestId) {
      navigate({
        to: '/all/prs/$projectId/$prId',
        params: {
          projectId: item.projectId,
          prId: String(item.pullRequestId),
        },
      });
    } else if (item.taskId) {
      navigate({
        to: '/all/$taskId',
        params: { taskId: item.taskId },
      });
    }
  }, [navigate, item]);
```

**Step 4: Update `borderClasses` for assigned-work-item**

Add a case for selected work item cards. Add in the `isSelected` switch block:

```typescript
      case 'assigned-work-item':
        return 'border border-teal-500/60 bg-neutral-800 shadow-sm';
```

And in the non-selected switch, work items use the default `'border border-transparent'` which is fine.

**Step 5: Update `handleOpenInProject`**

Work items don't have a project-specific route, so skip them (or do nothing). The existing code checks for PR/task sources — work items simply won't match either condition, which is correct.

**Step 6: Update work item subtitle display**

In the JSX, the subtitle row currently shows `item.projectName`. For work items, we can also show the work item type. The existing template already handles this since `item.subtitle` is set to `"Bug #123"` etc. from the feed service. No change needed here.

**Step 7: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 10: Update Feed List Navigation for Work Items

**Files:**
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Update `isItemSelected` to handle work items**

The current `isItemSelected` checks `taskId` and `pullRequestId`. Work items need to check `workItemId`. Update:

```typescript
  const currentWorkItemId = params.workItemId as string | undefined;

  const isItemSelected = useCallback(
    (item: {
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
      projectId: string;
    }) => {
      if (item.taskId) {
        return item.taskId === currentTaskId;
      }
      if (item.workItemId && currentWorkItemId) {
        return (
          String(item.workItemId) === currentWorkItemId &&
          item.projectId === (currentProjectId ?? item.projectId)
        );
      }
      if (!item.pullRequestId || !currentPrId) {
        return false;
      }
      const prMatches = String(item.pullRequestId) === currentPrId;
      if (!prMatches) {
        return false;
      }
      if (!currentProjectId) {
        return true;
      }
      return item.projectId === currentProjectId;
    },
    [currentPrId, currentProjectId, currentTaskId, currentWorkItemId],
  );
```

**Step 2: Update `navigateToItem` for work items**

```typescript
  const navigateToItem = useCallback(
    (index: number) => {
      const item = navigableItems[index];
      if (!item) return;
      if (item.source === 'work-item' && item.workItemId) {
        navigate({
          to: '/all/work-items/$projectId/$workItemId',
          params: {
            projectId: item.projectId,
            workItemId: String(item.workItemId),
          },
        });
      } else if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/all/prs/$projectId/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
      } else if (item.taskId) {
        navigate({
          to: '/all/$taskId',
          params: { taskId: item.taskId },
        });
      }
    },
    [navigableItems, navigate],
  );
```

**Step 3: Update `openInProject` for work items**

Work items don't have a project-specific route. Add early return for work items:

```typescript
  const openInProject = useCallback(
    (item: {
      source: FeedItem['source'];
      projectId: string;
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
    }) => {
      if (item.source === 'note' || item.source === 'work-item') return;
      // ... rest unchanged
    },
    [navigate],
  );
```

**Step 4: Run ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

### Task 11: Update Feed Card Rendering for Work Items

**Files:**
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Ensure work items don't render as notes**

The `FeedCard` component dispatches on `item.source === 'note'`. Work items are not notes, so they'll correctly render as `FeedItemCard`. No change needed — work items flow through the default path. Verify this is the case.

**Step 2: Run the full lint and ts-check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

---

### Task 12: Final Validation

**Step 1: Install dependencies**

Run: `pnpm install`
Expected: PASS

**Step 2: Run lint with auto-fix**

Run: `pnpm lint --fix`
Expected: PASS

**Step 3: Run TypeScript check**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Run lint again for remaining issues**

Run: `pnpm lint`
Expected: PASS (no remaining errors)

---

## Summary of Changes

| File | Change |
|------|--------|
| `shared/feed-types.ts` | Add `'work-item'` source, `'assigned-work-item'` attention, work item fields on `FeedItem` |
| `src/features/feed/utils-feed-scoring.ts` | Add `'assigned-work-item': 75` to `BASE_URGENCY` |
| `electron/services/azure-devops-service.ts` | Add `queryAssignedWorkItems()` and `getWorkItemById()` functions |
| `electron/services/feed-service.ts` | Add `fetchWorkItemFeedItems()` with 3-min cache, integrate into `getFeedItems()` |
| `electron/ipc/handlers.ts` | Add `azureDevOps:getWorkItemById` handler |
| `electron/preload.ts` | Expose `getWorkItemById` on preload bridge |
| `src/lib/api.ts` | Add `getWorkItemById` to `Api` interface + mock |
| `src/hooks/use-work-items.ts` | Add `useWorkItemById()` hook |
| `src/features/feed/ui-feed-work-item-details/index.tsx` | New full-page work item details component |
| `src/routes/all/work-items/$projectId/$workItemId.tsx` | New route for work item details |
| `src/features/feed/ui-feed-list/feed-item-card.tsx` | Add work item icon, click handling, border styling |
| `src/features/feed/ui-feed-list/index.tsx` | Update `isItemSelected`, `navigateToItem`, `openInProject` for work items |
