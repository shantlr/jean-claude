# File Explorer in Task Composer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable file explorer section to the new task composer overlay, allowing users to browse project files, view content with syntax highlighting, and add inline comments that get synthesized into the task prompt.

**Architecture:** New Zustand store for composer file comments (per-project). Reuse existing `FileTree` and `useDirectoryListing` components. New `FileContentViewer` variant with line-clickable comment support. Toggle button in overlay footer. Comments synthesized into prompt on task creation, similar to `synthesizeReviewPrompt`.

**Tech Stack:** React, Zustand, TanStack Query, Shiki syntax highlighting, existing `useDirectoryListing` hook + `api.fs.readFile`

---

### Task 1: Composer File Comments Store

**Files:**
- Create: `src/stores/composer-file-comments.ts`

**Step 1: Create the store**

This store manages inline file comments added during task composition. Keyed by projectId (matches draft store pattern). Comments are anchored to file + line range.

```typescript
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';

export interface ComposerFileComment {
  id: string;
  anchor: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
  };
  body: string;
  createdAt: number;
}

interface ComposerFileCommentsState {
  /** Per-project comments: projectId -> comments[] */
  comments: Record<string, ComposerFileComment[]>;
  addComment: (
    projectId: string,
    comment: Omit<ComposerFileComment, 'id' | 'createdAt'>,
  ) => string;
  removeComment: (projectId: string, commentId: string) => void;
  updateComment: (
    projectId: string,
    commentId: string,
    body: string,
  ) => void;
  clearComments: (projectId: string) => void;
  clearAllComments: () => void;
}

const EMPTY_ARRAY: ComposerFileComment[] = [];

export const useComposerFileCommentsStore = create<ComposerFileCommentsState>()(
  (set) => ({
    comments: {},

    addComment: (projectId, comment) => {
      const id = crypto.randomUUID();
      set((state) => ({
        comments: {
          ...state.comments,
          [projectId]: [
            ...(state.comments[projectId] ?? []),
            { ...comment, id, createdAt: Date.now() },
          ],
        },
      }));
      return id;
    },

    removeComment: (projectId, commentId) => {
      set((state) => ({
        comments: {
          ...state.comments,
          [projectId]: (state.comments[projectId] ?? []).filter(
            (c) => c.id !== commentId,
          ),
        },
      }));
    },

    updateComment: (projectId, commentId, body) => {
      set((state) => ({
        comments: {
          ...state.comments,
          [projectId]: (state.comments[projectId] ?? []).map((c) =>
            c.id === commentId ? { ...c, body } : c,
          ),
        },
      }));
    },

    clearComments: (projectId) => {
      set((state) => {
        const { [projectId]: _, ...rest } = state.comments;
        return { comments: rest };
      });
    },

    clearAllComments: () => {
      set({ comments: {} });
    },
  }),
);

// --- Selector hooks ---

export function useComposerFileComments(projectId: string | null) {
  return useComposerFileCommentsStore(
    (state) =>
      (projectId ? state.comments[projectId] : null) ?? EMPTY_ARRAY,
  );
}

export function useComposerFileCommentsForFile(
  projectId: string | null,
  filePath: string | null,
) {
  const comments = useComposerFileComments(projectId);
  return useMemo(
    () =>
      filePath
        ? comments.filter((c) => c.anchor.filePath === filePath)
        : EMPTY_ARRAY,
    [comments, filePath],
  );
}

export function useComposerFileCommentCount(projectId: string | null) {
  const comments = useComposerFileComments(projectId);
  return comments.length;
}

export function useComposerFileCommentActions(projectId: string) {
  const addComment = useComposerFileCommentsStore((s) => s.addComment);
  const removeComment = useComposerFileCommentsStore((s) => s.removeComment);
  const updateComment = useComposerFileCommentsStore((s) => s.updateComment);
  const clearComments = useComposerFileCommentsStore((s) => s.clearComments);

  return {
    addComment: useCallback(
      (comment: Omit<ComposerFileComment, 'id' | 'createdAt'>) =>
        addComment(projectId, comment),
      [projectId, addComment],
    ),
    removeComment: useCallback(
      (commentId: string) => removeComment(projectId, commentId),
      [projectId, removeComment],
    ),
    updateComment: useCallback(
      (commentId: string, body: string) =>
        updateComment(projectId, commentId, body),
      [projectId, updateComment],
    ),
    clearComments: useCallback(
      () => clearComments(projectId),
      [projectId, clearComments],
    ),
  };
}

// --- Prompt synthesis ---

export function synthesizeFileCommentsPrompt(
  comments: ComposerFileComment[],
): string | null {
  if (comments.length === 0) return null;

  const parts: string[] = [];
  parts.push('Context from codebase review:');
  parts.push('');

  // Group by file
  const byFile = new Map<string, ComposerFileComment[]>();
  for (const c of comments) {
    const list = byFile.get(c.anchor.filePath) ?? [];
    list.push(c);
    byFile.set(c.anchor.filePath, list);
  }

  for (const [filePath, fileComments] of byFile) {
    parts.push(`### ${filePath}`);
    for (const c of fileComments) {
      const lineLabel = c.anchor.lineEnd
        ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
        : `L${c.anchor.lineStart}`;
      parts.push(`- ${lineLabel}: ${c.body}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/stores/composer-file-comments.ts
git commit -m "feat: add composer file comments store"
```

---

### Task 2: Composer File Explorer State in Navigation Store

**Files:**
- Modify: `src/stores/navigation.ts`

Add per-project file explorer state for the composer (separate from per-task state). Reuse same `FileExplorerState` interface.

**Step 1: Add composer file explorer state**

Add to the store's state interface:
```typescript
composerFileExplorer: Record<string, FileExplorerState>;
```

Add actions:
```typescript
setComposerFileExplorerSelectedFile: (projectId: string, filePath: string | null) => void;
toggleComposerFileExplorerExpandedDir: (projectId: string, dirPath: string) => void;
```

Implementation follows same pattern as `setFileExplorerSelectedFile` / `toggleFileExplorerExpandedDir` but keyed by projectId instead of taskId.

Add hook:
```typescript
export function useComposerFileExplorerState(projectId: string) {
  // Same pattern as useTaskFileExplorerState but reads from composerFileExplorer[projectId]
}
```

**Step 2: Verify**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/stores/navigation.ts
git commit -m "feat: add composer file explorer state to navigation store"
```

---

### Task 3: Commentable File Content Viewer Component

**Files:**
- Create: `src/features/new-task/ui-composer-file-explorer/commentable-file-viewer.tsx`

A file content viewer with line numbers that supports clicking a line to add a comment. Shows existing comments inline. Reuses Shiki highlighting from existing `FileContentViewer`.

**Step 1: Create the component**

Key differences from existing `FileContentViewer`:
- Renders line numbers as clickable gutters
- Shows inline comment composers when a line is clicked
- Shows existing comments between lines
- Uses `useComposerFileCommentsForFile` for existing comments
- Uses `useComposerFileCommentActions` for add/remove

Structure:
```tsx
export function CommentableFileViewer({
  filePath,
  projectId,
}: {
  filePath: string;
  projectId: string;
}) {
  // Fetch file content with api.fs.readFile
  // Split content into lines
  // Render each line with line number gutter
  // On gutter click → open inline comment composer at that line
  // Show existing comments below their anchor lines
  // Comment composer: textarea + submit/cancel (simplified from ReviewCommentComposer — no presets needed)
}
```

The viewer should:
1. Fetch file content via React Query (`['file-content', filePath]`)
2. Apply Shiki syntax highlighting per-line (use `codeToTokens` for line-level control)
3. Render lines with clickable gutter (+ icon on hover)
4. When gutter clicked, show inline composer below that line
5. Display existing comments with body text and delete button
6. Support line range selection (click + shift-click for multi-line)

Use same styling as the review comment system but simplified (no presets, no status tracking).

**Step 2: Verify**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/new-task/ui-composer-file-explorer/commentable-file-viewer.tsx
git commit -m "feat: add commentable file viewer for task composer"
```

---

### Task 4: Composer File Explorer Pane Component

**Files:**
- Create: `src/features/new-task/ui-composer-file-explorer/index.tsx`

Split-pane component containing FileTree (reused) + CommentableFileViewer. Follows pattern from existing `FileExplorerPane` but simplified (no outer resize, embedded in overlay).

**Step 1: Create the component**

```tsx
export function ComposerFileExplorer({
  projectId,
  projectRoot,
}: {
  projectId: string;
  projectRoot: string;
}) {
  // Use useComposerFileExplorerState(projectId) for tree state
  // Use useHorizontalResize for tree/content divider
  // Render: FileTree (left) + CommentableFileViewer (right)
  // Show comment count badge somewhere visible
}
```

Layout:
- Left: `FileTree` from `src/features/task/ui-task-panel/file-explorer-pane/file-tree.tsx` (import directly, already generic)
- Right: `CommentableFileViewer` (from Task 3)
- Horizontal resize handle between them
- Height: fills available space in overlay (flex-1 with min-h-0)

**Step 2: Verify**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/new-task/ui-composer-file-explorer/index.tsx
git commit -m "feat: add composer file explorer pane component"
```

---

### Task 5: Integrate File Explorer into New Task Overlay

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/stores/new-task-draft.ts`

**Step 1: Add `showFileExplorer` toggle to draft store**

In `NewTaskDraft` interface, add:
```typescript
showFileExplorer: boolean;
```

Default: `false`.

**Step 2: Add toggle button in overlay footer**

In the footer section (after the Worktree checkbox, around line 1154), add a "Files" toggle button. Follow the exact same checkbox-button pattern used for Worktree toggle. Add keyboard shortcut `Cmd+E`.

```tsx
{!isNoteMode && selectedProjectId && (
  <button
    type="button"
    role="checkbox"
    aria-checked={currentShowFileExplorer}
    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-[5px] text-xs font-medium"
    style={currentShowFileExplorer ? activeStyle : inactiveStyle}
    onClick={() => updateDraft({ showFileExplorer: !currentShowFileExplorer })}
  >
    <ToolCheckmark checked={currentShowFileExplorer} />
    Files
    <Kbd shortcut="cmd+e" />
  </button>
)}
```

Register `Cmd+E` in the keyboard shortcuts section.

**Step 3: Add file explorer content area**

Between the project grid and footer (after line ~1084, before footer), add:

```tsx
{currentShowFileExplorer && selectedProject && (
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <ComposerFileExplorer
      projectId={selectedProject.id}
      projectRoot={selectedProject.path}
    />
  </div>
)}
```

When file explorer is shown, the overlay should expand to use available height (the max-h-[80svh] constraint already handles this).

**Step 4: Show comment count badge on Files button**

When there are comments for the selected project, show a count badge on the toggle button:

```tsx
Files {commentCount > 0 && <span className="...">{commentCount}</span>}
```

**Step 5: Verify**

Run: `pnpm ts-check`

**Step 6: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx src/stores/new-task-draft.ts
git commit -m "feat: integrate file explorer toggle into task composer"
```

---

### Task 6: Synthesize File Comments into Task Prompt

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Append file comments to prompt on task creation**

In `handleStartTask` (the task creation handler), before calling `createTaskMutation.mutateAsync`:

1. Get comments from `useComposerFileCommentsStore.getState().comments[selectedProjectId]`
2. Call `synthesizeFileCommentsPrompt(comments)` 
3. If result is non-null, append it to the final prompt:
   ```typescript
   const fileContext = synthesizeFileCommentsPrompt(comments);
   const finalPrompt = fileContext
     ? `${prompt}\n\n${fileContext}`
     : prompt;
   ```
4. After successful task creation, clear comments: `clearComments(selectedProjectId)`

**Step 2: Verify**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx
git commit -m "feat: synthesize file comments into task prompt"
```

---

### Task 7: Polish & Final Verification

**Files:**
- All files from above

**Step 1: Run linting**

```bash
pnpm lint --fix
```

**Step 2: Run TypeScript check**

```bash
pnpm ts-check
```

**Step 3: Run lint again for remaining issues**

```bash
pnpm lint
```

**Step 4: Fix any remaining issues**

**Step 5: Final commit if needed**

```bash
git add -A
git commit -m "chore: lint fixes for file explorer in task composer"
```

---

## Design Notes

### Comment Format in Synthesized Prompt

```
Context from codebase review:

### src/features/auth/login.tsx
- L42: This auth flow needs error handling for expired tokens
- L78-85: Refactor this to use the new auth service

### src/lib/api.ts  
- L156: Add retry logic here
```

### UX Flow

1. User opens new task overlay (Cmd+N)
2. Types prompt in textarea
3. Toggles "Files" button (Cmd+E) → file explorer section appears below project grid
4. Browses project file tree, clicks file to open
5. Clicks line gutter → inline comment composer appears
6. Types comment, submits with Cmd+Enter
7. Adds more comments across files
8. Cmd+Enter to start task → prompt + synthesized file comments sent together

### What We Reuse

- `FileTree` component (from task panel file explorer) — generic, takes props
- `useDirectoryListing` hook — already project-root aware
- `api.fs.readFile` — returns `{ content, language }`
- Footer toggle button pattern (same as Worktree toggle)
- Comment composer UX pattern (from review comments, simplified)
- `synthesizeReviewPrompt` pattern (for prompt synthesis)
