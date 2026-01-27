# Worktree Merge Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add commit and merge capabilities to worktree tasks from the Diff view, plus project-level default branch settings.

**Architecture:** Backend git operations in `worktree-service.ts`, exposed via IPC handlers. Frontend adds WorktreeActions component to diff view and project settings section to sidebar. React Query hooks for data fetching and mutations.

**Tech Stack:** Electron IPC, Node.js child_process for git commands, React, TanStack Query, Kysely migrations

---

## Task 1: Database Migration - Add defaultBranch to Projects

**Files:**
- Create: `electron/database/migrations/016_project_default_branch.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`
- Modify: `shared/types.ts`

**Step 1: Create the migration file**

```typescript
// electron/database/migrations/016_project_default_branch.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('defaultBranch', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('defaultBranch').execute();
}
```

**Step 2: Register migration in migrator.ts**

Add import and register:
```typescript
import * as m016 from './migrations/016_project_default_branch';

// In migrations object:
'016_project_default_branch': m016,
```

**Step 3: Update schema.ts - ProjectTable**

Add to `ProjectTable` interface:
```typescript
defaultBranch: string | null;
```

**Step 4: Update shared/types.ts - Project types**

Add to `Project` interface:
```typescript
defaultBranch: string | null;
```

Add to `NewProject` interface:
```typescript
defaultBranch?: string | null;
```

Add to `UpdateProject` interface:
```typescript
defaultBranch?: string | null;
```

**Step 5: Commit**

```bash
git add electron/database/migrations/016_project_default_branch.ts electron/database/migrator.ts electron/database/schema.ts shared/types.ts
git commit -m "$(cat <<'EOF'
Add defaultBranch column to projects table

Migration to store project-level default merge branch setting.
EOF
)"
```

---

## Task 2: Backend - Add Git Operations to worktree-service.ts

**Files:**
- Modify: `electron/services/worktree-service.ts`

**Step 1: Add getProjectBranches function**

```typescript
/**
 * Gets the list of local branches for a git repository.
 */
export async function getProjectBranches(projectPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git branch --format="%(refname:short)"', {
      cwd: projectPath,
      encoding: 'utf-8',
    });
    return stdout
      .trim()
      .split('\n')
      .filter((branch) => branch.length > 0);
  } catch (error) {
    throw new Error(`Failed to get branches: ${error}`);
  }
}
```

**Step 2: Add getWorktreeStatus function**

```typescript
export interface WorktreeStatus {
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

/**
 * Checks if a worktree has uncommitted changes.
 */
export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
  try {
    // Check for staged changes
    const { stdout: stagedOutput } = await execAsync(
      'git diff --cached --name-only',
      { cwd: worktreePath, encoding: 'utf-8' }
    );
    const hasStagedChanges = stagedOutput.trim().length > 0;

    // Check for unstaged changes (including untracked files)
    const { stdout: unstagedOutput } = await execAsync(
      'git status --porcelain',
      { cwd: worktreePath, encoding: 'utf-8' }
    );
    const hasUnstagedChanges = unstagedOutput.trim().length > 0;

    return {
      hasUncommittedChanges: hasStagedChanges || hasUnstagedChanges,
      hasStagedChanges,
      hasUnstagedChanges,
    };
  } catch (error) {
    throw new Error(`Failed to get worktree status: ${error}`);
  }
}
```

**Step 3: Add commitWorktreeChanges function**

```typescript
export interface CommitWorktreeParams {
  worktreePath: string;
  message: string;
  stageAll: boolean;
}

/**
 * Commits changes in a worktree.
 */
export async function commitWorktreeChanges(params: CommitWorktreeParams): Promise<void> {
  const { worktreePath, message, stageAll } = params;

  try {
    if (stageAll) {
      // Stage all changes including untracked files
      await execAsync('git add -A', { cwd: worktreePath, encoding: 'utf-8' });
    }

    // Commit with the provided message
    await execAsync(`git commit -m ${JSON.stringify(message)}`, {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to commit changes: ${error}`);
  }
}
```

**Step 4: Add mergeWorktree function**

```typescript
export interface MergeWorktreeParams {
  worktreePath: string;
  projectPath: string;
  targetBranch: string;
}

