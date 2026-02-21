# Work Items: Iteration Filter + Board View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add iteration filtering (defaulting to current sprint) and a board/kanban view toggle to the new task overlay's work items panel.

**Architecture:** Server-side iteration filtering via WIQL `[System.IterationPath]` condition, with iterations fetched from the Azure DevOps Team Settings API. Board view is a new component that shares data and selection state with the existing list view, toggled via a segmented control.

**Tech Stack:** Azure DevOps REST API, React, Zustand, TanStack React Query, Tailwind CSS, Lucide icons

---

### Task 1: Add `getIterations` to Azure DevOps Service

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**Step 1: Add the iteration type and export**

After the `AzureDevOpsWorkItem` interface (line 73), add:

```typescript
export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;
}
```

**Step 2: Add the `getIterations` function**

Add after `queryWorkItems` (after line 414), before `createPullRequest`:

```typescript
export async function getIterations(params: {
  providerId: string;
  projectName: string;
}): Promise<AzureDevOpsIteration[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/work/teamsettings/iterations?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch iterations: ${error}`);
  }

  const data: {
    count: number;
    value: Array<{
      id: string;
      name: string;
      path: string;
      attributes: {
        startDate?: string;
        finishDate?: string;
        timeFrame?: string;
      };
    }>;
  } = await response.json();

  const now = new Date();

  return data.value.map((iter) => {
    const startDate = iter.attributes.startDate ?? null;
    const finishDate = iter.attributes.finishDate ?? null;
    const isCurrent =
      startDate && finishDate
        ? now >= new Date(startDate) && now <= new Date(finishDate)
        : false;

    return {
      id: iter.id,
      name: iter.name,
      path: iter.path,
      startDate,
      finishDate,
      isCurrent,
    };
  });
}
```

**Step 3: Add `iterationPath` to `queryWorkItems` filters**

In the `queryWorkItems` function signature (line 271-276), add `iterationPath` to the filters type:

```typescript
  filters: {
    states?: string[];
    workItemTypes?: string[];
    excludeWorkItemTypes?: string[];
    searchText?: string;
    iterationPath?: string;  // <-- add this
  };
```

Then after the `searchText` condition block (after line 342), add:

```typescript
  // Filter by iteration path
  if (params.filters.iterationPath) {
    const escapedPath = params.filters.iterationPath.replace(/'/g, "''");
    conditions.push(`[System.IterationPath] = '${escapedPath}'`);
  }
```

---

### Task 2: Wire Up IPC + Preload + API Types

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handler**

In `electron/ipc/handlers.ts`, add the import `getIterations` to the import block from `azure-devops-service` (line 62-81).

Then after the `queryWorkItems` handler (after line 779), add:

```typescript
  ipcMain.handle(
    'azureDevOps:getIterations',
    (
      _,
      params: {
        providerId: string;
        projectName: string;
      },
    ) => getIterations(params),
  );
```

**Step 2: Update `queryWorkItems` handler filter type**

In the existing `queryWorkItems` handler (line 763-779), add `iterationPath?: string` to the `filters` object type (after line 775).

**Step 3: Add preload bridge method**

In `electron/preload.ts`, inside the `azureDevOps` object (after `queryWorkItems` at line 181), add:

```typescript
    getIterations: (params: { providerId: string; projectName: string }) =>
      ipcRenderer.invoke('azureDevOps:getIterations', params),
```

Also update the `queryWorkItems` params type to include `iterationPath?: string` in the filters.

**Step 4: Add API type and interface entry**

In `src/lib/api.ts`:

1. After the `AzureDevOpsWorkItem` interface (line 175), add:

```typescript
export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;
}
```

2. In the `Api` interface `azureDevOps` section, add `iterationPath?: string` to the `queryWorkItems` filters type (after line 409).

3. After `queryWorkItems` in the Api interface (after line 411), add:

```typescript
    getIterations: (params: {
      providerId: string;
      projectName: string;
    }) => Promise<AzureDevOpsIteration[]>;
