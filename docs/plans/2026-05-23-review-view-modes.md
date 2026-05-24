# Review View Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename "diff view" to "review view" and add three modes: Diff (current), Files (file explorer), and Commits (per-commit timeline).

**Architecture:** The existing `WorktreeDiffView` becomes `WorktreeReviewView` with a mode tab bar (Diff | Files | Commits). Each mode shares the same left sidebar (file tree for Diff/Files, commit list for Commits) but shows different content. State is stored per-task in the navigation store via a new `reviewMode` field. A new IPC endpoint `tasks:worktree:getCommits` returns structured commit data from the worktree.

**Tech Stack:** React, Zustand (navigation store), Electron IPC, git CLI

---

## Naming & Terminology

- "Diff view" -> "Review view" everywhere in UI labels, commands, and code identifiers
- `TaskViewMode` values: `'diff'` stays as `'review'` (the view itself), internal review modes are `'changes' | 'files' | 'commits'`
- Actually — keep `TaskViewMode = 'diff' | 'pr' | undefined` as-is for now to minimize blast radius. The sub-mode within the review view is what's new.

---

### Task 1: Add Review Mode State to Navigation Store

**Files:**
- Modify: `src/stores/navigation.ts`

This task adds a `reviewMode` field to `DiffViewState` to track which sub-mode (changes/files/commits) is active within the review view.

**Step 1: Add ReviewMode type and state**

In `src/stores/navigation.ts`, add:

```typescript
// After DiffViewState interface (line ~37)
export type ReviewMode = 'changes' | 'files' | 'commits';
```

Update `DiffViewState`:

```typescript
interface DiffViewState {
  selectedFilePath: string | null;
  collapsedFolders: Set<string>;
  reviewMode: ReviewMode;
}
```

Update `defaultDiffViewState`:

```typescript
const defaultDiffViewState: DiffViewState = {
  selectedFilePath: null,
  collapsedFolders: new Set<string>(),
  reviewMode: 'changes',
};
```

**Step 2: Add setReviewMode action**

Add to `NavigationState` interface:

```typescript
setReviewMode: (taskId: string, mode: ReviewMode) => void;
```

Add implementation in the store's `set` block:

```typescript
setReviewMode: (taskId, mode) =>
  set((state) => ({
    taskState: {
      ...state.taskState,
      [taskId]: {
        ...defaultTaskState,
        ...state.taskState[taskId],
        diffView: {
          ...(state.taskState[taskId]?.diffView ?? defaultDiffViewState),
          reviewMode: mode,
        },
      },
    },
  })),
```

**Step 3: Expose in useDiffViewState hook**

In the `useDiffViewState` hook, add:

```typescript
const setReviewModeAction = useStore((state) => state.setReviewMode);

const reviewMode = useStore(
  (state) =>
    state.taskState[taskId]?.diffView.reviewMode ??
    defaultDiffViewState.reviewMode,
);

const setReviewMode = useCallback(
  (mode: ReviewMode) => setReviewModeAction(taskId, mode),
  [taskId, setReviewModeAction],
);
```

Return `reviewMode` and `setReviewMode` from the hook.

**Step 4: Persist reviewMode**

In the `partialize` function, add `reviewMode` to the serialized diffView:

```typescript
diffView: {
  selectedFilePath: taskState.diffView.selectedFilePath,
  collapsedFolders: [...taskState.diffView.collapsedFolders],
  reviewMode: taskState.diffView.reviewMode,
},
```

In the `merge` function, ensure it's rehydrated:

```typescript
diffView: {
  ...defaultDiffViewState,
  ...taskState.diffView,
  collapsedFolders: new Set(
    (taskState.diffView?.collapsedFolders as any) ?? [],
  ),
  reviewMode: taskState.diffView?.reviewMode ?? 'changes',
},
```

**Step 5: Run type check**

Run: `pnpm ts-check`
Expected: PASS (no consumers of the new fields yet, so no breakage)

**Step 6: Commit**

```bash
git add src/stores/navigation.ts
git commit -m "feat: add ReviewMode state to navigation store"
```

---

### Task 2: Add Worktree Commits Backend (IPC + Service)

**Files:**
- Modify: `electron/services/worktree-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

This task adds a new IPC endpoint to fetch structured commit data from a worktree.

**Step 1: Add getWorktreeCommits to worktree-service.ts**

Add after `getWorktreeCommitLog` (~line 1693):

```typescript
export interface WorktreeCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string; // ISO 8601
}

