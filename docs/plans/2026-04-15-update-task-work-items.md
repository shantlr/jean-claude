# Update Task Work Items Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to add/remove associated Azure DevOps work items on existing tasks, not just during task creation.

**Architecture:** Add an "Edit Work Items" button next to the existing work item chips in the task panel header. Clicking it opens a popover/dialog that reuses the existing `WorkItemsBrowser` component for adding work items and shows currently linked items with remove buttons. The task is updated via the existing `useUpdateTask` mutation which already supports `workItemIds`/`workItemUrls` fields.

**Tech Stack:** React, Zustand, TanStack React Query, existing `WorkItemsBrowser` component, existing `useUpdateTask` hook.

---

### Task 1: Create the Work Items Editor Component

This component will display currently linked work items with remove capability and allow adding new ones via the existing `WorkItemsBrowser`.

**Files:**
- Create: `src/features/task/ui-task-panel/work-items-editor.tsx`

**Step 1: Create the component file**

```tsx
import { ListTodo, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { IconButton } from '@/common/ui/icon-button';
import { WorkItemsBrowser } from '@/features/agent/ui-work-items-browser';

import type { AzureDevOpsWorkItem } from '@/lib/api';

export function WorkItemsEditor({
  projectId,
  providerId,
  azureProjectId,
  azureProjectName,
  workItemIds,
  workItemUrls,
  onUpdate,
  onClose,
}: {
  projectId: string;
  providerId: string;
  azureProjectId: string;
  azureProjectName: string;
  workItemIds: string[];
  workItemUrls: string[];
  onUpdate: (update: {
    workItemIds: string[] | null;
    workItemUrls: string[] | null;
  }) => void;
  onClose: () => void;
}) {
  const [showBrowser, setShowBrowser] = useState(false);

  function handleRemove(index: number) {
    const newIds = workItemIds.filter((_, i) => i !== index);
    const newUrls = workItemUrls.filter((_, i) => i !== index);
    onUpdate({
      workItemIds: newIds.length > 0 ? newIds : null,
      workItemUrls: newUrls.length > 0 ? newUrls : null,
    });
  }

  function handleAdd(wi: AzureDevOpsWorkItem) {
    const wiId = String(wi.id);
    // Don't add duplicates
    if (workItemIds.includes(wiId)) {
      setShowBrowser(false);
      return;
    }
    onUpdate({
      workItemIds: [...workItemIds, wiId],
      workItemUrls: [...workItemUrls, wi.url],
    });
    setShowBrowser(false);
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-3 shadow-lg">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-200">
          Linked Work Items
        </span>
        <IconButton
          onClick={onClose}
          icon={<X />}
          size="sm"
          variant="ghost"
          tooltip="Close"
        />
      </div>

      {/* Current work items */}
      {workItemIds.length > 0 ? (
        <div className="mb-2 space-y-1">
          {workItemIds.map((id, index) => {
            const url = workItemUrls[index];
            return (
              <div
                key={id}
                className="flex items-center justify-between rounded px-2 py-1 hover:bg-neutral-700"
              >
                <span className="text-sm text-neutral-200">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      #{id}
                    </a>
                  ) : (
                    `#${id}`
                  )}
                </span>
                <IconButton
                  onClick={() => handleRemove(index)}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  tooltip={`Remove work item #${id}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mb-2 text-sm text-neutral-400">No linked work items</p>
      )}

      {/* Add work item */}
      {showBrowser ? (
        <WorkItemsBrowser
          localProjectId={projectId}
          providerId={providerId}
          projectId={azureProjectId}
          projectName={azureProjectName}
          onSelect={handleAdd}
          onClose={() => setShowBrowser(false)}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBrowser(true)}
          icon={<Plus />}
        >
          Add Work Item
        </Button>
      )}
    </div>
  );
}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/work-items-editor.tsx
git commit -m "feat: add WorkItemsEditor component for editing task work items"
```

---

### Task 2: Integrate Work Items Editor into the Task Panel Header

Replace the static work item chips with an interactive section that allows editing.

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (around lines 934-959 and imports)

**Step 1: Add state and import**

Add import near the top of the file (around line 17, with lucide imports):

```tsx
// Add to the lucide import:
import { ListTodo } from 'lucide-react';
```

Add import for the new component (near line 112, with other local imports):

```tsx
import { WorkItemsEditor } from './work-items-editor';
```

Inside the `TaskPanel` function body (around line 184), add state for the editor:

```tsx
const [showWorkItemsEditor, setShowWorkItemsEditor] = useState(false);
```

Also derive `hasWorkItemsLink` from the project:

```tsx
const hasWorkItemsLink =
  !!project?.workItemProviderId && !!project?.workItemProjectId;
```

**Step 2: Replace the work item badges section**

Replace the existing work item badges block (lines 934-959) with:

```tsx
{/* Work item badges */}
{task.workItemIds &&
  task.workItemIds.length > 0 &&
  task.workItemIds.map((workItemId, index) => {
    const workItemUrl = task.workItemUrls?.[index];
    return (
      <Chip
        key={workItemId}
        size="sm"
        color="blue"
        onClick={
          workItemUrl
            ? () => window.open(workItemUrl, '_blank')
            : undefined
        }
        disabled={!workItemUrl}
        title={
          workItemUrl
            ? `Open work item #${workItemId} in browser`
            : `Work item #${workItemId}`
        }
      >
        #{workItemId}
      </Chip>
    );
  })}

