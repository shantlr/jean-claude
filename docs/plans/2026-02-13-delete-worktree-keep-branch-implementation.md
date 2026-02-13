# Delete Worktree (Keep Branch) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to delete a task's worktree directory while keeping the git branch, via a dropdown menu on the branch button and an auto-delete checkbox in the Create PR dialog.

**Architecture:** New IPC handler `tasks:worktree:deleteKeepBranch` calls existing `cleanupWroktree` with `branchCleanup: 'keep'`, then nulls the task's `worktreePath`. A new dropdown component replaces the branch button in the task header, and the Create PR dialog gains a checkbox.

**Tech Stack:** Electron IPC, React, TanStack React Query, Tailwind CSS, Lucide icons

**Design doc:** `docs/plans/2026-02-13-delete-worktree-keep-branch-design.md`

---

### Task 1: Backend — IPC Handler + Preload + API Types

Add the IPC handler that deletes a worktree but keeps the branch, wire it through preload, and add API types.

**Files:**
- Modify: `electron/ipc/handlers.ts` (after the `tasks:worktree:pushBranch` handler ~line 884)
- Modify: `electron/preload.ts` (in the `worktree:` object ~line 86-118)
- Modify: `src/lib/api.ts` (in the `worktree:` type definition ~line 332-354 and mock ~line 695-715)

**Step 1: Add IPC handler in `electron/ipc/handlers.ts`**

After the existing `tasks:worktree:pushBranch` handler, add:

```typescript
ipcMain.handle(
  'tasks:worktree:deleteKeepBranch',
  async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath) return;

    const project = await ProjectRepository.findById(task.projectId);
    if (!project) return;

    await cleanupWroktree({
      worktreePath: task.worktreePath,
      projectPath: project.path,
      branchCleanup: 'keep',
      force: true,
    });

    await TaskRepository.update(taskId, { worktreePath: null });
  },
);
```

**Step 2: Expose in `electron/preload.ts`**

Inside the `worktree: { ... }` object (after `pushBranch`), add:

```typescript
deleteKeepBranch: (taskId: string) =>
  ipcRenderer.invoke('tasks:worktree:deleteKeepBranch', taskId),
```

**Step 3: Add to API type interface in `src/lib/api.ts`**

In the `worktree:` type block (after `pushBranch`), add:

```typescript
deleteKeepBranch: (taskId: string) => Promise<void>;
```

In the mock/fallback `worktree:` block (after `pushBranch`), add:

```typescript
deleteKeepBranch: async () => {},
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add IPC handler for deleting worktree while keeping branch"
```

---

### Task 2: React Query Hook — `useDeleteWorktree`

Add a mutation hook for the new IPC method.

**Files:**
- Modify: `src/hooks/use-tasks.ts` (after the existing `useDeleteTask` hook ~line 109-121)

**Step 1: Add the mutation hook**

After `useDeleteTask`, add:

```typescript
export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.worktree.deleteKeepBranch(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/hooks/use-tasks.ts
git commit -m "feat: add useDeleteWorktree React Query mutation hook"
```

---

### Task 3: Worktree Branch Dropdown Menu Component

Create a new dropdown component that replaces the existing branch button in the task header. Shows "Open in Editor" and "Delete Worktree" options.

**Files:**
- Create: `src/features/agent/ui-worktree-branch-menu/index.tsx`

**Step 1: Create the component**

```tsx
import { ExternalLink, GitBranch, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export function WorktreeBranchMenu({
  branchName,
  onOpenInEditor,
  onDeleteWorktree,
}: {
  branchName: string;
  onOpenInEditor: () => void;
  onDeleteWorktree: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpenInEditor = useCallback(() => {
    setIsOpen(false);
    onOpenInEditor();
  }, [onOpenInEditor]);

  const handleDeleteWorktree = useCallback(() => {
    setIsOpen(false);
    onDeleteWorktree();
  }, [onDeleteWorktree]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
        title="Worktree branch actions"
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{branchName}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
          <button
            onClick={handleOpenInEditor}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Editor
          </button>
          <button
            onClick={handleDeleteWorktree}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-neutral-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Worktree
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/agent/ui-worktree-branch-menu/index.tsx
git commit -m "feat: add WorktreeBranchMenu dropdown component"
```

---

### Task 4: Delete Worktree Confirmation Dialog

Create the confirmation dialog that warns about uncommitted changes and confirms deletion.

**Files:**
- Create: `src/features/agent/ui-worktree-branch-menu/delete-worktree-dialog.tsx`

**Step 1: Create the dialog**

```tsx
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useWorktreeStatus } from '@/hooks/use-worktree-diff';

export function DeleteWorktreeDialog({
  isOpen,
  onClose,
  onConfirm,
  branchName,
  taskId,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  branchName: string;
  taskId: string;
  isPending: boolean;
}) {
  const { data: status, isLoading: isStatusLoading } =
    useWorktreeStatus(isOpen ? taskId : null);

  // Reset on close
  const [hasConfirmedWarning, setHasConfirmedWarning] = useState(false);
  useEffect(() => {
    if (!isOpen) setHasConfirmedWarning(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasUncommitted = status?.hasUncommittedChanges ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
        <h2 className="mb-3 text-lg font-semibold text-neutral-200">
          Delete Worktree
        </h2>

        {isStatusLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking worktree status...
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-400">
              This will remove the worktree directory. The branch{' '}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
                {branchName}
              </code>{' '}
              will be kept.
            </p>

            {hasUncommitted && (
              <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-950/50 px-3 py-2 text-sm text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  There are uncommitted changes that will be lost.
                </span>
              </div>
            )}

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
                onClick={onConfirm}
                disabled={isPending}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                {isPending ? 'Deleting...' : 'Delete Worktree'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/agent/ui-worktree-branch-menu/delete-worktree-dialog.tsx
git commit -m "feat: add DeleteWorktreeDialog with uncommitted changes warning"
```

