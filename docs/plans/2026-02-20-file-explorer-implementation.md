# File Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a file explorer right pane to the task page that lets users browse the full project/worktree directory tree with lazy-loaded folders and inline file viewing.

**Architecture:** New `fs:listDirectory` IPC handler returns directory entries filtered by `.gitignore`. A `FileExplorerPane` component in the right pane renders a lazy-loaded `FileTree` + inline file content viewer. State (open/selected/expanded) lives in the navigation Zustand store per-task.

**Tech Stack:** Electron IPC, `ignore` npm package for .gitignore, React Query for caching, Shiki for syntax highlighting, Zustand for UI state.

---

### Task 1: Install `ignore` package

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `pnpm add ignore`

**Step 2: Verify installation**

Run: `pnpm ls ignore`
Expected: Shows `ignore` in the dependency list.

---

### Task 2: Add `fs:listDirectory` IPC handler

**Files:**
- Modify: `electron/ipc/handlers.ts` (after the `fs:readFile` handler around line 1128)
- Modify: `electron/preload.ts` (in the `fs` section around line 261)
- Modify: `src/lib/api.ts` (in the `fs` namespace around line 479)

**Step 1: Add the IPC handler in `electron/ipc/handlers.ts`**

Add after the existing `fs:readFile` handler block. This handler reads a directory, filters against `.gitignore`, and returns sorted entries (directories first, then alphabetical).

```typescript
import ignore from 'ignore';

// Cache for parsed .gitignore instances, keyed by project root
const gitignoreCache = new Map<string, ReturnType<typeof ignore>>();

async function getGitignore(projectRoot: string): Promise<ReturnType<typeof ignore>> {
  const cached = gitignoreCache.get(projectRoot);
  if (cached) return cached;

  const ig = ignore();
  ig.add('.git');
  try {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {
    // No .gitignore — only .git is excluded
  }
  gitignoreCache.set(projectRoot, ig);
  return ig;
}

ipcMain.handle(
  'fs:listDirectory',
  async (_, dirPath: string, projectRoot: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const ig = await getGitignore(projectRoot);

      const result: { name: string; path: string; isDirectory: boolean }[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);
        // For directories, append '/' so ignore patterns like 'node_modules/' match
        const relativeForIgnore = entry.isDirectory()
          ? relativePath + '/'
          : relativePath;
        if (ig.ignores(relativeForIgnore)) continue;
        // Skip symlinks to avoid infinite loops
        if (entry.isSymbolicLink()) continue;

        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
        });
      }

      // Sort: directories first, then alphabetical within each group
      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return result;
    } catch {
      return null;
    }
  },
);
```

**Step 2: Add preload bridge in `electron/preload.ts`**

In the `fs` section (around line 261), add `listDirectory` alongside existing methods:

```typescript
fs: {
  readPackageJson: (dirPath: string) =>
    ipcRenderer.invoke('fs:readPackageJson', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  listDirectory: (dirPath: string, projectRoot: string) =>
    ipcRenderer.invoke('fs:listDirectory', dirPath, projectRoot),
},
```

**Step 3: Add API type in `src/lib/api.ts`**

In the `fs` namespace (around line 479), add the `listDirectory` type:

```typescript
fs: {
  readPackageJson: (dirPath: string) => Promise<PackageJson | null>;
  readFile: (filePath: string) => Promise<{ content: string; language: string } | null>;
  listDirectory: (dirPath: string, projectRoot: string) => Promise<{ name: string; path: string; isDirectory: boolean }[] | null>;
};
```

Also add the same method to the fallback API (the non-Electron context):

```typescript
listDirectory: async () => null,
```

**Step 4: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors related to the new `listDirectory` method.

---

### Task 3: Add file explorer state to navigation store

**Files:**
- Modify: `src/stores/navigation.ts`

**Step 1: Add width constants**

Add after the existing width constants (around line 55):

```typescript
const DEFAULT_FILE_EXPLORER_TREE_WIDTH = 224;
const MIN_FILE_EXPLORER_TREE_WIDTH = 150;
const DEFAULT_FILE_EXPLORER_PANE_WIDTH = 300;
const MIN_FILE_EXPLORER_PANE_WIDTH = 250;
const MAX_FILE_EXPLORER_PANE_WIDTH = 900;
```

**Step 2: Add new `RightPane` variant**

In the `RightPane` type (around line 7), add:

```typescript
export type RightPane =
  | { type: 'filePreview'; filePath: string; lineStart?: number; lineEnd?: number }
  | { type: 'settings' }
  | { type: 'debugMessages' }
  | { type: 'fileExplorer'; selectedFilePath: string | null };
```

**Step 3: Add width state to `NavigationState` interface and store**

