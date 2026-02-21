# Async Merge with Modal Close

## Problem

When a user submits a merge, the merge confirm dialog stays open and blocks interaction while the git merge operation runs. This feels sluggish — the user has already committed to the action and shouldn't have to wait.

## Design

Convert the merge submit flow from synchronous (await result → close modal) to async (close modal immediately → run merge in background).

### Two-Phase Flow

**Phase 1 — Conflict Check (synchronous, unchanged)**

The merge confirm dialog already runs `checkMergeConflicts` on open. If conflicts exist, the user sees a warning and cannot proceed. No changes needed.

**Phase 2 — Submit Merge (async with background job)**

When the user clicks "Merge" with no conflicts detected:

1. Create a `'merge'` background job via the existing `background-jobs` store
2. Trigger `useShrinkToTarget` animation — ghost element shrinks from dialog content → squircle → flies to jobs button → pulse
3. Close the merge dialog immediately
4. Call `onMergeComplete()` (closes diff view)
5. Fire-and-forget `mergeMutation.mutateAsync(...)`:
   - **Success**: `markJobSucceeded(jobId)`, React Query invalidation via `onSuccess`
   - **Failure**: `markJobFailed(jobId, errorMessage)` + error toast

### IPC Handler

The `tasks:worktree:merge` handler already owns post-merge cleanup server-side:

- Clears all 4 worktree fields: `worktreePath`, `branchName`, `startCommitHash`, `sourceBranch` → null
- Calls `toggleUserCompleted(taskId)` to mark the task done

This stays unchanged and works correctly for async — no renderer coordination needed.

### Animation

Reuse `useShrinkToTarget` hook from `src/common/hooks/use-shrink-to-target.ts`:

- **Source**: Merge confirm dialog content (via `panelRef`)
- **Target**: `[data-animation-target="jobs-button"]`
- Same animation as the new task overlay: squeeze → fly → pulse

### Error Handling

- **Conflict errors**: Caught synchronously in Phase 1 before any background job is created
- **Merge errors**: Show error toast + job appears as failed in background jobs overlay
- Toast: lightweight Zustand store + `<Toast>` component at app root, auto-dismisses after a few seconds

## File Changes

| File | Change |
|------|--------|
| `src/stores/background-jobs.ts` | Add `'merge'` to `BackgroundJobType` union |
| `src/features/agent/ui-worktree-actions/index.tsx` | Switch from `await` → fire-and-forget with background job + shrink animation |
| `src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx` | Add `panelRef` for animation source, expose to parent |
| `src/stores/toasts.ts` (new) | Zustand store for toast notifications |
| `src/common/ui/toast/index.tsx` (new) | Toast component rendered at app root |
| `src/app.tsx` | Mount `<Toast>` component |
