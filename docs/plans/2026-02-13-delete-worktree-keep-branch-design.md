# Delete Worktree (Keep Branch)

## Problem

When a task's worktree is no longer needed (e.g., after creating a PR or finishing work), the worktree directory still occupies disk space. Users need a way to delete the worktree directory while keeping the git branch intact for future reference or PR workflows.

## Two Entry Points

### 1. Worktree Branch Dropdown Menu

**Current behavior**: The branch button in the task header opens the worktree in an editor on click.

**New behavior**: Clicking the branch button opens a dropdown menu with:
- **Open in Editor** — Same as current behavior
- **Delete Worktree** — Opens a confirmation dialog, then removes the worktree directory (keeps branch)

### 2. Create PR Dialog Checkbox

**Current behavior**: After creating a PR, the worktree stays around.

**New behavior**: A "Delete worktree after creating" checkbox (checked by default) is added to the Create PR form. After successful PR creation, the worktree is automatically cleaned up.

## Design

### New IPC Handler: `tasks:deleteWorktree`

Deletes the worktree directory for a task but keeps the git branch.

**Input**: `taskId: string`

**Process**:
1. Look up task to get `worktreePath` and `projectId`
2. Look up project to get `projectPath`
3. Call `cleanupWroktree({ worktreePath, projectPath, branchCleanup: 'keep', force: true })`
4. Update task: set `worktreePath = null` (keep `branchName`, `startCommitHash`)

**Output**: `{ success: boolean }`

The existing `cleanupWroktree` function already supports `branchCleanup: 'keep'` — this handler simply wires it up as a standalone operation.

### New API Method

Add `api.tasks.worktree.deleteWorktree(taskId)` to the preload bridge and API types.

### New React Query Hook: `useDeleteWorktree`

Mutation hook that calls the IPC handler and invalidates the task query on success.

### Worktree Branch Dropdown Component

New component: `src/features/agent/ui-worktree-branch-menu/index.tsx`

Replaces the current branch button in the task header. Renders:
- A trigger button (same visual: `GitBranch` icon + branch name)
- A positioned dropdown menu on click with two items:
  - "Open in Editor" (external link icon)
  - "Delete Worktree" (trash icon, red text)
- Click-outside to close

### Delete Worktree Confirmation Dialog

New component: `src/features/agent/ui-worktree-branch-menu/delete-worktree-dialog.tsx`

When "Delete Worktree" is selected:
1. Fetches worktree status via `api.tasks.worktree.getStatus(taskId)` to check for uncommitted changes
2. Shows a confirmation dialog:
   - Title: "Delete Worktree"
   - Body: "This will remove the worktree directory. The branch `{branchName}` will be kept."
   - Warning (conditional): "There are uncommitted changes that will be lost." — shown only when uncommitted changes are detected
   - Buttons: "Cancel" / "Delete Worktree" (red)

### Create PR Dialog Changes

In `ui-create-pr-dialog/index.tsx`:
- Add a checkbox: "Delete worktree after creating" (checked by default), placed after the "Create as draft" checkbox
- After successful PR creation (after step 3 - saving PR info to task), if checkbox is checked, call `api.tasks.worktree.deleteWorktree(taskId)`
- The success screen already shows — worktree cleanup happens in the background

### UI After Worktree Deletion

Once `worktreePath` is set to `null` on the task:
- The branch name still displays (from `task.branchName`) but as a **static label** — no dropdown, no click action
- Diff view toggle disappears (existing `{task.worktreePath && ...}` guard)
- Worktree actions (commit/merge/PR creation) disappear (same guard)
- The task otherwise works normally — messages, history, follow-ups all unaffected

## Files Changed

| File | Change |
|------|--------|
| `electron/ipc/handlers.ts` | New `tasks:deleteWorktree` handler |
| `electron/preload.ts` | Expose `tasks:deleteWorktree` |
| `src/lib/api.ts` | Add `deleteWorktree` to API types |
| `src/hooks/use-tasks.ts` | Add `useDeleteWorktree` mutation hook |
| `src/features/agent/ui-worktree-branch-menu/index.tsx` | New dropdown component |
| `src/features/agent/ui-worktree-branch-menu/delete-worktree-dialog.tsx` | New confirmation dialog |
| `src/features/task/ui-task-panel/index.tsx` | Replace branch button with dropdown component |
| `src/features/agent/ui-create-pr-dialog/index.tsx` | Add "delete worktree" checkbox + post-PR cleanup |