/**
 * Returns structured commit data for commits since startCommitHash.
 */
export async function getWorktreeCommits(
  worktreePath: string,
  startCommitHash: string,
): Promise<WorktreeCommit[]> {
  // Validate commit hash to prevent shell injection
  if (!/^[0-9a-f]{7,40}$/i.test(startCommitHash)) {
    dbg.worktree('Invalid commit hash for commits: %s', startCommitHash);
    return [];
  }

  try {
    const { stdout } = await execAsync(
      `git log --format='%H%n%h%n%s%n%an%n%aI' ${startCommitHash}..HEAD --`,
      { cwd: worktreePath, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );

    if (!stdout.trim()) return [];

    const lines = stdout.trim().split('\n');
    const commits: WorktreeCommit[] = [];

    for (let i = 0; i + 4 < lines.length; i += 5) {
      commits.push({
        hash: lines[i]!,
        shortHash: lines[i + 1]!,
        message: lines[i + 2]!,
        author: lines[i + 3]!,
        date: lines[i + 4]!,
      });
    }

    return commits;
  } catch {
    return [];
  }
}
```

**Step 2: Add IPC handler**

In `electron/ipc/handlers.ts`, add a handler after the existing `tasks:worktree:getDiff` handler. Find the pattern for how other worktree handlers are registered (they look up the task from DB, get worktreePath and startCommitHash, then call the service).

```typescript
ipcMain.handle('tasks:worktree:getCommits', async (_event, taskId: string) => {
  const task = await taskRepository.findById(taskId);
  if (!task?.worktreePath || !task?.startCommitHash) {
    return [];
  }
  return worktreeService.getWorktreeCommits(
    task.worktreePath,
    task.startCommitHash,
  );
});
```

Note: Check the exact pattern used by `tasks:worktree:getDiff` handler and follow it exactly (it may use `taskService` or `taskRepository` differently).

**Step 3: Add preload bridge**

In `electron/preload.ts`, inside the `worktree` object (after `getDiff`):

```typescript
getCommits: (taskId: string) =>
  ipcRenderer.invoke('tasks:worktree:getCommits', taskId),
```

**Step 4: Add type to api.ts**

Add the type near other worktree types (~line 105):

```typescript
export interface WorktreeCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}
```

In the `api` interface, inside `tasks.worktree`, add:

```typescript
getCommits: (taskId: string) => Promise<WorktreeCommit[]>;
```

Also add to the mock API object at the bottom of api.ts:

```typescript
getCommits: async () => [],
```

**Step 5: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/services/worktree-service.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add worktree commits IPC endpoint"
```

---

### Task 3: Add useWorktreeCommits Hook

**Files:**
- Modify: `src/hooks/use-worktree-diff.ts`

**Step 1: Add the hook**

Add to `src/hooks/use-worktree-diff.ts`:

```typescript
import type { WorktreeCommit } from '@/lib/api';

export function useWorktreeCommits(taskId: string) {
  return useQuery({
    queryKey: ['worktree-commits', taskId],
    queryFn: () => api.tasks.worktree.getCommits(taskId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

Note: Check existing imports in this file — `api` and `useQuery` should already be imported.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/use-worktree-diff.ts
git commit -m "feat: add useWorktreeCommits query hook"
```

---

### Task 4: Create Review Mode Tab Bar Component

**Files:**
- Create: `src/features/agent/ui-worktree-review-view/review-mode-tabs.tsx`

This is a small tab bar component that switches between Changes, Files, and Commits modes.

**Step 1: Create the directory**

```bash
mkdir -p src/features/agent/ui-worktree-review-view
```

**Step 2: Create review-mode-tabs.tsx**