```

4. In the fallback `api` object `azureDevOps` section (around line 802), add:

```typescript
        getIterations: async () => [],
```

---

### Task 3: Add `useIterations` Hook

**Files:**
- Modify: `src/hooks/use-work-items.ts`

**Step 1: Add the hook**

Add after the existing `useCurrentAzureUser` hook:

```typescript
export function useIterations(params: {
  providerId: string;
  projectName: string;
}) {
  return useQuery<AzureDevOpsIteration[]>({
    queryKey: ['iterations', params.providerId, params.projectName],
    queryFn: () => api.azureDevOps.getIterations(params),
    enabled: !!params.providerId && !!params.projectName,
    staleTime: 5 * 60_000, // 5 minutes - iterations change infrequently
  });
}
```

Update the import at the top to include `AzureDevOpsIteration`:

```typescript
import { api, type AzureDevOpsWorkItem, type AzureDevOpsUser, type AzureDevOpsIteration } from '@/lib/api';
```

---

### Task 4: Add `workItemsViewMode` to Draft Store

**Files:**
- Modify: `src/stores/new-task-draft.ts`

**Step 1: Add type and field**

Add the view mode type near the top (after line 9):

```typescript
export type WorkItemsViewMode = 'list' | 'board';
```

Add to the `NewTaskDraft` interface (after `searchStep` on line 19):

```typescript
  workItemsViewMode: WorkItemsViewMode;
```

Add to `defaultDraft` (after `searchStep: 'select'` on line 49):

```typescript
  workItemsViewMode: 'list',
```

---

### Task 5: Add Iteration Dropdown + View Toggle to SearchModeContent

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Import new dependencies**

Add to imports:

```typescript
import { List, Columns3 } from 'lucide-react';
import { useIterations } from '@/hooks/use-work-items';
import type { AzureDevOpsIteration } from '@/lib/api';
import type { WorkItemsViewMode } from '@/stores/new-task-draft';
```

Import `WorkItemBoard` (will be created in Task 6):

```typescript
import { WorkItemBoard } from '../ui-work-item-board';
```

**Step 2: Update the parent `NewTaskOverlay` to pass `iterationPath` and `viewMode`**

In the `useWorkItems` call at line 159-164, add `iterationPath` to filters. This requires tracking the selected iteration. The iteration selection is local to the search mode, so we'll manage it in `SearchModeContent`. But the parent also fetches work items for keyboard navigation (line 159).

To keep things simple, remove the `useWorkItems` call from the parent and lift the `filteredWorkItems` from `SearchModeContent` via the existing `highlightedWorkItemId` pattern (the parent already uses DOM queries for keyboard navigation, not the data array). No change needed to the parent's work items fetch — it's used for `fuse` at line 176 and `filteredWorkItems` at line 187, but both are duplicated in `SearchModeContent`.

Actually, looking more carefully, the parent uses `filteredWorkItems` (line 187) only for `selectedWorkItems` (line 201) which is used in the compose step. And `workItems` is used for fuse search (line 176). These are all duplicated inside `SearchModeContent`. The parent's `workItems` is also used for `selectedWorkItems` (line 201-204) which feeds into `expandTemplate` and `handleStartTask`.

**The cleanest approach**: Keep the parent's `useWorkItems` call but also pass the `iterationPath` to it. Add iteration state to `SearchModeContent` and pass it back up via a callback. Actually, the simplest approach: pass `viewMode` and `iterationPath` from the draft store into `SearchModeContent`, and have `SearchModeContent` manage iteration selection internally (since the parent only needs `workItems` for the compose step which uses full unfiltered data).

Looking at it again — the parent's workItems is used for `selectedWorkItems` at line 201 which needs ALL work items (not filtered by iteration) to resolve selected IDs. So the parent should keep its unfiltered fetch. `SearchModeContent` will do its own filtered fetch.

**Changes to SearchModeContent props**: Add `viewMode` and `onViewModeChange`.

Update `SearchModeContent` call (around line 796-807) to pass view mode:

```tsx
<SearchModeContent
  projectId={selectedProjectId}
  project={selectedProject}
  filter={draft?.workItemsFilter ?? ''}
  selectedWorkItemIds={draft?.workItemIds ?? []}
  highlightedWorkItemId={highlightedWorkItemId}
  viewMode={draft?.workItemsViewMode ?? 'list'}
  onViewModeChange={(mode) => updateDraft({ workItemsViewMode: mode })}
  onWorkItemToggle={handleWorkItemToggle}
  onWorkItemHighlight={handleWorkItemHighlight}
  onAdvanceToCompose={advanceToCompose}
  canAdvance={canAdvanceToCompose}