---

### Task 5: Integrate Dropdown + Dialog into Task Panel

Replace the existing branch button in the task header with the new dropdown, and wire up the delete worktree flow.

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (~lines 493-519 for the branch button area)

**Step 1: Add imports**

Add these imports at the top of the file:

```typescript
import { WorktreeBranchMenu } from '@/features/agent/ui-worktree-branch-menu';
import { DeleteWorktreeDialog } from '@/features/agent/ui-worktree-branch-menu/delete-worktree-dialog';
import { useDeleteWorktree } from '@/hooks/use-tasks';
```

**Step 2: Add state and handler inside `TaskPanel`**

After the existing `const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);` (~line 148), add:

```typescript
const [isDeleteWorktreeDialogOpen, setIsDeleteWorktreeDialogOpen] = useState(false);
const deleteWorktree = useDeleteWorktree();
```

Add a handler (near the other handlers, e.g., after `handleOpenWorktreeInEditor`):

```typescript
const handleDeleteWorktreeConfirm = useCallback(async () => {
  await deleteWorktree.mutateAsync(taskId);
  setIsDeleteWorktreeDialogOpen(false);
  // Close diff view if open since worktree is gone
  if (isDiffViewOpen) {
    toggleDiffView();
  }
}, [taskId, deleteWorktree, isDiffViewOpen, toggleDiffView]);
```

**Step 3: Replace the branch button with the dropdown**

Find this block (lines ~493-519):

```tsx
{task.worktreePath && (
  <>
    <button
      onClick={handleOpenWorktreeInEditor}
      className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
      title={`Open in ${editorSetting ? getEditorLabel(editorSetting) : 'editor'}`}
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {task.branchName ??
          getBranchFromWorktreePath(task.worktreePath)}
      </span>
    </button>
    <button
      onClick={toggleDiffView}
      ...
```

Replace **only** the branch `<button>` (not the diff toggle) with:

```tsx
{task.worktreePath && (
  <>
    <WorktreeBranchMenu
      branchName={
        task.branchName ??
        getBranchFromWorktreePath(task.worktreePath)
      }
      onOpenInEditor={handleOpenWorktreeInEditor}
      onDeleteWorktree={() => setIsDeleteWorktreeDialogOpen(true)}
    />
    <button
      onClick={toggleDiffView}
      ...
```

**Also handle the case where worktree is deleted but branchName remains.** After the `{task.worktreePath && ( ... )}` block, add a static branch label for tasks where worktree was deleted but branch was kept:

```tsx
{!task.worktreePath && task.branchName && (
  <span className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500">
    <GitBranch className="h-3.5 w-3.5 shrink-0" />
    <span className="truncate">{task.branchName}</span>
  </span>
)}
```

**Step 4: Add the dialog at the bottom of the component**

After the existing `<DeleteTaskDialog ... />`, add:

```tsx
<DeleteWorktreeDialog
  isOpen={isDeleteWorktreeDialogOpen}
  onClose={() => setIsDeleteWorktreeDialogOpen(false)}
  onConfirm={handleDeleteWorktreeConfirm}
  branchName={
    task.branchName ?? getBranchFromWorktreePath(task.worktreePath ?? '')
  }
  taskId={taskId}
  isPending={deleteWorktree.isPending}
/>
```

**Step 5: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 6: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: integrate worktree branch dropdown and delete dialog into task panel"
```

---

### Task 6: Create PR Dialog — Delete Worktree Checkbox

Add a "Delete worktree after creating" checkbox to the Create PR form, and call the delete API after successful PR creation.

**Files:**
- Modify: `src/features/agent/ui-create-pr-dialog/index.tsx`

**Step 1: Add state for the checkbox**

After the existing `const [error, setError] = useState<string | null>(null);` (~line 44), add:

```typescript
const [deleteWorktreeAfter, setDeleteWorktreeAfter] = useState(true);
```

**Step 2: Modify `handleCreate` to delete worktree after PR creation**

After the existing step 3 (saving PR info to task, ~line 78 `setPrUrl(result.url);`), add:

```typescript
// Step 4: Optionally delete worktree (keep branch)
if (deleteWorktreeAfter) {
  try {
    await api.tasks.worktree.deleteKeepBranch(taskId);
  } catch {
    // Non-fatal: PR was created successfully, worktree cleanup is best-effort
  }
}
```

Add the `api` import if not already present:

```typescript
import { api } from '@/lib/api';
```

**Step 3: Add checkbox UI after the "Create as draft" checkbox**

After the draft toggle block (~lines 169-183), add:

```tsx
{/* Delete worktree after creating */}
<div className="flex items-center gap-2">
  <input
    id="deleteWorktree"
    type="checkbox"
    checked={deleteWorktreeAfter}
    onChange={(e) => setDeleteWorktreeAfter(e.target.checked)}
    className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
  />
  <label
    htmlFor="deleteWorktree"
    className="cursor-pointer text-sm text-neutral-300"
  >
    Delete worktree after creating
  </label>
</div>
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```bash
git add src/features/agent/ui-create-pr-dialog/index.tsx
git commit -m "feat: add delete worktree checkbox to Create PR dialog"
```

---

### Task 7: Lint, TypeScript Check, and Final Verification

**Step 1: Run lint with auto-fix**

Run: `pnpm lint --fix`

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`

**Step 3: Fix any issues and commit**

If any lint/TS errors found, fix them and commit:

```bash
git add -A
git commit -m "fix: address lint and type errors"
```