```tsx
import clsx from 'clsx';
import { GitCompare, FolderTree, GitCommitHorizontal } from 'lucide-react';

import type { ReviewMode } from '@/stores/navigation';

const TABS: { mode: ReviewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'changes', label: 'Changes', icon: <GitCompare className="h-3.5 w-3.5" /> },
  { mode: 'files', label: 'Files', icon: <FolderTree className="h-3.5 w-3.5" /> },
  { mode: 'commits', label: 'Commits', icon: <GitCommitHorizontal className="h-3.5 w-3.5" /> },
];

export function ReviewModeTabs({
  activeMode,
  onModeChange,
  changedFilesCount,
  commitsCount,
}: {
  activeMode: ReviewMode;
  onModeChange: (mode: ReviewMode) => void;
  changedFilesCount?: number;
  commitsCount?: number;
}) {
  return (
    <div className="flex items-center gap-0.5 px-1">
      {TABS.map(({ mode, label, icon }) => {
        const isActive = activeMode === mode;
        const count =
          mode === 'changes' ? changedFilesCount :
          mode === 'commits' ? commitsCount :
          undefined;

        return (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-bg-3 text-ink-1'
                : 'text-ink-3 hover:text-ink-1 hover:bg-bg-2',
            )}
          >
            {icon}
            {label}
            {count != null && count > 0 && (
              <span className={clsx(
                'ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium',
                isActive ? 'bg-bg-1 text-ink-2' : 'bg-bg-2 text-ink-3',
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 3: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/agent/ui-worktree-review-view/
git commit -m "feat: create ReviewModeTabs component"
```

---

### Task 5: Create Commits Panel Component

**Files:**
- Create: `src/features/agent/ui-worktree-review-view/review-commits-panel.tsx`

A timeline view of worktree commits, similar to `PrCommits` but using local worktree data. When a commit is selected, it should show that commit's diff in the content pane.

**Step 1: Create review-commits-panel.tsx**

Model after `src/features/pull-request/ui-pr-commits/index.tsx` but adapted for `WorktreeCommit` type:

```tsx
import { Loader2 } from 'lucide-react';

import { formatRelativeTime } from '@/lib/time';
import type { WorktreeCommit } from '@/lib/api';

export function ReviewCommitsPanel({
  commits,
  isLoading,
  selectedCommitHash,
  onSelectCommit,
  bottomPadding = 0,
}: {
  commits: WorktreeCommit[];
  isLoading: boolean;
  selectedCommitHash: string | null;
  onSelectCommit: (hash: string | null) => void;
  bottomPadding?: number;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        No commits yet
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto p-4"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="bg-glass-medium absolute top-0 bottom-0 left-[7px] w-0.5" />

        {commits.map((commit, index) => {
          const isFirst = index === 0;
          const isLast = index === commits.length - 1;
          const isSelected = selectedCommitHash === commit.hash;

          return (
            <button
              key={commit.hash}
              onClick={() => onSelectCommit(isSelected ? null : commit.hash)}
              className={clsx(
                'group relative flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors',
                isSelected ? 'bg-acc/10' : 'hover:bg-bg-1/60',
              )}
              style={isLast ? undefined : { marginBottom: '4px' }}
            >
              {/* Dot */}
              <div className="absolute top-[11px] left-[-16px] z-10 flex -translate-x-1/2 items-center justify-center">
                {isFirst ? (
                  <div className="border-acc bg-acc/30 h-3.5 w-3.5 rounded-full border-2" />
                ) : (
                  <div className={clsx(
                    'h-2 w-2 rounded-full',
                    isSelected ? 'bg-acc' : 'bg-bg-2',
                  )} />
                )}
              </div>

              {/* Clip timeline edges */}
              {isFirst && <div className="bg-bg-0 absolute top-0 left-[3px] h-[11px] w-1.5" />}
              {isLast && <div className="bg-bg-0 absolute bottom-0 left-[3px] h-[calc(100%-15px)] w-1.5" />}

              {/* Commit info */}
              <div className="min-w-0 flex-1">
                <p className="text-ink-1 truncate text-sm">{commit.message}</p>
                <div className="text-ink-3 mt-0.5 flex items-center gap-1.5 text-xs">
                  <span className="text-ink-2 font-mono">{commit.shortHash}</span>
                  <span className="text-ink-4">·</span>
                  <span>{commit.author}</span>
                  <span className="text-ink-4">·</span>
                  <span>{formatRelativeTime(commit.date)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Note: Add `import clsx from 'clsx'` at top.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/agent/ui-worktree-review-view/review-commits-panel.tsx
git commit -m "feat: create ReviewCommitsPanel component"
```

---

### Task 6: Create Review Files Panel Component

**Files:**
- Create: `src/features/agent/ui-worktree-review-view/review-files-panel.tsx`

This mode shows a full file tree (like the file explorer pane) but embedded within the review view's left sidebar, instead of the diff file tree.

**Step 1: Create review-files-panel.tsx**

This is a thin wrapper around the existing `FileTree` component from `src/features/task/ui-task-panel/file-explorer-pane/file-tree.tsx`, reusing it within the review sidebar.

