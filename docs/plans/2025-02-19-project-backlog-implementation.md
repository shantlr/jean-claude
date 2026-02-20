# Project Backlog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-project backlog — a lightweight todo list accessible via `Cmd+B` overlay where items can be reordered and converted into agent tasks.

**Architecture:** New `project_todos` SQLite table with full vertical slice (migration → repository → IPC → preload → API types → React Query hooks → overlay UI). The overlay follows the existing command palette pattern. A sidebar button provides visual entry point with count badge.

**Tech Stack:** SQLite/Kysely, Electron IPC, React, TanStack React Query, Zustand, Tailwind CSS

**Design doc:** `docs/plans/2025-02-19-project-backlog-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `electron/database/migrations/029_project_todos.ts`

**Step 1: Create the migration file**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('project_todos')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  await db.schema
    .createIndex('project_todos_project_idx')
    .on('project_todos')
    .columns(['projectId'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_todos').execute();
}
```

**Step 2: Verify file is saved**

Run: `ls electron/database/migrations/029_project_todos.ts`
Expected: File listed

---

### Task 2: Register Migration & Update Schema

**Files:**
- Modify: `electron/database/migrator.ts` — import and register `m029`
- Modify: `electron/database/schema.ts` — add table type and Database entry

**Step 1: Register migration in migrator.ts**

Add import at top with the other migration imports:
```typescript
import * as m029 from './migrations/029_project_todos';
```

Add to the `migrations` record:
```typescript
'029_project_todos': m029,
```

**Step 2: Add schema types in schema.ts**

Add the table interface (after the existing `TaskSummaryTable`):
```typescript
export interface ProjectTodoTable {
  id: Generated<string>;
  projectId: string;
  content: string;
  sortOrder: number;
  createdAt: Generated<string>;
}

export type ProjectTodoRow = Selectable<ProjectTodoTable>;
export type NewProjectTodoRow = Insertable<ProjectTodoTable>;
export type UpdateProjectTodoRow = Updateable<ProjectTodoTable>;
```

Add to the `Database` interface:
```typescript
project_todos: ProjectTodoTable;
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors related to the new types

---

### Task 3: Repository

**Files:**
- Create: `electron/database/repositories/project-todos.ts`
- Modify: `electron/database/repositories/index.ts` — export new repository

**Step 1: Create repository file**

```typescript
import { dbg } from '../../lib/debug';
import { db } from '../index';
import { NewProjectTodoRow, UpdateProjectTodoRow } from '../schema';