{/* Edit / Add work items button */}
{hasWorkItemsLink && (
  <IconButton
    onClick={() => setShowWorkItemsEditor(true)}
    icon={<ListTodo />}
    size="sm"
    variant="ghost"
    tooltip={
      task.workItemIds?.length
        ? 'Edit linked work items'
        : 'Link work items'
    }
  />
)}
```

**Step 3: Add the editor popover**

Place the editor overlay inside the task panel, right after the header's closing `</div>` (around line 960, after the `shrink items-center gap-2` div closes). This should be positioned as an absolute/dropdown element. A simple approach: render it conditionally as a floating panel just below the header area.

Find a suitable place inside the component's return JSX, after the header bar section, and add:

```tsx
{/* Work Items Editor */}
{showWorkItemsEditor && hasWorkItemsLink && (
  <div className="absolute right-4 top-12 z-50 w-80">
    <WorkItemsEditor
      projectId={project!.id}
      providerId={project!.workItemProviderId!}
      azureProjectId={project!.workItemProjectId!}
      azureProjectName={project!.workItemProjectName!}
      workItemIds={task.workItemIds ?? []}
      workItemUrls={task.workItemUrls ?? []}
      onUpdate={({ workItemIds, workItemUrls }) => {
        updateTask.mutate({
          id: taskId,
          data: { workItemIds, workItemUrls },
        });
      }}
      onClose={() => setShowWorkItemsEditor(false)}
    />
  </div>
)}
```

**Important**: Ensure the parent container of the header has `relative` positioning. Look at the wrapping element and add `relative` to its className if not already present.

**Step 4: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: integrate work items editor into task panel header"
```

---

### Task 3: Add Work Items Edit to the Task Overflow Menu

For discoverability, add an "Edit Work Items" option in the task panel's overflow menu (the `⌘M` menu).

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (overflow menu section, around line 982+)

**Step 1: Add a menu item in the overflow dropdown**

Find the overflow menu `<Dropdown>` section (starts around line 983). Add a new `<DropdownItem>` in a logical group (after the view toggles group, before destructive actions):

```tsx
{hasWorkItemsLink && (
  <DropdownItem
    icon={<ListTodo />}
    onClick={() => setShowWorkItemsEditor(true)}
  >
    {task.workItemIds?.length
      ? 'Edit Work Items'
      : 'Link Work Items'}
  </DropdownItem>
)}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: add work items edit option to task overflow menu"
```

---

### Task 4: Close Editor on Outside Click / Escape

Ensure the work items editor closes when clicking outside or pressing Escape.

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Add click-outside and escape handling**

Wrap the work items editor in a backdrop that captures outside clicks:

```tsx
{showWorkItemsEditor && hasWorkItemsLink && (
  <>
    {/* Backdrop for click-outside */}
    <div
      className="fixed inset-0 z-40"
      onClick={() => setShowWorkItemsEditor(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setShowWorkItemsEditor(false);
      }}
    />
    <div className="absolute right-4 top-12 z-50 w-80">
      <WorkItemsEditor
        projectId={project!.id}
        providerId={project!.workItemProviderId!}
        azureProjectId={project!.workItemProjectId!}
        azureProjectName={project!.workItemProjectName!}
        workItemIds={task.workItemIds ?? []}
        workItemUrls={task.workItemUrls ?? []}
        onUpdate={({ workItemIds, workItemUrls }) => {
          updateTask.mutate({
            id: taskId,
            data: { workItemIds, workItemUrls },
          });
        }}
        onClose={() => setShowWorkItemsEditor(false)}
      />
    </div>
  </>
)}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: close work items editor on outside click"
```

---

### Task 5: Final Verification

**Step 1: Full lint and type check**

Run: `pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint`
Expected: All PASS, no errors

**Step 2: Manual testing checklist**

- [ ] Open a task panel for a project that has Azure DevOps work items linked
- [ ] Verify existing work item chips still display and are clickable
- [ ] Click the `ListTodo` icon button next to work items — editor opens
- [ ] In the editor, click "Add Work Item" — `WorkItemsBrowser` opens inline
- [ ] Select a work item — it appears in the linked items list
- [ ] Click the `X` button on a linked work item — it is removed
- [ ] Click outside the editor or press Escape — editor closes
- [ ] Verify the overflow menu shows "Edit Work Items" / "Link Work Items"
- [ ] For a project WITHOUT Azure DevOps link, verify no edit button appears
- [ ] For a task with no work items, verify "Link Work Items" label is shown
- [ ] Reload the page and verify changes persisted

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/features/task/ui-task-panel/work-items-editor.tsx` | **New** — Editor component with add/remove work items |
| `src/features/task/ui-task-panel/index.tsx` | **Modified** — Integrate editor button, popover, and overflow menu item |

**No backend changes needed.** The existing `UpdateTask` type already includes `workItemIds` and `workItemUrls`, and the `useUpdateTask` hook + IPC handler + repository already support updating these fields. This is purely a UI feature.
