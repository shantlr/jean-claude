# PR Work Items Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show Azure DevOps work items linked to a PR in the PR overview page, like the ADO PR detail page.

**Architecture:** Wire existing `getPullRequestWorkItems()` backend through IPC → preload → api → hook → new UI component rendered in PrOverview. Read-only display, no selection.

**Tech Stack:** Electron IPC, React Query, Tailwind, lucide-react icons

---

### Task 1: Register IPC Handler

**Files:**
- Modify: `electron/ipc/handlers.ts` (after line 1999, after getPullRequestThreads handler)

**Step 1: Add IPC handler registration**

Insert after the `azureDevOps:getPullRequestThreads` handler block (line 1999):

```typescript
  ipcMain.handle(
    'azureDevOps:getPullRequestWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestWorkItems(params),
  );
```

Note: `getPullRequestWorkItems` is already imported at line 87.

**Step 2: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: register getPullRequestWorkItems IPC handler"
```

---

### Task 2: Add Preload Bridge Method

**Files:**
- Modify: `electron/preload.ts` (after getPullRequestThreads, ~line 301)

**Step 1: Add preload method**

Insert after `getPullRequestThreads` method:

```typescript
    getPullRequestWorkItems: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestWorkItems', params),
```

**Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add getPullRequestWorkItems to preload bridge"
```

---

### Task 3: Add API Type Definition

**Files:**
- Modify: `src/lib/api.ts` (after getPullRequestThreads, ~line 608)

**Step 1: Add method to azureDevOps interface**

Insert after `getPullRequestThreads` method definition:

```typescript
    getPullRequestWorkItems: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsWorkItem[]>;
```

**Step 2: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add getPullRequestWorkItems to API interface"
```

---

### Task 4: Add React Query Hook

**Files:**
- Modify: `src/hooks/use-pull-requests.ts` (after usePullRequestThreads, ~line 206)

**Step 1: Add hook**

Insert after `usePullRequestThreads`:

```typescript
export function usePullRequestWorkItems(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: ['pull-request-work-items', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestWorkItems({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 60_000,
  });
}
```

**Step 2: Add `AzureDevOpsWorkItem` to the imports from `@/lib/api` at the top of the file**

**Step 3: Commit**

```bash
git add src/hooks/use-pull-requests.ts
git commit -m "feat: add usePullRequestWorkItems hook"
```

---

### Task 5: Create PR Work Items UI Component

**Files:**
- Create: `src/features/pull-request/ui-pr-work-items/index.tsx`

**Step 1: Create component**

Collapsible section with work item rows. Each row: type icon, ID link, title, state badge, assignee. Clicking ID opens in ADO (external link). Uses `WorkItemTypeIcon` from shared. Matches style of PrChecks section.

```tsx
import clsx from 'clsx';
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { AzureDevOpsWorkItem } from '@/lib/api';

import { WorkItemTypeIcon } from '../../work-item/ui-work-item-shared';

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'in progress':
    case 'active':
      return 'bg-acc/20 text-acc-ink';
    case 'new':
    case 'to do':
      return 'bg-bg-2/20 text-ink-2';
    case 'resolved':
    case 'done':
    case 'closed':
      return 'bg-status-done/20 text-status-done';
    case 'removed':
      return 'bg-status-fail/20 text-status-fail';
    default:
      return 'bg-bg-2/20 text-ink-2';
  }
}

export function PrWorkItems({
  workItems,
  isLoading,
}: {
  workItems: AzureDevOpsWorkItem[];
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-ink-2 mb-3 text-sm font-medium">Work Items</h2>
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="text-ink-3 h-4 w-4 animate-spin" />
          <span className="text-ink-3 text-xs">Loading work items…</span>
        </div>
      </div>
    );
  }

  if (workItems.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-ink-2 mb-3 flex items-center gap-1 text-sm font-medium"
      >
        <ChevronDown
          className={clsx(
            'h-3.5 w-3.5 transition-transform',
            !expanded && '-rotate-90',
          )}
        />
        Work Items
        <span className="text-ink-3 ml-1 text-xs font-normal">
          ({workItems.length})
        </span>
      </button>

      {expanded && (
        <div className="space-y-1">
          {workItems.map((wi) => (
            <a
              key={wi.id}
              href={wi.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-bg-2 group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
            >
              <WorkItemTypeIcon
                type={wi.fields.workItemType}
                size="sm"
              />
              <span className="text-acc-ink text-xs font-medium">
                #{wi.id}
              </span>
              <span className="text-ink-1 min-w-0 flex-1 truncate text-xs">
                {wi.fields.title}
              </span>
              <span
                className={clsx(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  getStatusColor(wi.fields.state),
                )}
              >
                {wi.fields.state}
              </span>
              {wi.fields.assignedTo && (
                <span className="text-ink-3 shrink-0 truncate text-[10px]">
                  {wi.fields.assignedTo}
                </span>
              )}
              <ExternalLink className="text-ink-3 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/pull-request/ui-pr-work-items/index.tsx
git commit -m "feat: create PrWorkItems component"
```

---

### Task 6: Wire Into PrOverview

**Files:**
- Modify: `src/features/pull-request/ui-pr-overview/index.tsx`

**Step 1: Add imports**

Add to imports:
```typescript
import { usePullRequestWorkItems } from '@/hooks/use-pull-requests';
import { PrWorkItems } from '../ui-pr-work-items';
```

**Step 2: Add hook call inside PrOverview component**

After the existing hooks (around line 57):
```typescript
const { data: workItems = [], isLoading: isWorkItemsLoading } =
  usePullRequestWorkItems(projectId, prId);
```

**Step 3: Add component to JSX**

Insert between the `<PrChecks>` block and the Description `<h2>`, around line 168:

```tsx
{/* Work Items */}
<PrWorkItems
  workItems={workItems}
  isLoading={isWorkItemsLoading}
/>
```

**Step 4: Commit**

```bash
git add src/features/pull-request/ui-pr-overview/index.tsx
git commit -m "feat: add work items section to PR overview"
```

---

### Task 7: Verify

**Step 1:** Run `pnpm install`
**Step 2:** Run `pnpm lint --fix`
**Step 3:** Run `pnpm ts-check`
**Step 4:** Run `pnpm lint`
**Step 5:** Fix any errors
