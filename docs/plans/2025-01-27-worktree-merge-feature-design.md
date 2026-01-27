# Worktree Merge Feature Design

## Overview

Enhance the worktree feature to allow users to commit uncommitted changes and merge the worktree branch into a target branch directly from the Diff view. After merge, the worktree is automatically deleted.

## User Flow

1. User opens the Diff view for a worktree task
2. At the bottom of the file tree panel, they see:
   - A "Commit" button (enabled only if there are uncommitted changes)
   - A "Merge" button with branch dropdown (enabled only if working tree is clean)
3. **Commit flow:** Click "Commit" → enter commit message in a modal → changes are committed
4. **Merge flow:** Select target branch from dropdown (defaults to project's default branch) → click "Merge" → confirmation dialog → merge happens, worktree is deleted → prompt to mark task complete

```
┌─────────────────────────────────────────────────────────────┐
│ Diff View                                                   │
├────────────┬────────────────────────────────────────────────┤
│ File Tree  │ Diff Content                                   │
│            │                                                │
│ 📁 src/    │                                                │
│  └ 📄 foo  │                                                │
│            │                                                │
├────────────┤                                                │
│ [Commit]   │                                                │
│ [Merge ▾]  │  ← dropdown shows branches, default selected   │
└────────────┴────────────────────────────────────────────────┘
```

## Commit Flow

When the user has uncommitted changes (staged or unstaged), the Commit button is enabled.

**Commit modal:**
```
┌─────────────────────────────────────────────────┐
│ Commit Changes                              [×] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Commit message                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ (placeholder: "Describe your changes")   │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ◻ Stage all changes (checked by default)       │
│                                                 │
│                      [Cancel]  [Commit]         │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Opens a modal with a textarea for commit message
- Checkbox to "Stage all changes" (default: checked) - stages all modified/untracked files before commit
- If unchecked, only commits already-staged files
- After successful commit: close modal, refresh diff view, show success toast
- On error: show error in modal, keep it open

## Merge Flow

When the working tree is clean (no uncommitted changes), the Merge button is enabled.

**Merge UI in the file tree panel:**
```
┌────────────┐
│ File Tree  │
│    ...     │
├────────────┤
│ [Commit]   │  ← disabled when clean
│            │
│ Merge into │
│ [main    ▾]│  ← dropdown with branches
│ [Merge]    │
└────────────┘
```

**Confirmation dialog after clicking Merge:**
```
┌─────────────────────────────────────────────────┐
│ Merge Worktree                              [×] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Merge branch "task-abc123" into "main"?        │
│                                                 │
│  This will:                                     │
│  • Merge all commits into main                  │
│  • Delete the worktree and branch               │
│                                                 │
│                      [Cancel]  [Merge]          │
└─────────────────────────────────────────────────┘
```

**After successful merge:**
```
┌─────────────────────────────────────────────────┐
│ Worktree Merged                             [×] │
├─────────────────────────────────────────────────┤
│                                                 │
│  ✓ Successfully merged into main                │
│                                                 │
│  Mark this task as completed?                   │
│                                                 │
│              [Keep Running]  [Complete Task]    │
└─────────────────────────────────────────────────┘
```

## Project Default Branch Setting

The project details page (task list view) will have a settings section for configuring the default merge branch.

**UI placement:** Add a collapsible "Settings" section at the bottom of the project sidebar.

```
┌─────────────────────────────────────────────────┐
│ Project: My App                                 │
├─────────────────────────────────────────────────┤
│ Tasks                                           │
│ ├─ Task 1                                       │
│ ├─ Task 2                                       │
│ └─ Task 3                                       │
├─────────────────────────────────────────────────┤
│ Settings                                    [▾] │
│ ┌─────────────────────────────────────────────┐ │
│ │ Default merge branch                        │ │
│ │ [main                                    ▾] │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Dropdown shows all local branches from the project's git repo
- Auto-detects initial default: checks for `main`, then `master`, then falls back to current branch
- Selection is saved immediately (no save button needed)
- Stored in a new `defaultBranch` column on the `projects` table

## Error Handling

**Commit errors:**
- Empty commit message → disable Commit button, show validation hint
- Nothing to commit → Commit button disabled, tooltip: "No changes to commit"
- Git error (e.g., hooks fail) → show error message in modal

**Merge errors:**
- Uncommitted changes exist → Merge button disabled, tooltip: "Commit or discard changes first"
- Merge conflicts → show error dialog: "Merge failed due to conflicts. Resolve manually in your editor."
- Target branch doesn't exist → shouldn't happen (dropdown only shows existing branches), but handle gracefully
- Worktree deletion fails → show warning but consider merge successful, user can clean up manually

**Branch loading:**
- Git not available → show error, disable branch dropdown
- No branches found → shouldn't happen, but show "No branches found" in dropdown
- Loading state → show spinner in dropdown while fetching branches

## Data Model & Backend Changes

### Database Migration

Add `defaultBranch` column to `projects` table:

```typescript
// Migration: add_default_branch_to_projects
await db.schema
  .alterTable('projects')
  .addColumn('defaultBranch', 'text')  // nullable, null = auto-detect
  .execute();
```

### New IPC Methods

Add to `worktree-service.ts`:

```typescript
// Get list of branches for a git repo
getProjectBranches(projectPath: string): Promise<string[]>

// Commit all changes in worktree
commitWorktreeChanges(params: {
  worktreePath: string
  message: string
  stageAll: boolean
}): Promise<void>

// Merge worktree branch into target and delete worktree
mergeWorktree(params: {
  worktreePath: string
  projectPath: string
  targetBranch: string
}): Promise<void>

// Check if worktree has uncommitted changes
getWorktreeStatus(worktreePath: string): Promise<{
  hasUncommittedChanges: boolean
  hasStagedChanges: boolean
  hasUnstagedChanges: boolean
}>
```

### New React Hooks

- `useProjectBranches(projectPath)` - fetch branch list
- `useWorktreeStatus(worktreePath)` - check for uncommitted changes
- `useCommitWorktree()` - mutation for committing
- `useMergeWorktree()` - mutation for merging

## New UI Components

- `WorktreeActions` - commit/merge controls at bottom of diff file tree panel
- `CommitModal` - modal for entering commit message
- `MergeConfirmDialog` - confirmation before merge
- `MergeSuccessDialog` - post-merge dialog asking to complete task
- Project settings section in project details sidebar with branch dropdown

## Files to Modify

- `electron/services/worktree-service.ts` - new methods
- `electron/ipc/handlers.ts` - register new IPC handlers
- `electron/database/schema.ts` - add defaultBranch to Project type
- `electron/database/repositories/project-repository.ts` - update for defaultBranch
- `electron/database/migrations/` - new migration for defaultBranch
- `src/features/agent/ui-worktree-diff-view/index.tsx` - add WorktreeActions
- `src/routes/projects/$projectId.tsx` - add settings section
- `src/hooks/` - new hooks for branches, status, commit, merge
- `src/lib/api.ts` - add new IPC types
- `electron/preload.ts` - expose new IPC methods