export const ProjectTodoRepository = {
  findByProjectId: (projectId: string) =>
    db
      .selectFrom('project_todos')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('sortOrder', 'asc')
      .execute(),

  countByProjectId: (projectId: string) =>
    db
      .selectFrom('project_todos')
      .select(db.fn.countAll<number>().as('count'))
      .where('projectId', '=', projectId)
      .executeTakeFirstOrThrow(),

  create: async (data: Omit<NewProjectTodoRow, 'sortOrder'>) => {
    dbg.db('projectTodos.create projectId=%s', data.projectId);

    // Get next sortOrder
    const last = await db
      .selectFrom('project_todos')
      .select('sortOrder')
      .where('projectId', '=', data.projectId)
      .orderBy('sortOrder', 'desc')
      .executeTakeFirst();

    const sortOrder = (last?.sortOrder ?? -1) + 1;

    return db
      .insertInto('project_todos')
      .values({ ...data, sortOrder })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update: (id: string, data: UpdateProjectTodoRow) => {
    dbg.db('projectTodos.update id=%s', id);
    return db
      .updateTable('project_todos')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: (id: string) => {
    dbg.db('projectTodos.delete id=%s', id);
    return db.deleteFrom('project_todos').where('id', '=', id).execute();
  },

  reorder: async (projectId: string, orderedIds: string[]) => {
    dbg.db('projectTodos.reorder projectId=%s ids=%o', projectId, orderedIds);
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .updateTable('project_todos')
        .set({ sortOrder: i })
        .where('id', '=', orderedIds[i])
        .where('projectId', '=', projectId)
        .execute();
    }
  },
};
```

**Step 2: Export from repository index**

In `electron/database/repositories/index.ts`, add:
```typescript
export { ProjectTodoRepository } from './project-todos';
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 4: Shared Types

**Files:**
- Modify: `shared/types.ts` — add `ProjectTodo` type

**Step 1: Add types to shared/types.ts**

Add near the other entity interfaces:
```typescript
export interface ProjectTodo {
  id: string;
  projectId: string;
  content: string;
  sortOrder: number;
  createdAt: string;
}
```

No `NewProjectTodo` or `UpdateProjectTodo` needed — the IPC layer will accept inline params.

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 5: IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts` — add 5 new handlers

**Step 1: Add handlers inside `registerIpcHandlers()`**

Add import at top:
```typescript
import { ProjectTodoRepository } from '../database/repositories/project-todos';
```

Add handler group (inside `registerIpcHandlers()`, after existing handler groups):
```typescript
// Project Todos
ipcMain.handle('project-todos:list', (_, projectId: string) =>
  ProjectTodoRepository.findByProjectId(projectId),
);

ipcMain.handle('project-todos:count', (_, projectId: string) =>
  ProjectTodoRepository.countByProjectId(projectId),
);

ipcMain.handle(
  'project-todos:create',
  (_, data: { projectId: string; content: string }) => {
    dbg.ipc('project-todos:create %o', data);
    return ProjectTodoRepository.create(data);
  },
);

ipcMain.handle(
  'project-todos:update',
  (_, id: string, data: { content: string }) => {
    dbg.ipc('project-todos:update %s %o', id, data);
    return ProjectTodoRepository.update(id, data);
  },
);

ipcMain.handle('project-todos:delete', (_, id: string) => {
  dbg.ipc('project-todos:delete %s', id);
  return ProjectTodoRepository.delete(id);
});

ipcMain.handle(
  'project-todos:reorder',
  (_, projectId: string, orderedIds: string[]) => {
    dbg.ipc('project-todos:reorder %s %o', projectId, orderedIds);
    return ProjectTodoRepository.reorder(projectId, orderedIds);
  },
);
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 6: Preload Bridge

**Files:**
- Modify: `electron/preload.ts` — add `projectTodos` namespace

**Step 1: Add to `contextBridge.exposeInMainWorld('api', { ... })`**

```typescript
projectTodos: {
  list: (projectId: string) =>
    ipcRenderer.invoke('project-todos:list', projectId),
  count: (projectId: string) =>
    ipcRenderer.invoke('project-todos:count', projectId),
  create: (data: unknown) => ipcRenderer.invoke('project-todos:create', data),
  update: (id: string, data: unknown) =>
    ipcRenderer.invoke('project-todos:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('project-todos:delete', id),
  reorder: (projectId: string, orderedIds: string[]) =>
    ipcRenderer.invoke('project-todos:reorder', projectId, orderedIds),
},
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 7: API Types

**Files:**
- Modify: `src/lib/api.ts` — add `projectTodos` to `Api` interface and fallback stub

**Step 1: Add import**

Add to the existing import from `@shared/types`:
```typescript
import type { ProjectTodo } from '@shared/types';
```

**Step 2: Add to `Api` interface**

```typescript
projectTodos: {
  list: (projectId: string) => Promise<ProjectTodo[]>;
  count: (projectId: string) => Promise<{ count: number }>;
  create: (data: { projectId: string; content: string }) => Promise<ProjectTodo>;
  update: (id: string, data: { content: string }) => Promise<ProjectTodo>;
  delete: (id: string) => Promise<void>;
  reorder: (projectId: string, orderedIds: string[]) => Promise<void>;
};
```

**Step 3: Add to fallback `api` stub**

```typescript
projectTodos: {
  list: async () => [],
  count: async () => ({ count: 0 }),
  create: async () => {
    throw new Error('API not available');
  },
  update: async () => {
    throw new Error('API not available');
  },
  delete: async () => {},
  reorder: async () => {},
},
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

**Step 5: Commit backend vertical slice**

```bash
git add electron/database/migrations/029_project_todos.ts electron/database/migrator.ts electron/database/schema.ts electron/database/repositories/project-todos.ts electron/database/repositories/index.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts shared/types.ts
git commit -m "feat(backlog): add project_todos table, repository, IPC handlers, and API types"
```

---

### Task 8: React Query Hooks

**Files:**
- Create: `src/hooks/use-project-todos.ts`

**Step 1: Create hooks file**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectTodo } from '@shared/types';