Add `fileExplorerTreeWidth` and `fileExplorerPaneWidth` fields to the store interface alongside the existing width fields, with corresponding setters. Initialize them with the default constants.

```typescript
// In the interface
fileExplorerTreeWidth: number;
fileExplorerPaneWidth: number;
setFileExplorerTreeWidth: (width: number) => void;
setFileExplorerPaneWidth: (width: number) => void;
```

```typescript
// In the create() block
fileExplorerTreeWidth: DEFAULT_FILE_EXPLORER_TREE_WIDTH,
fileExplorerPaneWidth: DEFAULT_FILE_EXPLORER_PANE_WIDTH,
setFileExplorerTreeWidth: (width) => set({ fileExplorerTreeWidth: width }),
setFileExplorerPaneWidth: (width) => set({ fileExplorerPaneWidth: width }),
```

**Step 4: Add width hooks**

Add at the bottom of the file, following the `useDiffFileTreeWidth` pattern:

```typescript
export function useFileExplorerTreeWidth() {
  const width = useStore((state) => state.fileExplorerTreeWidth);
  const setWidth = useStore((state) => state.setFileExplorerTreeWidth);
  return { width, setWidth, minWidth: MIN_FILE_EXPLORER_TREE_WIDTH };
}

export function useFileExplorerPaneWidth() {
  const width = useStore((state) => state.fileExplorerPaneWidth);
  const setWidth = useStore((state) => state.setFileExplorerPaneWidth);
  return {
    width,
    setWidth,
    minWidth: MIN_FILE_EXPLORER_PANE_WIDTH,
    maxWidth: MAX_FILE_EXPLORER_PANE_WIDTH,
  };
}
```

**Step 5: Add `openFileExplorer` and `selectFileExplorerFile` actions to `useTaskState` hook**

In the `useTaskState` hook (around line 346), add:

```typescript
const openFileExplorer = useCallback(() => {
  setTaskRightPaneAction(taskId, { type: 'fileExplorer', selectedFilePath: null });
}, [taskId, setTaskRightPaneAction]);

const selectFileExplorerFile = useCallback(
  (filePath: string | null) => {
    setTaskRightPaneAction(taskId, { type: 'fileExplorer', selectedFilePath: filePath });
  },
  [taskId, setTaskRightPaneAction],
);
```

Return them from the hook alongside the existing actions.

**Step 6: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 4: Add `useDirectoryListing` React Query hook

**Files:**
- Create: `src/hooks/use-directory-listing.ts`

**Step 1: Create the hook file**

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const api = window.api;

export function useDirectoryListing({
  dirPath,
  projectRoot,
  enabled = true,
}: {
  dirPath: string | null;
  projectRoot: string;
  enabled?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['directory-listing', dirPath],
    queryFn: () => {
      if (!dirPath) return null;
      return api.fs.listDirectory(dirPath, projectRoot);
    },
    enabled: enabled && !!dirPath,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return { entries: data ?? null, isLoading, error };
}

export function useInvalidateDirectoryListings() {
  const queryClient = useQueryClient();

  return useCallback(
    (projectRoot: string) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'directory-listing' &&
          typeof query.queryKey[1] === 'string' &&
          (query.queryKey[1] as string).startsWith(projectRoot),
      });
    },
    [queryClient],
  );
}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 5: Build `FileTree` component

**Files:**
- Create: `src/features/agent/ui-file-explorer-pane/file-tree.tsx`

**Step 1: Create the general-purpose FileTree component**

This is a lazy-loaded file tree — unlike `DiffFileTree` which takes a pre-computed flat list of changed files, this one fetches directory contents on demand when folders are expanded.