```tsx
import clsx from 'clsx';

import { FileTree } from '@/features/task/ui-task-panel/file-explorer-pane/file-tree';
import type { DiffFileStatus } from '@/features/common/ui-file-diff/types';

export function ReviewFilesTree({
  rootPath,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  diffFiles,
  hideUnchanged,
  bottomPadding = 0,
}: {
  rootPath: string;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  diffFiles: Map<string, { status: DiffFileStatus; additions: number; deletions: number }>;
  hideUnchanged: boolean;
  bottomPadding?: number;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <FileTree
        rootPath={rootPath}
        projectRoot={rootPath}
        selectedFilePath={selectedFilePath}
        onSelectFile={onSelectFile}
        expandedDirs={expandedDirs}
        onToggleDir={onToggleDir}
        diffFiles={diffFiles}
        hideUnchanged={hideUnchanged}
      />
    </div>
  );
}
```

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/agent/ui-worktree-review-view/review-files-panel.tsx
git commit -m "feat: create ReviewFilesTree component"
```

---

### Task 7: Refactor WorktreeDiffView into WorktreeReviewView

**Files:**
- Rename: `src/features/agent/ui-worktree-diff-view/index.tsx` -> `src/features/agent/ui-worktree-review-view/index.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx` (update import)
- Modify: `src/stores/navigation.ts` (update useDiffViewState return)

This is the main refactor task. The existing `WorktreeDiffView` becomes `WorktreeReviewView` with a mode tab bar that switches between three sub-views.

**Step 1: Move and rename the component**

Copy `src/features/agent/ui-worktree-diff-view/index.tsx` to `src/features/agent/ui-worktree-review-view/index.tsx`. Keep the old file temporarily for reference.

Rename the component from `WorktreeDiffView` to `WorktreeReviewView`.

**Step 2: Add review mode props**

Add new props to `WorktreeReviewView`:

```typescript
reviewMode: ReviewMode;
onReviewModeChange: (mode: ReviewMode) => void;

// Files mode props
fileExplorerRootPath: string | null;
fileExplorerSelectedFile: string | null;
onFileExplorerSelectFile: (path: string) => void;
fileExplorerExpandedDirs: Set<string>;
onFileExplorerToggleDir: (path: string) => void;
fileExplorerHideUnchanged: boolean;
onFileExplorerToggleHideUnchanged: () => void;
```

**Step 3: Add the mode tab bar to the sidebar header**

Replace the sidebar header (currently shows "Changed Files (N)" with refresh button) to include the `ReviewModeTabs` component. The header area should show:
- `ReviewModeTabs` on the left
- Refresh button on the right

```tsx
import { ReviewModeTabs } from './review-mode-tabs';
import { ReviewCommitsPanel } from './review-commits-panel';
import { ReviewFilesTree } from './review-files-panel';
import { useWorktreeCommits } from '@/hooks/use-worktree-diff';
```

In the header:

```tsx
<div className={clsx('flex items-center justify-between px-1 py-1', HEADER_HEIGHT_CLS)}>
  <ReviewModeTabs
    activeMode={reviewMode}
    onModeChange={onReviewModeChange}
    changedFilesCount={files.length}
    commitsCount={commits?.length}
  />
  <button
    onClick={refresh}
    className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
    title="Refresh"
  >
    <RefreshCw className="h-3.5 w-3.5" />
  </button>
</div>
```

**Step 4: Switch sidebar content based on review mode**

Below the header separator, the sidebar content switches:

```tsx
<div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={...}>
  {reviewMode === 'changes' && (
    <>
      <DiffFileTree
        files={diffFiles}
        selectedPath={selectedFilePath}
        onSelectFile={onSelectFile}
        filesWithAnnotations={filesWithAnnotations}
        commentCountByFile={commentCountByFile}
        collapsedFolders={collapsedFolders}
        onToggleFolder={onToggleFolder}
      />
      <WorktreeActions ... />
    </>
  )}
  {reviewMode === 'files' && fileExplorerRootPath && (
    <ReviewFilesTree
      rootPath={fileExplorerRootPath}
      selectedFilePath={fileExplorerSelectedFile}
      onSelectFile={onFileExplorerSelectFile}
      expandedDirs={fileExplorerExpandedDirs}
      onToggleDir={onFileExplorerToggleDir}
      diffFiles={diffFilesMap}
      hideUnchanged={fileExplorerHideUnchanged}
    />
  )}
  {reviewMode === 'commits' && (
    <ReviewCommitsPanel
      commits={commits ?? []}
      isLoading={isCommitsLoading}
      selectedCommitHash={null}
      onSelectCommit={() => {}}
    />
  )}