export function useProjectTodos(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-todos', { projectId }],
    queryFn: () => api.projectTodos.list(projectId!),
    enabled: !!projectId,
  });
}

export function useProjectTodoCount(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-todos-count', { projectId }],
    queryFn: () => api.projectTodos.count(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; content: string }) =>
      api.projectTodos.create(data),
    onSuccess: (todo) => {
      queryClient.invalidateQueries({
        queryKey: ['project-todos', { projectId: todo.projectId }],
      });
      queryClient.invalidateQueries({
        queryKey: ['project-todos-count', { projectId: todo.projectId }],
      });
    },
  });
}

export function useUpdateProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.projectTodos.update(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-todos'] });
    },
  });
}

export function useDeleteProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projectTodos.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-todos'] });
      queryClient.invalidateQueries({ queryKey: ['project-todos-count'] });
    },
  });
}

export function useReorderProjectTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      orderedIds,
    }: {
      projectId: string;
      orderedIds: string[];
    }) => api.projectTodos.reorder(projectId, orderedIds),
    onMutate: async ({ projectId, orderedIds }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: ['project-todos', { projectId }],
      });

      // Snapshot previous value
      const previous = queryClient.getQueryData<ProjectTodo[]>([
        'project-todos',
        { projectId },
      ]);

      // Optimistically reorder
      if (previous) {
        const reordered = orderedIds
          .map((id) => previous.find((t) => t.id === id))
          .filter(Boolean) as ProjectTodo[];
        queryClient.setQueryData(
          ['project-todos', { projectId }],
          reordered,
        );
      }

      return { previous, projectId };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(
          ['project-todos', { projectId: context.projectId }],
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['project-todos', { projectId }],
      });
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 9: Overlay Store Update

**Files:**
- Modify: `src/stores/overlays.ts` — add `'project-backlog'` to `OverlayType`

**Step 1: Add to OverlayType union**

Find the `OverlayType` union and add `'project-backlog'`:
```typescript
export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'background-jobs'
  | 'settings'
  | 'project-backlog';
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 10: Backlog Overlay Component

**Files:**
- Create: `src/features/project/ui-backlog-overlay/index.tsx`

**Step 1: Create the overlay component**

This is the main UI component. It follows the command palette overlay pattern.

```tsx
import { useRef, useState } from 'react';
import { GripVertical, MoreHorizontal, Pencil, ArrowRight, Trash2 } from 'lucide-react';
import { useCommands } from '@/common/hooks/use-commands';
import { useOverlaysStore } from '@/stores/overlays';
import { useNewTaskDraft } from '@/stores/new-task-draft';
import {
  useProjectTodos,
  useCreateProjectTodo,
  useUpdateProjectTodo,
  useDeleteProjectTodo,
  useReorderProjectTodos,
} from '@/hooks/use-project-todos';
import type { ProjectTodo } from '@shared/types';