```tsx
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
} from 'lucide-react';

import { useDirectoryListing } from '@/hooks/use-directory-listing';

export function FileTree({
  rootPath,
  projectRoot,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: {
  rootPath: string;
  projectRoot: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const { entries, isLoading } = useDirectoryListing({
    dirPath: rootPath,
    projectRoot,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-neutral-500">Empty directory</div>
    );
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  entry,
  projectRoot,
  depth,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: {
  entry: { name: string; path: string; isDirectory: boolean };
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = entry.path === selectedFilePath;

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => onToggleDir(entry.path)}
          className={clsx(
            'flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-neutral-700/50',
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          )}
          <span className="truncate text-neutral-300">{entry.name}</span>
        </button>
        {isExpanded && (
          <DirectoryChildren
            dirPath={entry.path}
            projectRoot={projectRoot}
            depth={depth + 1}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(entry.path)}
      className={clsx(
        'flex w-full items-center gap-1 py-0.5 text-left text-sm',
        isSelected
          ? 'bg-neutral-700 text-neutral-100'
          : 'text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300',
      )}
      style={{ paddingLeft: 8 + depth * 16 + 14 }}
    >
      <File className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function DirectoryChildren({
  dirPath,
  projectRoot,
  depth,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: {
  dirPath: string;
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const { entries, isLoading } = useDirectoryListing({
    dirPath,
    projectRoot,
  });

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-1 py-0.5 text-xs text-neutral-500"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div
        className="py-0.5 text-xs italic text-neutral-600"
        style={{ paddingLeft: 8 + depth * 16 + 14 }}
      >
        Empty
      </div>
    );
  }

  return (
    <>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={depth}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 6: Build `FileExplorerPane` component

**Files:**
- Create: `src/features/agent/ui-file-explorer-pane/index.tsx`

**Step 1: Create the main pane component**

This is the right-pane component that contains the file tree and, when a file is selected, an inline syntax-highlighted file content viewer. The pane expands when a file is selected.

```tsx
import clsx from 'clsx';
import { FolderTree, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  useFileExplorerPaneWidth,
  useFileExplorerTreeWidth,
} from '@/stores/navigation';

import { FileContentViewer } from './file-content-viewer';
import { FileTree } from './file-tree';