export interface MergeWorktreeResult {
  success: boolean;
  error?: string;
}

/**
 * Merges a worktree branch into target branch and deletes the worktree.
 */
export async function mergeWorktree(params: MergeWorktreeParams): Promise<MergeWorktreeResult> {
  const { worktreePath, projectPath, targetBranch } = params;

  try {
    // Get the branch name of the worktree
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      encoding: 'utf-8',
    });
    const worktreeBranch = branchOutput.trim();

    // Switch to target branch in main repo
    await execAsync(`git checkout ${targetBranch}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    // Merge the worktree branch
    await execAsync(`git merge ${worktreeBranch}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    // Remove the worktree
    await execAsync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    // Delete the branch
    await execAsync(`git branch -d ${worktreeBranch}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a merge conflict
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
      return {
        success: false,
        error: 'Merge failed due to conflicts. Resolve manually in your editor.',
      };
    }

    return { success: false, error: errorMessage };
  }
}
```

**Step 5: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "$(cat <<'EOF'
Add git operations for worktree commit and merge

- getProjectBranches: list local branches
- getWorktreeStatus: check for uncommitted changes
- commitWorktreeChanges: commit with optional stage all
- mergeWorktree: merge into target branch and cleanup
EOF
)"
```

---

## Task 3: Backend - Add IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add imports**

Add to existing imports from worktree-service:
```typescript
import {
  createWorktree,
  getWorktreeDiff,
  getWorktreeFileContent,
  getProjectBranches,
  getWorktreeStatus,
  commitWorktreeChanges,
  mergeWorktree,
} from '../services/worktree-service';
```

**Step 2: Add IPC handlers after existing worktree handlers**

```typescript
  // Project branches
  ipcMain.handle('projects:getBranches', async (_, projectPath: string) => {
    return getProjectBranches(projectPath);
  });

  // Worktree status
  ipcMain.handle('worktree:git:getStatus', async (_, worktreePath: string) => {
    return getWorktreeStatus(worktreePath);
  });

  // Worktree commit
  ipcMain.handle(
    'worktree:git:commit',
    async (
      _,
      params: { worktreePath: string; message: string; stageAll: boolean }
    ) => {
      return commitWorktreeChanges(params);
    }
  );

  // Worktree merge
  ipcMain.handle(
    'worktree:git:merge',
    async (
      _,
      params: { worktreePath: string; projectPath: string; targetBranch: string }
    ) => {
      return mergeWorktree(params);
    }
  );
```

**Step 3: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "$(cat <<'EOF'
Add IPC handlers for worktree git operations

Expose branch listing, status check, commit, and merge operations.
EOF
)"
```

---

## Task 4: Frontend - Update API Types and Preload

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `electron/preload.ts`

**Step 1: Add types to api.ts**

Add after `WorktreeFileContent` interface:
```typescript
export interface WorktreeStatus {
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

export interface CommitWorktreeParams {
  worktreePath: string;
  message: string;
  stageAll: boolean;
}

export interface MergeWorktreeParams {
  worktreePath: string;
  projectPath: string;
  targetBranch: string;
}

export interface MergeWorktreeResult {
  success: boolean;
  error?: string;
}
```

**Step 2: Update Api interface - add to projects**

In the `projects` section of `Api` interface:
```typescript
getBranches: (projectPath: string) => Promise<string[]>;
```

**Step 3: Update Api interface - add to worktree.git**

In the `worktree.git` section:
```typescript
getStatus: (worktreePath: string) => Promise<WorktreeStatus>;
commit: (params: CommitWorktreeParams) => Promise<void>;
merge: (params: MergeWorktreeParams) => Promise<MergeWorktreeResult>;
```

**Step 4: Update fallback api object**

Add to `projects`:
```typescript
getBranches: async () => [],
```

Add to `worktree.git`:
```typescript
getStatus: async () => ({ hasUncommittedChanges: false, hasStagedChanges: false, hasUnstagedChanges: false }),
commit: async () => {},
merge: async () => ({ success: false, error: 'API not available' }),
```

**Step 5: Update preload.ts - add to projects**

```typescript
getBranches: (projectPath: string) =>
  ipcRenderer.invoke('projects:getBranches', projectPath),
```

**Step 6: Update preload.ts - add to worktree.git**

```typescript
getStatus: (worktreePath: string) =>
  ipcRenderer.invoke('worktree:git:getStatus', worktreePath),
commit: (params: { worktreePath: string; message: string; stageAll: boolean }) =>
  ipcRenderer.invoke('worktree:git:commit', params),
merge: (params: { worktreePath: string; projectPath: string; targetBranch: string }) =>
  ipcRenderer.invoke('worktree:git:merge', params),
```

**Step 7: Commit**

```bash
git add src/lib/api.ts electron/preload.ts
git commit -m "$(cat <<'EOF'
Add frontend API types and preload for worktree operations

Types for status, commit, and merge operations with IPC bindings.
EOF
)"
```

---

## Task 5: Frontend - Add React Query Hooks

**Files:**
- Modify: `src/hooks/use-worktree-diff.ts`
- Modify: `src/hooks/use-projects.ts`

**Step 1: Add hooks to use-worktree-diff.ts**

Add at the end of the file:
```typescript
export function useWorktreeStatus(worktreePath: string | null) {
  return useQuery({
    queryKey: ['worktree-status', worktreePath],
    queryFn: () => {
      if (!worktreePath) {
        return { hasUncommittedChanges: false, hasStagedChanges: false, hasUnstagedChanges: false };
      }
      return api.worktree.git.getStatus(worktreePath);
    },
    enabled: !!worktreePath,
    // Refetch when window regains focus to catch external changes
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });
}

export function useCommitWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { worktreePath: string; message: string; stageAll: boolean }) =>
      api.worktree.git.commit(params),
    onSuccess: (_, { worktreePath }) => {
      // Invalidate status and diff queries
      queryClient.invalidateQueries({ queryKey: ['worktree-status', worktreePath] });
      queryClient.invalidateQueries({ queryKey: ['worktree-diff'] });
      queryClient.invalidateQueries({ queryKey: ['worktree-file-content'] });
    },
  });
}

export function useMergeWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { worktreePath: string; projectPath: string; targetBranch: string }) =>
      api.worktree.git.merge(params),
    onSuccess: () => {
      // Invalidate all worktree-related queries
      queryClient.invalidateQueries({ queryKey: ['worktree-status'] });
      queryClient.invalidateQueries({ queryKey: ['worktree-diff'] });
      queryClient.invalidateQueries({ queryKey: ['worktree-file-content'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

Also add `useMutation` to the imports at the top.

**Step 2: Add useProjectBranches hook to use-projects.ts**

Add at the end:
```typescript
export function useProjectBranches(projectPath: string | null) {
  return useQuery({
    queryKey: ['project-branches', projectPath],
    queryFn: () => {
      if (!projectPath) return [];
      return api.projects.getBranches(projectPath);
    },
    enabled: !!projectPath,
    staleTime: 30000, // Cache for 30 seconds
  });
}
```

**Step 3: Commit**

```bash
git add src/hooks/use-worktree-diff.ts src/hooks/use-projects.ts
git commit -m "$(cat <<'EOF'
Add React Query hooks for worktree operations

- useWorktreeStatus: check for uncommitted changes
- useCommitWorktree: mutation for committing
- useMergeWorktree: mutation for merging
- useProjectBranches: list branches for project
EOF
)"
```

---

## Task 6: Frontend - Create WorktreeActions Component

**Files:**
- Create: `src/features/agent/ui-worktree-actions/index.tsx`

**Step 1: Create the component**

```typescript
import { GitBranch, GitCommit, GitMerge, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useProjectBranches } from '@/hooks/use-projects';
import {
  useWorktreeStatus,
  useCommitWorktree,
  useMergeWorktree,
} from '@/hooks/use-worktree-diff';