export function BacklogOverlay({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: todos = [] } = useProjectTodos(projectId);
  const createTodo = useCreateProjectTodo();
  const updateTodo = useUpdateProjectTodo();
  const deleteTodo = useDeleteProjectTodo();
  const reorderTodos = useReorderProjectTodos();

  const open = useOverlaysStore((s) => s.open);
  const { updateDraft } = useNewTaskDraft();

  // Register Escape to close
  useCommands('backlog-overlay', [
    {
      label: 'Close Backlog',
      shortcut: ['escape', 'cmd+b'],
      handler: () => {
        onClose();
      },
      hideInCommandPalette: true,
    },
  ]);

  const handleCreate = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    createTodo.mutate({ projectId, content: trimmed });
    setNewContent('');
    inputRef.current?.focus();
  };

  const handleStartEdit = (todo: ProjectTodo) => {
    setEditingId(todo.id);
    setEditContent(todo.content);
    setMenuOpenId(null);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== todos.find((t) => t.id === editingId)?.content) {
      updateTodo.mutate({ id: editingId, content: trimmed });
    }
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = (id: string) => {
    deleteTodo.mutate(id);
    setMenuOpenId(null);
  };

  const handleConvertToTask = (todo: ProjectTodo) => {
    setMenuOpenId(null);
    onClose();
    updateDraft({ inputMode: 'prompt', prompt: todo.content });
    // Store the todo ID so we can delete it after task creation
    sessionStorage.setItem('backlog-convert-todo-id', todo.id);
    open('new-task');
  };

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...todos];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    reorderTodos.mutate({
      projectId,
      orderedIds: reordered.map((t) => t.id),
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60svh] w-[90svw] max-w-[560px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input for adding new todos */}
        <div className="border-b border-neutral-700 p-3">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Type a todo and press Enter..."
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 outline-none"
          />
        </div>

        {/* Todo list */}
        <div className="flex-1 overflow-y-auto">
          {todos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 p-8 text-center text-sm text-neutral-500">
              <p>No backlog items yet.</p>
              <p>Type above to capture an idea.</p>
            </div>
          ) : (
            <div className="p-1">
              {todos.map((todo, index) => (
                <div
                  key={todo.id}
                  draggable={editingId !== todo.id}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 ${
                    dragOverIndex === index
                      ? 'border-t border-blue-500'
                      : ''
                  } ${
                    dragIndex === index ? 'opacity-50' : ''
                  } hover:bg-neutral-700/50`}
                >
                  {/* Drag handle */}
                  <GripVertical
                    size={14}
                    className="shrink-0 cursor-grab text-neutral-600 group-hover:text-neutral-400"
                  />

                  {/* Content */}
                  {editingId === todo.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEdit();
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      onBlur={handleSaveEdit}
                      className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                      {todo.content}
                    </span>
                  )}

                  {/* Context menu button */}
                  {editingId !== todo.id && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() =>
                          setMenuOpenId(
                            menuOpenId === todo.id ? null : todo.id,
                          )
                        }
                        className="rounded p-0.5 text-neutral-600 opacity-0 hover:bg-neutral-600 hover:text-neutral-300 group-hover:opacity-100"
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {menuOpenId === todo.id && (
                        <div className="absolute right-0 top-6 z-10 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
                          <button
                            onClick={() => handleStartEdit(todo)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleConvertToTask(todo)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700"
                          >
                            <ArrowRight size={12} />
                            Convert to task
                          </button>
                          <button
                            onClick={() => handleDelete(todo.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-700"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 11: Register Overlay in Root Route

**Files:**
- Modify: `src/routes/__root.tsx` — add `ProjectBacklogContainer` and `Cmd+B` command

**Step 1: Add the container component**

Add a new container component following the existing pattern (like `CommandPaletteContainer`):

```tsx
import { BacklogOverlay } from '@/features/project/ui-backlog-overlay';

function ProjectBacklogContainer() {
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'project-backlog');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  // Get current projectId from route params
  const { projectId } = Route.useParams() ?? {};

  useCommands('project-backlog-trigger', [
    {
      shortcut: 'cmd+b',
      label: 'Open Backlog',
      section: 'Navigation',
      handler: () => {
        if (projectId) toggle('project-backlog');
      },
    },
  ]);

  if (!isOpen || !projectId) return null;
  return (
    <BacklogOverlay
      projectId={projectId}
      onClose={() => close('project-backlog')}
    />
  );
}
```

**Step 2: Add to RootLayout render**

Inside the `RootLayout` component, add `<ProjectBacklogContainer />` alongside the other overlay containers.

**Step 3: Handle route params access**

The root route may not have direct access to `projectId`. Check how other containers get route context. If needed, use `useMatch` or `useParams` from TanStack Router to get the `projectId` from nested routes. Alternatively, store the current `projectId` in a Zustand store (navigation store already tracks `lastLocation` which contains the projectId).

Better approach — use the navigation store:
```tsx
const lastLocation = useNavigationStore((s) => s.lastLocation);
const projectId = lastLocation?.type === 'project' ? lastLocation.projectId : undefined;
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 12: Sidebar Backlog Button

**Files:**
- Modify: `src/features/task/ui-task-list/index.tsx` — add backlog button in footer

**Step 1: Add backlog button alongside settings button**

In the footer area of the task list (the `div` with the Settings button), add a Backlog button:

```tsx
import { ClipboardList } from 'lucide-react';
import { useProjectTodoCount } from '@/hooks/use-project-todos';
import { useOverlaysStore } from '@/stores/overlays';
```

Add the button next to the existing Settings button:
```tsx
<div className="flex items-center gap-1 p-2">
  <button
    onClick={() => toggle('project-backlog')}
    className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
  >
    <ClipboardList size={14} />
    <span>Backlog</span>
    {count > 0 && (
      <span className="ml-auto rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
        {count}
      </span>
    )}
  </button>
  {/* existing settings button */}
</div>
```

Use `useProjectTodoCount(projectId)` to get the count for the badge. Get `projectId` from props or route context.

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 13: Convert-to-Task Integration

**Files:**
- Modify: `src/features/new-task/` — handle pre-fill from backlog conversion

**Step 1: Handle backlog todo deletion after task creation**

In the new task creation flow, after a task is successfully created, check if there's a `backlog-convert-todo-id` in `sessionStorage`. If so, delete the todo:

Find the task creation success handler (likely in the new task overlay or the `useCreateTask` call site). After task creation succeeds:

```tsx
import { useDeleteProjectTodo } from '@/hooks/use-project-todos';

// In the success handler:
const deleteTodo = useDeleteProjectTodo();

const handleTaskCreated = () => {
  const convertTodoId = sessionStorage.getItem('backlog-convert-todo-id');
  if (convertTodoId) {
    deleteTodo.mutate(convertTodoId);
    sessionStorage.removeItem('backlog-convert-todo-id');
  }
};
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit frontend**

```bash
git add src/hooks/use-project-todos.ts src/stores/overlays.ts src/features/project/ui-backlog-overlay/index.tsx src/routes/__root.tsx src/features/task/ui-task-list/index.tsx
git commit -m "feat(backlog): add backlog overlay UI with Cmd+B shortcut and sidebar button"
```

---

### Task 14: Lint and Type Check

**Step 1: Run linter with auto-fix**

Run: `pnpm lint --fix`
Expected: No errors (warnings OK)

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Fix any issues found**

Address lint or type errors from previous tasks.

**Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(backlog): address lint and type check issues"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Migration | `029_project_todos.ts` |
| 2 | Schema + migrator | `schema.ts`, `migrator.ts` |
| 3 | Repository | `project-todos.ts`, `repositories/index.ts` |
| 4 | Shared types | `shared/types.ts` |
| 5 | IPC handlers | `handlers.ts` |
| 6 | Preload bridge | `preload.ts` |
| 7 | API types | `api.ts` |
| 8 | React Query hooks | `use-project-todos.ts` |
| 9 | Overlay store | `overlays.ts` |
| 10 | Overlay component | `ui-backlog-overlay/index.tsx` |
| 11 | Root route registration | `__root.tsx` |
| 12 | Sidebar button | `ui-task-list/index.tsx` |
| 13 | Convert-to-task | new task creation flow |
| 14 | Lint + type check | all files |
