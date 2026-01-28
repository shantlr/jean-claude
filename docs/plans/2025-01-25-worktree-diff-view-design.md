# Worktree Diff View Design

## Overview

Add a git diff view for tasks with worktrees. A toggle button in the task header opens a split-pane view showing changed files in a tree explorer on the left and file diffs on the right.

## UI Structure

When a task has a worktree, a **"Diff" button** appears in the task header next to the branch name badge. Clicking it toggles between the message stream and the diff view.

```
┌─────────────────────────────────────────────────────┬──────────────────┐
│ Header                                              │                  │
│ - [Diff] button (toggle, highlighted when active)   │ Right Pane       │
├────────────┬────────────────────────────────────────┤ (unchanged)      │
│ File Tree  │ Diff Content                           │                  │
│ (220px)    │                                        │                  │
│            │ "Select a file to view changes"        │                  │
│ 📁 src/    │ (placeholder when nothing selected)    │                  │
│  └ 📄 foo  │                                        │                  │
│            │ OR                                     │                  │
│            │                                        │                  │
│            │ [DiffView component]                   │                  │
│            │ (when file selected)                   │                  │
├────────────┴────────────────────────────────────────┤                  │
│ Footer (unchanged)                                  │                  │
└─────────────────────────────────────────────────────┴──────────────────┘
```

## Data Flow

### Backend (new IPC handler)

Add method to `worktree-service.ts`:

```typescript
async getWorktreeDiff(worktreePath: string, startCommitHash: string): Promise<{
  files: Array<{
    path: string
    status: 'added' | 'modified' | 'deleted'
    oldContent: string | null  // null for added files
    newContent: string | null  // null for deleted files
  }>
}>
```

Implementation:

1. Run `git diff --name-status {startCommitHash}` to get changed files
2. For each file, retrieve old content (from startCommitHash) and new content (from working tree)

### Frontend

- New hook `useWorktreeDiff(taskId)` - React Query, conditionally enabled when diff view is open
- State in navigation store: `diffView: { isOpen: boolean, selectedFilePath: string | null }`

## Components

### New Components

1. **`WorktreeDiffView`** (`src/features/agent/ui-worktree-diff-view/index.tsx`)
   - Main container replacing message stream when open
   - Props: `worktreePath`, `startCommitHash`, `projectPath`

2. **`DiffFileTree`** (`src/features/agent/ui-diff-file-tree/index.tsx`)
   - Nested folder tree with expand/collapse
   - Change type indicators: + (green), M (orange), − (red)
   - Props: `files`, `selectedPath`, `onSelectFile`
   - All folders expanded by default

### Reused Components

- **`DiffView`** - existing component for rendering file diffs

### Modified Files

- `src/routes/projects/$projectId/tasks/$taskId.tsx` - add Diff button, conditionally render WorktreeDiffView
- `src/stores/navigation.ts` - add diffView state

## File Tree Structure

Transform flat paths to nested tree:

```typescript
type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  status?: 'added' | 'modified' | 'deleted'; // only for files
  children?: TreeNode[]; // only for folders
};
```

Rendering:

- Folders: chevron icon (rotates on expand), 16px indent per level
- Files: colored status indicator (+/M/−)
- Selected file: highlighted background
- Click folder: toggle expand/collapse
- Click file: select and show diff

## Edge Cases

- **No changes**: Show "No changes yet" centered message
- **Git errors**: Show error message in diff view, keep UI functional
- **Binary files**: Show "Binary file changed" instead of diff
- **Large files**: Warn and truncate at ~5000 lines, offer "Show full diff"
- **Refresh**: Button in header to re-fetch changes while agent is running