import { CommitModal } from './commit-modal';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import { MergeSuccessDialog } from './merge-success-dialog';

interface WorktreeActionsProps {
  worktreePath: string;
  projectPath: string;
  projectId: string;
  branchName: string;
  defaultBranch: string | null;
  taskId: string;
  onMergeComplete: () => void;
}

export function WorktreeActions({
  worktreePath,
  projectPath,
  projectId,
  branchName,
  defaultBranch,
  taskId,
  onMergeComplete,
}: WorktreeActionsProps) {
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  const [isMergeSuccessOpen, setIsMergeSuccessOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch ?? 'main');

  const { data: status, isLoading: isStatusLoading } = useWorktreeStatus(worktreePath);
  const { data: branches, isLoading: isBranchesLoading } = useProjectBranches(projectPath);
  const commitMutation = useCommitWorktree();
  const mergeMutation = useMergeWorktree();

  const canCommit = status?.hasUncommittedChanges ?? false;
  const canMerge = !status?.hasUncommittedChanges && !isStatusLoading;

  // Set default branch when branches load
  if (branches && branches.length > 0 && !selectedBranch) {
    const defaultTarget = defaultBranch ?? (branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0]);
    setSelectedBranch(defaultTarget);
  }

  const handleCommit = async (message: string, stageAll: boolean) => {
    await commitMutation.mutateAsync({ worktreePath, message, stageAll });
    setIsCommitModalOpen(false);
  };

  const handleMerge = async () => {
    const result = await mergeMutation.mutateAsync({
      worktreePath,
      projectPath,
      targetBranch: selectedBranch,
    });

    setIsMergeConfirmOpen(false);

    if (result.success) {
      setIsMergeSuccessOpen(true);
    } else {
      // Error is handled by the mutation
    }
  };

  const handleMergeSuccessClose = (markComplete: boolean) => {
    setIsMergeSuccessOpen(false);
    onMergeComplete();
    if (markComplete) {
      // Will be handled by parent
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-700 p-3">
      {/* Commit button */}
      <button
        onClick={() => setIsCommitModalOpen(true)}
        disabled={!canCommit || commitMutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        title={canCommit ? 'Commit changes' : 'No changes to commit'}
      >
        {commitMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitCommit className="h-4 w-4" />
        )}
        Commit
      </button>

      {/* Merge section */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-neutral-400">Merge into</label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          disabled={isBranchesLoading || !branches?.length}
          className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
        >
          {branches?.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
        <button
          onClick={() => setIsMergeConfirmOpen(true)}
          disabled={!canMerge || mergeMutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          title={canMerge ? 'Merge worktree' : 'Commit or discard changes first'}
        >
          {mergeMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitMerge className="h-4 w-4" />
          )}
          Merge
        </button>
      </div>

      {/* Modals */}
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        onCommit={handleCommit}
        isPending={commitMutation.isPending}
        error={commitMutation.error?.message}
      />

      <MergeConfirmDialog
        isOpen={isMergeConfirmOpen}
        onClose={() => setIsMergeConfirmOpen(false)}
        onConfirm={handleMerge}
        branchName={branchName}
        targetBranch={selectedBranch}
        isPending={mergeMutation.isPending}
        error={mergeMutation.data?.error}
      />

      <MergeSuccessDialog
        isOpen={isMergeSuccessOpen}
        onClose={handleMergeSuccessClose}
        targetBranch={selectedBranch}
        taskId={taskId}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/agent/ui-worktree-actions/index.tsx
git commit -m "$(cat <<'EOF'
Add WorktreeActions component for commit and merge

Main component with commit button, branch selector, and merge button.
EOF
)"
```

---

## Task 7: Frontend - Create Modal Components

**Files:**
- Create: `src/features/agent/ui-worktree-actions/commit-modal.tsx`
- Create: `src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx`
- Create: `src/features/agent/ui-worktree-actions/merge-success-dialog.tsx`

**Step 1: Create CommitModal**

```typescript
// src/features/agent/ui-worktree-actions/commit-modal.tsx
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, stageAll: boolean) => Promise<void>;
  isPending: boolean;
  error?: string;
}

export function CommitModal({ isOpen, onClose, onCommit, isPending, error }: CommitModalProps) {
  const [message, setMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await onCommit(message.trim(), stageAll);
    setMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">Commit Changes</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Commit message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes"
              rows={3}
              className="w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={stageAll}
              onChange={(e) => setStageAll(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-neutral-300">Stage all changes</span>
          </label>

          {error && (
            <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isPending}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Commit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Create MergeConfirmDialog**

```typescript
// src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface MergeConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  branchName: string;
  targetBranch: string;
  isPending: boolean;
  error?: string;
}

export function MergeConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  branchName,
  targetBranch,
  isPending,
  error,
}: MergeConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">Merge Worktree</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-4 text-neutral-200">
            Merge branch <span className="font-mono text-blue-400">{branchName}</span> into{' '}
            <span className="font-mono text-green-400">{targetBranch}</span>?
          </p>

          <div className="mb-4 rounded-md bg-neutral-900 p-3 text-sm text-neutral-400">
            <p className="mb-2">This will:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Merge all commits into {targetBranch}</li>
              <li>Delete the worktree and branch</li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create MergeSuccessDialog**

```typescript
// src/features/agent/ui-worktree-actions/merge-success-dialog.tsx
import { CheckCircle, X } from 'lucide-react';

import { useToggleTaskUserCompleted } from '@/hooks/use-tasks';

interface MergeSuccessDialogProps {
  isOpen: boolean;
  onClose: (markComplete: boolean) => void;
  targetBranch: string;
  taskId: string;
}

export function MergeSuccessDialog({
  isOpen,
  onClose,
  targetBranch,
  taskId,
}: MergeSuccessDialogProps) {
  const toggleCompleted = useToggleTaskUserCompleted();

  if (!isOpen) return null;

  const handleComplete = async () => {
    await toggleCompleted.mutateAsync(taskId);
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">Worktree Merged</h2>
          <button
            onClick={() => onClose(false)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center gap-3 text-green-400">
            <CheckCircle className="h-6 w-6" />
            <span>Successfully merged into {targetBranch}</span>
          </div>

          <p className="mb-4 text-neutral-300">Mark this task as completed?</p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Keep Running
            </button>
            <button
              onClick={handleComplete}
              disabled={toggleCompleted.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            >
              Complete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/features/agent/ui-worktree-actions/commit-modal.tsx src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx src/features/agent/ui-worktree-actions/merge-success-dialog.tsx
git commit -m "$(cat <<'EOF'
Add modal components for commit and merge workflows

- CommitModal: textarea for message, stage all checkbox
- MergeConfirmDialog: confirmation with branch names
- MergeSuccessDialog: success with complete task option
EOF
)"
```

---

## Task 8: Frontend - Integrate WorktreeActions into Diff View

**Files:**
- Modify: `src/features/agent/ui-worktree-diff-view/index.tsx`

**Step 1: Update imports**

Add import:
```typescript
import { WorktreeActions } from '@/features/agent/ui-worktree-actions';
```

**Step 2: Update WorktreeDiffViewProps**

```typescript
interface WorktreeDiffViewProps {
  worktreePath: string;
  startCommitHash: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  projectPath: string;
  projectId: string;
  branchName: string;
  defaultBranch: string | null;
  taskId: string;
  onMergeComplete: () => void;
}
```

**Step 3: Update component signature and render**

Update the function signature to accept new props, then modify the file tree sidebar section:

```typescript
{/* File tree sidebar */}
<div className="flex w-56 flex-shrink-0 flex-col border-r border-neutral-700">
  <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
    <span className="text-xs font-medium text-neutral-400">
      Changed Files ({files.length})
    </span>
    <button
      onClick={refresh}
      className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
      title="Refresh diff"
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
  </div>
  <div className="flex-1 overflow-auto">
    <DiffFileTree
      files={files}
      selectedPath={selectedFilePath}
      onSelectFile={onSelectFile}
    />
  </div>
  <WorktreeActions
    worktreePath={worktreePath}
    projectPath={projectPath}
    projectId={projectId}
    branchName={branchName}
    defaultBranch={defaultBranch}
    taskId={taskId}
    onMergeComplete={onMergeComplete}
  />
</div>
```

**Step 4: Commit**

```bash
git add src/features/agent/ui-worktree-diff-view/index.tsx
git commit -m "$(cat <<'EOF'
Integrate WorktreeActions into diff view sidebar

Add commit and merge controls below the file tree.
EOF
)"
```

---

## Task 9: Frontend - Update Task Page to Pass Props

**Files:**
- Modify: `src/routes/projects/$projectId/tasks/$taskId.tsx`

**Step 1: Find WorktreeDiffView usage and update props**

The task page renders WorktreeDiffView. Update it to pass the new required props:

```typescript
<WorktreeDiffView
  worktreePath={task.worktreePath}
  startCommitHash={task.startCommitHash}
  selectedFilePath={diffSelectedFile}
  onSelectFile={setDiffSelectedFile}
  projectPath={project.path}
  projectId={project.id}
  branchName={/* extract from worktreePath or task */}
  defaultBranch={project.defaultBranch}
  taskId={task.id}
  onMergeComplete={() => {
    // Close diff view and navigate away or refresh
    setDiffViewOpen(false);
  }}
/>
```

Note: You'll need to extract branchName - it's stored in the task or can be derived from worktreePath. Check the task creation to see if it's stored.

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/tasks/\$taskId.tsx
git commit -m "$(cat <<'EOF'
Pass additional props to WorktreeDiffView for merge support

Include project path, branch info, and merge complete handler.
EOF
)"
```

---

## Task 10: Frontend - Add Project Settings Section to Sidebar

**Files:**
- Create: `src/features/project/ui-project-settings/index.tsx`
- Modify: `src/layout/ui-project-sidebar/index.tsx`

**Step 1: Create ProjectSettings component**

```typescript
// src/features/project/ui-project-settings/index.tsx
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useProjectBranches, useUpdateProject } from '@/hooks/use-projects';

interface ProjectSettingsProps {
  projectId: string;
  projectPath: string;
  defaultBranch: string | null;
}

export function ProjectSettings({ projectId, projectPath, defaultBranch }: ProjectSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch ?? '');

  const { data: branches, isLoading } = useProjectBranches(isOpen ? projectPath : null);
  const updateProject = useUpdateProject();

  // Initialize selected branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranch) {
      const initial = defaultBranch ??
        (branches.includes('main') ? 'main' :
         branches.includes('master') ? 'master' :
         branches[0]);
      setSelectedBranch(initial);
    }
  }, [branches, defaultBranch, selectedBranch]);

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
    updateProject.mutate({
      id: projectId,
      data: { defaultBranch: branch, updatedAt: new Date().toISOString() },
    });
  };

  return (
    <div className="border-t border-neutral-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Settings className="h-4 w-4" />
        Settings
      </button>

      {isOpen && (
        <div className="px-4 pb-3">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">
            Default merge branch
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => handleBranchChange(e.target.value)}
            disabled={isLoading || !branches?.length}
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            {isLoading ? (
              <option>Loading...</option>
            ) : branches?.length === 0 ? (
              <option>No branches found</option>
            ) : (
              branches?.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))
            )}
          </select>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add ProjectSettings to sidebar**

In `src/layout/ui-project-sidebar/index.tsx`, import and add at the bottom of the sidebar (before closing `</aside>`):

```typescript
import { ProjectSettings } from '@/features/project/ui-project-settings';

// ... in the render, after task list div:
{project.path && (
  <ProjectSettings
    projectId={project.id}
    projectPath={project.path}
    defaultBranch={project.defaultBranch}
  />
)}
```

**Step 3: Commit**

```bash
git add src/features/project/ui-project-settings/index.tsx src/layout/ui-project-sidebar/index.tsx
git commit -m "$(cat <<'EOF'
Add project settings section to sidebar with default branch

Collapsible settings area with branch dropdown that saves immediately.
EOF
)"
```

---

## Task 11: Add branchName to Task

**Files:**
- Modify: `electron/database/schema.ts`
- Modify: `shared/types.ts`
- Create: `electron/database/migrations/017_task_branch_name.ts`
- Modify: `electron/database/migrator.ts`

The task needs to store the branch name so we can display it in the merge dialog. Currently it's only stored in the worktree creation result but not persisted.

**Step 1: Create migration**

```typescript
// electron/database/migrations/017_task_branch_name.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('branchName', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('branchName').execute();
}
```

**Step 2: Register migration**

Add to migrator.ts:
```typescript
import * as m017 from './migrations/017_task_branch_name';

// In migrations object:
'017_task_branch_name': m017,
```

**Step 3: Update schema.ts TaskTable**

Add to `TaskTable`:
```typescript
branchName: string | null;
```

**Step 4: Update shared/types.ts Task types**

Add to `Task`:
```typescript
branchName: string | null;
```

Add to `NewTask`:
```typescript
branchName?: string | null;
```

Add to `UpdateTask`:
```typescript
branchName?: string | null;
```

**Step 5: Update task creation with worktree handler**

In `electron/ipc/handlers.ts`, update the `tasks:createWithWorktree` handler to include branchName:

```typescript
const { worktreePath, startCommitHash, branchName } = await createWorktree(
  project.path,
  project.id,
  project.name,
  taskData.prompt,
  taskName ?? undefined
);

return TaskRepository.create({
  ...taskData,
  name: taskName,
  worktreePath,
  startCommitHash,
  branchName,
});
```

**Step 6: Commit**

```bash
git add electron/database/migrations/017_task_branch_name.ts electron/database/migrator.ts electron/database/schema.ts shared/types.ts electron/ipc/handlers.ts
git commit -m "$(cat <<'EOF'
Add branchName column to tasks table

Store the worktree branch name for display in merge dialogs.
EOF
)"
```

---

## Task 12: Final Integration and Testing

**Step 1: Run lint**

```bash
pnpm lint
```

Fix any lint errors.

**Step 2: Run build**

```bash
pnpm build
```

Fix any build errors.

**Step 3: Manual testing checklist**

- [ ] Create a task with worktree
- [ ] Make changes in the worktree
- [ ] Open diff view - see changed files
- [ ] Click Commit - modal opens, enter message, commit succeeds
- [ ] After commit, Commit button disabled, Merge button enabled
- [ ] Select target branch from dropdown
- [ ] Click Merge - confirmation dialog shows correct branches
- [ ] Confirm merge - success dialog shows
- [ ] Choose "Complete Task" - task marked complete
- [ ] Verify worktree deleted (check filesystem)
- [ ] Test project settings - default branch dropdown works

**Step 4: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Complete worktree merge feature implementation

- Commit changes from diff view
- Merge worktree into target branch
- Auto-delete worktree after merge
- Project-level default branch setting
EOF
)"
```

---

## Summary

This implementation adds:

1. **Database**: `defaultBranch` column on projects, `branchName` column on tasks
2. **Backend**: Git operations for branches, status, commit, merge
3. **Frontend**:
   - WorktreeActions component with commit/merge buttons
   - Modal dialogs for commit and merge flows
   - Project settings section with branch dropdown
4. **Integration**: Updated diff view and task page to support new features