/>
```

**Step 3: Rework `SearchModeContent` header**

Add `viewMode` and `onViewModeChange` to props:

```typescript
  viewMode: WorkItemsViewMode;
  onViewModeChange: (mode: WorkItemsViewMode) => void;
```

Add iteration state inside `SearchModeContent`:

```typescript
  // Fetch iterations
  const { data: iterations = [] } = useIterations({
    providerId: project?.workItemProviderId ?? '',
    projectName: project?.workItemProjectName ?? '',
  });

  // Find current iteration for default selection
  const currentIteration = useMemo(
    () => iterations.find((i) => i.isCurrent),
    [iterations],
  );

  // Selected iteration path (null = "All Iterations")
  const [selectedIterationPath, setSelectedIterationPath] = useState<string | null>(undefined as unknown as string | null);

  // Auto-select current iteration when iterations load
  useEffect(() => {
    if (currentIteration && selectedIterationPath === undefined as unknown as string | null) {
      setSelectedIterationPath(currentIteration.path);
    }
  }, [currentIteration]);
```

Actually, cleaner approach — use a sentinel value:

```typescript
  // Selected iteration: 'current' (auto), null (all), or a path
  const [selectedIterationId, setSelectedIterationId] = useState<string>('__current__');

  const resolvedIterationPath = useMemo(() => {
    if (selectedIterationId === '__all__') return undefined;
    if (selectedIterationId === '__current__') {
      return iterations.find((i) => i.isCurrent)?.path;
    }
    return iterations.find((i) => i.id === selectedIterationId)?.path;
  }, [selectedIterationId, iterations]);
```

Update the `useWorkItems` call to include `iterationPath`:

```typescript
  const { data: workItems = [], isLoading } = useWorkItems({
    providerId: project?.workItemProviderId ?? '',
    projectId: project?.workItemProjectId ?? '',
    projectName: project?.workItemProjectName ?? '',
    filters: {
      excludeWorkItemTypes: ['Test Suite', 'Epic', 'Feature'],
      iterationPath: resolvedIterationPath,
    },
  });
```

**Step 4: Build the header bar**

Replace the existing header (lines 1058-1077) with:

```tsx
<div className="mb-2 flex items-center justify-between gap-2">
  <span className="text-xs font-medium text-neutral-400 uppercase">
    Work Items ({filteredWorkItems.length})
    {selectedWorkItemIds.length > 0 && (
      <span className="ml-2 text-blue-400">
        {selectedWorkItemIds.length} selected
      </span>
    )}
  </span>

  <div className="flex items-center gap-2">
    {/* Iteration dropdown */}
    {iterations.length > 0 && (
      <Select
        value={selectedIterationId}
        options={iterationOptions}
        onChange={setSelectedIterationId}
        label="Iteration"
        side="bottom"
      />
    )}

    {/* View mode toggle */}
    <div className="flex rounded border border-neutral-600">
      <button
        type="button"
        onClick={() => onViewModeChange('list')}
        className={clsx(
          'flex items-center px-1.5 py-1',
          viewMode === 'list'
            ? 'bg-neutral-600 text-white'
            : 'text-neutral-400 hover:text-neutral-200',
        )}
        title="List view"
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('board')}
        className={clsx(
          'flex items-center px-1.5 py-1',
          viewMode === 'board'
            ? 'bg-neutral-600 text-white'
            : 'text-neutral-400 hover:text-neutral-200',
        )}
        title="Board view"
      >
        <Columns3 className="h-3.5 w-3.5" />
      </button>
    </div>

    {/* Next button */}
    {canAdvance && (
      <button
        onClick={onAdvanceToCompose}
        className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
      >
        Next
        <ChevronRight className="h-3 w-3" />
        <Kbd shortcut="cmd+enter" className="ml-1" />
      </button>
    )}
  </div>