</div>
```

Note: For files mode, you need to compute `diffFilesMap` (Map<absolutePath, {status, additions, deletions}>) from the worktree diff data, similar to how `FileExplorerPane` does it.

**Step 5: Switch main content based on review mode**

The right content pane behavior:
- **Changes mode**: Current diff behavior (shows `FileDiffContent` for selected file)
- **Files mode**: Shows file content — for changed files show diff, for unchanged files show plain content (reuse pattern from `FileExplorerContentPane`)
- **Commits mode**: Show full commit list (already in sidebar), content pane shows "Select a commit to view its changes" placeholder initially. (Per-commit diff is a follow-up feature.)

For Files mode, the content pane needs to handle both changed and unchanged files:

```tsx
{reviewMode === 'files' && fileExplorerSelectedFile ? (
  <ReviewFileContent
    taskId={taskId}
    filePath={fileExplorerSelectedFile}
    rootPath={fileExplorerRootPath!}
    diffFilesMap={diffFilesMap}
  />
) : reviewMode === 'files' ? (
  <div className="text-ink-3 flex h-full items-center justify-center">
    <p>Select a file to view</p>
  </div>
) : null}
```

Create a `ReviewFileContent` helper inside the same file (similar to `FileExplorerContentPane` from `file-explorer-pane/index.tsx`) that checks if the file is changed (exists in diffFilesMap) and shows diff or plain content accordingly.

**Step 6: Handle WorktreeActions placement**

`WorktreeActions` (commit, merge, push buttons) should remain in the sidebar but only show in Changes mode. Already handled in Step 4.

**Step 7: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 8: Commit**

```bash
git add src/features/agent/ui-worktree-review-view/ src/features/agent/ui-worktree-diff-view/
git commit -m "feat: refactor WorktreeDiffView into WorktreeReviewView with mode tabs"
```

---

### Task 8: Wire Up Review View in TaskPanel

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Update import**

```typescript
// Old
import { WorktreeDiffView } from '@/features/agent/ui-worktree-diff-view';
// New
import { WorktreeReviewView } from '@/features/agent/ui-worktree-review-view';
```

**Step 2: Get review mode state**

In the `useDiffViewState` destructuring, add the new fields:

```typescript
const {
  isOpen: isDiffViewOpen,
  selectedFilePath: diffSelectedFile,
  collapsedFolders: diffCollapsedFolders,
  reviewMode,
  toggleDiffView,
  selectFile: selectDiffFile,
  toggleCollapsedFolder: toggleDiffCollapsedFolder,
  setReviewMode,
} = useDiffViewState(taskId);
```

**Step 3: Get file explorer state for files mode**

```typescript
import { useTaskFileExplorerState } from '@/stores/navigation';
import { useTaskRootPath } from '@/hooks/use-task-root-path';