export function FileExplorerPane({
  rootPath,
  projectRoot,
  selectedFilePath,
  onSelectFile,
  onClose,
}: {
  rootPath: string;
  projectRoot: string;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string | null) => void;
  onClose: () => void;
}) {
  const { width: treeWidth, setWidth: setTreeWidth, minWidth: treeMinWidth } =
    useFileExplorerTreeWidth();
  const {
    width: paneWidth,
    setWidth: setPaneWidth,
    minWidth: paneMinWidth,
    maxWidth: paneMaxWidth,
  } = useFileExplorerPaneWidth();

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(),
  );

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(
    (filePath: string) => {
      // Toggle: clicking the same file deselects it
      onSelectFile(filePath === selectedFilePath ? null : filePath);
    },
    [onSelectFile, selectedFilePath],
  );

  const hasSelectedFile = selectedFilePath !== null;

  // When a file is selected, use persisted pane width; otherwise just show tree
  const effectiveWidth = hasSelectedFile
    ? Math.max(paneWidth, paneMinWidth)
    : treeWidth + 50; // 50px accounts for header padding

  // Resize handle for the tree/content split (only when file is selected)
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: treeWidth,
    minWidth: treeMinWidth,
    maxWidthFraction: 0.5,
    onWidthChange: setTreeWidth,
  });

  // For resizing the entire pane from the left edge
  const {
    containerRef: outerContainerRef,
    isDragging: isOuterDragging,
    handleMouseDown: handleOuterMouseDown,
  } = useHorizontalResize({
    initialWidth: effectiveWidth,
    minWidth: paneMinWidth,
    maxWidth: paneMaxWidth,
    direction: 'left',
    onWidthChange: setPaneWidth,
  });

  return (
    <div
      ref={outerContainerRef}
      className={clsx(
        'relative flex h-full shrink-0 flex-col border-l border-neutral-700 bg-neutral-900',
        (isDragging || isOuterDragging) && 'select-none',
      )}
      style={{ width: effectiveWidth }}
    >
      {/* Left-edge resize handle for the whole pane */}
      {hasSelectedFile && (
        <div
          onMouseDown={handleOuterMouseDown}
          className="absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize hover:bg-blue-500/30"
        />
      )}

      {/* Header */}
      <div className="flex h-[40px] shrink-0 items-center justify-between border-b border-neutral-700 px-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <FolderTree className="h-4 w-4" />
          Files
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content area */}
      <div
        ref={containerRef}
        className={clsx(
          'flex min-h-0 flex-1',
          isDragging && 'select-none',
        )}
      >
        {/* Tree panel */}
        <div
          className="relative shrink-0 overflow-y-auto overflow-x-hidden"
          style={{
            width: hasSelectedFile ? treeWidth : '100%',
          }}
        >
          <FileTree
            rootPath={rootPath}
            projectRoot={projectRoot}
            selectedFilePath={selectedFilePath}
            onSelectFile={handleSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={handleToggleDir}
          />
        </div>

        {/* Resize handle between tree and content */}
        {hasSelectedFile && (
          <div
            onMouseDown={handleMouseDown}
            className="h-full w-1 shrink-0 cursor-col-resize hover:bg-blue-500/30"
          />
        )}

        {/* File content panel */}
        {hasSelectedFile && selectedFilePath && (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-neutral-700">
            <FileContentViewer filePath={selectedFilePath} />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 7: Build `FileContentViewer` sub-component

**Files:**
- Create: `src/features/agent/ui-file-explorer-pane/file-content-viewer.tsx`

**Step 1: Create the file content viewer**

Reuses the same Shiki highlighting approach as `FilePreviewPane` but without the line-range highlight and open-in-editor features — just a clean syntax-highlighted file view.

```tsx
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

import { useQuery } from '@tanstack/react-query';

const api = window.api;

export function FileContentViewer({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');

  const { data: fileData, isLoading } = useQuery({
    queryKey: ['file-content', filePath],
    queryFn: () => api.fs.readFile(filePath),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!fileData) {
      setHighlightedHtml('');
      return;
    }

    let cancelled = false;
    const highlight = async () => {
      try {
        let html: string;
        try {
          html = await codeToHtml(fileData.content, {
            lang: fileData.language || 'text',
            theme: 'github-dark',
          });
        } catch {
          html = await codeToHtml(fileData.content, {
            lang: 'text',
            theme: 'github-dark',
          });
        }
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        if (!cancelled) setHighlightedHtml('');
      }
    };
    highlight();
    return () => {
      cancelled = true;
    };
  }, [fileData]);

  // Extract just the filename from the full path
  const fileName = filePath.split('/').pop() ?? filePath;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Unable to read file
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* File name header */}
      <div className="flex h-[32px] shrink-0 items-center border-b border-neutral-700 px-3">
        <span className="truncate text-xs text-neutral-400">{fileName}</span>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto text-sm"
      >
        {highlightedHtml ? (
          <div
            className="min-w-fit [&_pre]:!bg-transparent [&_pre]:p-4"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="p-4 text-neutral-300">{fileData.content}</pre>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 8: Integrate into task panel

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Add import**

Add at the top with the other feature imports:

```typescript
import { FileExplorerPane } from '@/features/agent/ui-file-explorer-pane';
```

**Step 2: Add state hooks**

In the component body, destructure `openFileExplorer` and `selectFileExplorerFile` from `useTaskState(taskId)`:

```typescript
const {
  rightPane,
  openFilePreview,
  openSettings,
  openDebugMessages,
  openFileExplorer,
  selectFileExplorerFile,
  closeRightPane,
  toggleRightPane,
} = useTaskState(taskId);
```

**Step 3: Add the "Files" header button**

Add a new button in the header row (around lines 540-560), near the existing Diff button. It should be visible for ALL tasks (not just worktree tasks):

```tsx
<button
  onClick={() => {
    if (rightPane?.type === 'fileExplorer') {
      closeRightPane();
    } else {
      openFileExplorer();
    }
  }}
  className={clsx(
    'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
    rightPane?.type === 'fileExplorer'
      ? 'bg-blue-500/20 text-blue-400'
      : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
  )}
>
  <FolderTree className="h-3.5 w-3.5" />
  Files
</button>
```

Add `FolderTree` to the lucide-react imports at the top.

**Step 4: Add conditional render for the FileExplorerPane**

After the existing right pane conditional renders (around line 797), add:

```tsx
{rightPane?.type === 'fileExplorer' && project && (
  <FileExplorerPane
    rootPath={task?.worktreePath ?? project.path}
    projectRoot={task?.worktreePath ?? project.path}
    selectedFilePath={rightPane.selectedFilePath}
    onSelectFile={selectFileExplorerFile}
    onClose={closeRightPane}
  />
)}
```

**Step 5: Add keyboard shortcut**

In the `useCommands('task-panel', [...])` block (around line 363), add a new command entry:

```typescript
{
  label: rightPane?.type === 'fileExplorer'
    ? 'Close File Explorer'
    : 'Open File Explorer',
  shortcut: 'cmd+e',
  section: 'Task',
  handler: () => {
    if (rightPane?.type === 'fileExplorer') {
      closeRightPane();
    } else {
      openFileExplorer();
    }
  },
},
```

**Step 6: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No errors.

---

### Task 9: Lint and final verification

**Step 1: Run lint with auto-fix**

Run: `pnpm lint --fix`
Expected: No errors (warnings are OK).

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors.

**Step 3: Visual smoke test checklist**

Verify in the running app:
- [ ] "Files" button appears in all task headers
- [ ] Clicking "Files" opens the right pane with directory tree
- [ ] Folders expand/collapse on click, loading children lazily
- [ ] `.git` and `.gitignore`-matched entries are hidden
- [ ] Clicking a file expands the pane and shows syntax-highlighted content
- [ ] Clicking the same file deselects it and shrinks the pane
- [ ] The tree/content split is resizable by dragging
- [ ] `Cmd+E` toggles the file explorer
- [ ] Closing the pane via X button works
- [ ] Navigating between tasks preserves each task's file explorer state