</div>
```

Compute `iterationOptions` as a `useMemo`:

```typescript
  const iterationOptions = useMemo(() => {
    const opts = [
      { value: '__current__', label: currentIteration ? `Current: ${currentIteration.name}` : 'Current Iteration' },
      { value: '__all__', label: 'All Iterations' },
    ];
    // Add individual iterations (most recent first — reverse since API returns chronological)
    for (const iter of [...iterations].reverse()) {
      if (iter.isCurrent) continue; // already represented by __current__
      opts.push({ value: iter.id, label: iter.name });
    }
    return opts;
  }, [iterations, currentIteration]);
```

**Step 5: Swap view components based on mode**

Replace the `WorkItemList` rendering (lines 1078-1088) with:

```tsx
<div className="overflow-y-auto">
  {viewMode === 'list' ? (
    <WorkItemList
      workItems={filteredWorkItems}
      highlightedWorkItemId={highlightedWorkItemId}
      selectedWorkItemIds={selectedWorkItemIds}
      providerId={project?.workItemProviderId ?? undefined}
      onToggleSelect={onWorkItemToggle}
      onHighlight={onWorkItemHighlight}
    />
  ) : (
    <WorkItemBoard
      workItems={filteredWorkItems}
      highlightedWorkItemId={highlightedWorkItemId}
      selectedWorkItemIds={selectedWorkItemIds}
      providerId={project?.workItemProviderId ?? undefined}
      onToggleSelect={onWorkItemToggle}
      onHighlight={onWorkItemHighlight}
    />
  )}
</div>
```

---

### Task 6: Create the Board View Component

**Files:**
- Create: `src/features/new-task/ui-work-item-board/index.tsx`

**Step 1: Create the component**

The board groups work items by state into columns, ordered by `STATUS_PRIORITY`. Each card shows a checkbox, type icon, `#id`, title, and assignee avatar.