// Inside TaskPanel component, after existing hooks:
const { rootPath: taskRootPathForExplorer } = useTaskRootPath(taskId);
const {
  selectedFilePath: explorerSelectedFile,
  expandedDirs: explorerExpandedDirs,
  selectFile: explorerSelectFile,
  toggleDir: explorerToggleDir,
  hideUnchanged: explorerHideUnchanged,
  toggleHideUnchanged: explorerToggleHideUnchanged,
} = useTaskFileExplorerState(taskId);
```

Note: `useTaskRootPath` is already imported via other usages — check first. The `useTaskFileExplorerState` is already imported for the file explorer pane.

**Step 4: Replace WorktreeDiffView with WorktreeReviewView**

In the JSX where `WorktreeDiffView` is rendered (~line 1457):

```tsx
) : isDiffViewOpen && task.worktreePath ? (
  <WorktreeReviewView
    taskId={taskId}
    projectId={project.id}
    selectedFilePath={diffSelectedFile}
    onSelectFile={selectDiffFile}
    collapsedFolders={diffCollapsedFolders}
    onToggleFolder={toggleDiffCollapsedFolder}
    reviewMode={reviewMode}
    onReviewModeChange={setReviewMode}
    fileExplorerRootPath={taskRootPathForExplorer}
    fileExplorerSelectedFile={explorerSelectedFile}
    onFileExplorerSelectFile={explorerSelectFile}
    fileExplorerExpandedDirs={explorerExpandedDirs}
    onFileExplorerToggleDir={explorerToggleDir}
    fileExplorerHideUnchanged={explorerHideUnchanged}
    onFileExplorerToggleHideUnchanged={explorerToggleHideUnchanged}
    branchName={...}
    sourceBranch={...}
    defaultBranch={...}
    protectedBranches={...}
    taskName={task.name}
    hasRepoLink={hasRepoLink}
    pullRequestUrl={task.pullRequestUrl}
    onMergeStarted={handleMergeStarted}
    onOpenPrView={openPrView}
    bottomPadding={footerHeight}
  />
```

**Step 5: Update menu labels**

In the overflow menu dropdown, update the diff item label:

```tsx
// Old
<DropdownItem icon={<GitCompare />} onClick={toggleDiffView} checked={isDiffViewOpen} shortcut="cmd+d">
  Diff
</DropdownItem>

// New
<DropdownItem icon={<GitCompare />} onClick={toggleDiffView} checked={isDiffViewOpen} shortcut="cmd+d">
  Review
</DropdownItem>
```

Update the command label:

```typescript
// Old
{ label: 'Toggle Diff View', shortcut: 'cmd+d', ... }
// New
{ label: 'Toggle Review View', shortcut: 'cmd+d', ... }
```

**Step 6: Run type check + lint + test**

Run: `pnpm ts-check && pnpm test && pnpm lint --fix`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: wire up WorktreeReviewView in TaskPanel with mode switching"
```

---

### Task 9: Add Keyboard Shortcuts for Review Mode Cycling

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Update the "Cycle Diff Mode" command**

The existing `cmd+shift+d` cycles through diff display modes (inline/side-by-side/current-state). Consider changing this or adding a new shortcut for cycling review modes.

Add a new command to cycle review modes:

```typescript
{
  label: 'Cycle Review Mode',
  shortcut: 'cmd+shift+r',
  section: 'Task',
  handler: () => {
    if (!isDiffViewOpen) return;
    const MODES: ReviewMode[] = ['changes', 'files', 'commits'];
    const next = MODES[(MODES.indexOf(reviewMode) + 1) % MODES.length];
    setReviewMode(next);
  },
},
```

Import `ReviewMode` from `@/stores/navigation`.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: add cmd+shift+r shortcut to cycle review modes"
```

---

### Task 10: Delete Old WorktreeDiffView Directory

**Files:**
- Delete: `src/features/agent/ui-worktree-diff-view/index.tsx`

**Step 1: Check no remaining imports**

Search for any remaining imports of `ui-worktree-diff-view`:

```bash
grep -r "ui-worktree-diff-view" src/
```

Expected: No results (all imports should point to `ui-worktree-review-view` now).

**Step 2: Delete the old directory**

```bash
rm -rf src/features/agent/ui-worktree-diff-view/
```

**Step 3: Run full validation**

```bash
pnpm install && pnpm test && pnpm lint --fix && pnpm ts-check && pnpm lint
```

Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old ui-worktree-diff-view directory"
```

---

### Task 11: Add Changelog Entry

**Files:**
- Create or modify: `changelogs/2026-05-23.md`

**Step 1: Check current date and add entry**

```bash
date +%Y-%m-%d
```

Add to `changelogs/2026-05-23.md`:

```markdown
- [feature] Review view now has three modes: Changes (diff), Files (full file tree), and Commits (timeline) — cycle with ⌘⇧R or click tabs in the sidebar header
```

**Step 2: Commit**

```bash
git add changelogs/
git commit -m "docs: add changelog for review view modes"
```

---

## Implementation Notes

### What each mode shows

| Mode | Left Sidebar | Right Content Pane |
|------|-------------|-------------------|
| **Changes** | `DiffFileTree` (changed files only) + `WorktreeActions` | `FileDiffContent` (diff for selected file) |
| **Files** | `FileTree` (full directory tree with diff badges) | Diff for changed files, plain content for unchanged |
| **Commits** | `ReviewCommitsPanel` (commit timeline) | Placeholder "Select a commit" (per-commit diff is future work) |

### What's NOT in scope

- Per-commit diff content (clicking a commit to see only that commit's changes) — future follow-up
- Renaming the `'diff'` value in `TaskViewMode` to `'review'` — too much blast radius for the store migration
- Moving `WorktreeActions` to a shared location — stays in Changes mode sidebar only
