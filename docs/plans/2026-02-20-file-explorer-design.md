# File Explorer in Task Page — Design

## Overview

Add a file explorer pane to the task page that lets users browse the full directory tree of a project or worktree. The explorer appears as a right-side pane, expanding to show file content inline when a file is selected.

## Decisions

| Aspect | Decision |
|--------|----------|
| Scope | Full directory tree of project/worktree |
| Placement | Right pane in task page |
| Loading | Lazy — fetch children per folder on expand |
| Filtering | Respect root `.gitignore` + always exclude `.git/` |
| File viewing | Inline in pane — pane expands with tree + content side by side |
| Availability | All tasks (worktree path if available, else project path) |
| Toggle | Header button + `Cmd+E` shortcut |

## IPC Layer

New handler: `fs:listDirectory`

Takes an absolute directory path. Returns immediate children sorted directories-first, then alphabetical. Filters entries against the project's root `.gitignore` and always excludes `.git/`.

```ts
interface DirectoryEntry {
  name: string;
  path: string;       // absolute path
  isDirectory: boolean;
}
```

Uses the `ignore` npm package to parse `.gitignore` rules. The parsed ignore instance is cached per project root.

The root path is `task.worktreePath ?? project.path`.

File content reading reuses the existing `api.fs.readFile` IPC call.

## UI Component Architecture

New component: `src/features/agent/ui-file-explorer-pane/`

### Collapsed state (~250px) — tree only

```
┌───────────────────────┐
│ Files              [×] │
├───────────────────────┤
│ ▸ electron/           │
│ ▸ src/                │
│ ▸ shared/             │
│   package.json        │
│   tsconfig.json       │
└───────────────────────┘
```

### Expanded state (~700px) — tree + file content

When a file is selected, the pane expands and splits into tree + syntax-highlighted file content:

```
┌─────────────────────────────────────────┐
│ Files                              [×] │
├────────────┬────────────────────────────┤
│ ▸ electron/│ src/app.tsx               │
│ ▾ src/     │─────────────────────────── │
│   ▸ feat/  │ 1  import React from ...  │
│   app.tsx ◀│ 2  import { Router }...   │
│   main.ts  │ 3                         │
│            │ 4  export function App()  │
└────────────┴────────────────────────────┘
```

### Key behaviors

- New general-purpose `FileTree` component (not reusing `DiffFileTree` which is coupled to diff status indicators)
- File content viewer reuses Shiki highlighting from existing `FilePreviewPane` internals
- Clicking a file: expands pane, shows content. Clicking same file: deselects, pane shrinks
- Tree/content split is resizable via `useHorizontalResize` hook

## State Management

### Toggle

- Header button labeled "Files" next to existing "Diff" button
- Keyboard shortcut: `Cmd+E`

### Per-task state in navigation store

```ts
fileExplorer: {
  isOpen: boolean;
  selectedFilePath: string | null;
  expandedDirs: Set<string>;
}
```

### React Query caching

- Directory listings: cache key `['directory-listing', absoluteDirPath]`, staleTime 30s, manual refresh button
- File content: cache key `['file-content', absoluteFilePath]`, reuses existing `api.fs.readFile`

## Gitignore Filtering

- Use `ignore` npm package to parse `.gitignore`
- Read only root `.gitignore` (nested gitignore support deferred)
- Cache parsed ignore instance per project root
- Always exclude `.git/` regardless of `.gitignore`
- Symlinks: show but don't follow (avoid infinite loops)
- No `.gitignore` file: show everything except `.git/`