```tsx
import clsx from 'clsx';
import { Bug, BookOpen, CheckSquare, FileText, Check } from 'lucide-react';
import { useMemo } from 'react';

import { UserAvatar } from '@/common/ui/user-avatar';
import { useCurrentAzureUser } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';

// Status priority for column ordering (lower = further left)
const STATUS_PRIORITY: Record<string, number> = {
  New: 1,
  'To Do': 1.5,
  Active: 2,
  'In Progress': 2.5,
  'In Design': 2.5,
  Resolved: 3,
  Deployed: 3.5,
  Closed: 4,
  Done: 4.5,
  Removed: 5,
};

function getStatusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? 3;
}

// Column header color
function getColumnColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'new':
    case 'to do':
      return 'border-neutral-500';
    case 'active':
    case 'in progress':
    case 'in design':
      return 'border-blue-500';
    case 'resolved':
    case 'done':
    case 'closed':
    case 'deployed':
      return 'border-green-500';
    case 'removed':
      return 'border-red-500';
    default:
      return 'border-neutral-500';
  }
}

function WorkItemTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'Bug':
      return <Bug className="h-3 w-3 shrink-0 text-red-400" />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className="h-3 w-3 shrink-0 text-blue-400" />;
    case 'Task':
      return <CheckSquare className="h-3 w-3 shrink-0 text-green-400" />;
    default:
      return <FileText className="h-3 w-3 shrink-0 text-neutral-400" />;
  }
}

function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={clsx(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
        checked
          ? 'border-blue-500 bg-blue-500 text-white'
          : 'border-neutral-500 bg-transparent',
      )}
    >
      {checked ? <Check className="h-2.5 w-2.5" /> : null}
    </div>
  );
}

export function WorkItemBoard({
  workItems,
  highlightedWorkItemId,
  selectedWorkItemIds,
  providerId,
  onToggleSelect,
  onHighlight,
}: {
  workItems: AzureDevOpsWorkItem[];
  highlightedWorkItemId: string | null;
  selectedWorkItemIds: string[];
  providerId?: string;
  onToggleSelect: (workItem: AzureDevOpsWorkItem) => void;
  onHighlight: (workItem: AzureDevOpsWorkItem) => void;
}) {
  const { data: currentUser } = useCurrentAzureUser(providerId ?? null);

  // Group work items by state
  const columns = useMemo(() => {
    const groups = new Map<string, AzureDevOpsWorkItem[]>();
    for (const item of workItems) {
      const state = item.fields.state;
      const group = groups.get(state) ?? [];
      group.push(item);
      groups.set(state, group);
    }

    // Sort columns by status priority
    return [...groups.entries()]
      .sort(([a], [b]) => getStatusPriority(a) - getStatusPriority(b))
      .map(([state, items]) => ({ state, items }));
  }, [workItems]);

  if (workItems.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center">
        <p className="text-sm text-neutral-400">No work items available</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full gap-2 overflow-x-auto pb-2"
      data-work-item-list
    >
      {columns.map(({ state, items }) => (
        <div
          key={state}
          className="flex w-56 shrink-0 flex-col rounded bg-neutral-800/50"
        >
          {/* Column header */}
          <div
            className={clsx(
              'border-t-2 px-2 py-1.5',
              getColumnColor(state),
            )}
          >
            <span className="text-xs font-medium text-neutral-300">
              {state}
            </span>
            <span className="ml-1.5 text-xs text-neutral-500">
              {items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5">
            {items.map((workItem) => {
              const isHighlighted =
                workItem.id.toString() === highlightedWorkItemId;
              const isSelected = selectedWorkItemIds.includes(
                workItem.id.toString(),
              );

              return (
                <button
                  key={workItem.id}
                  type="button"
                  data-work-item-id={workItem.id}
                  onClick={() => {
                    onHighlight(workItem);
                    onToggleSelect(workItem);
                  }}
                  className={clsx(
                    'flex flex-col gap-1.5 rounded border p-2 text-left',
                    isHighlighted
                      ? 'border-blue-500 bg-neutral-700/70'
                      : 'border-neutral-700 bg-neutral-750 hover:border-neutral-600',
                  )}
                >
                  {/* Top row: checkbox + type icon + id */}
                  <div className="flex items-center gap-1.5">
                    <SelectionCheckbox checked={isSelected} />
                    <WorkItemTypeIcon
                      type={workItem.fields.workItemType}
                    />
                    <span className="text-[10px] text-neutral-500">
                      #{workItem.id}
                    </span>
                    {/* Assignee (far right) */}
                    <div className="ml-auto">
                      {workItem.fields.assignedTo && (
                        <UserAvatar
                          name={workItem.fields.assignedTo}
                          title={
                            currentUser?.displayName &&
                            workItem.fields.assignedTo ===
                              currentUser.displayName
                              ? `${workItem.fields.assignedTo} (you)`
                              : workItem.fields.assignedTo
                          }
                          highlight={
                            !!currentUser?.displayName &&
                            workItem.fields.assignedTo ===
                              currentUser.displayName
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* Title (2-line clamp) */}
                  <span className="line-clamp-2 text-xs text-neutral-200">
                    {workItem.fields.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note: Uses `data-work-item-list` attribute on the board container so the parent's keyboard navigation (which uses `document.querySelector('[data-work-item-list]')` and `querySelectorAll('[data-work-item-id]')`) continues to work for both views.

---

### Task 7: Lint + Type Check

**Step 1: Run lint**

```bash
pnpm lint --fix
```

**Step 2: Run type check**

```bash
pnpm ts-check
```

Fix any errors that come up.
