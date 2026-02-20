# Project Backlog — Design

## Problem

Users need a lightweight way to capture ideas and planned work for a project before spinning them up as full agent tasks. Currently, the only way to track work is to create a task, which immediately involves agent sessions, worktrees, and prompts. There's no place to jot down "I should do X later" at the project level.

## Solution

A per-project **backlog** — a simple list of freeform text items stored in the database. Items can be reordered via drag-and-drop and converted into tasks by pre-filling the new task form. The backlog is accessed via a command palette-style overlay triggered by `Cmd+B`.

## Data Model

New `project_todos` table:

| Column      | Type    | Notes                              |
|-------------|---------|------------------------------------|
| `id`        | text    | PK, UUID                          |
| `projectId` | text    | FK → projects, ON DELETE CASCADE   |
| `content`   | text    | Freeform description               |
| `sortOrder` | integer | For drag-and-drop reordering       |
| `createdAt` | text    | ISO timestamp                      |

Intentionally minimal — no status column (items are either in the list or deleted/converted), no title/description split.

### Repository

`electron/database/repositories/project-todo-repository.ts`

- `findByProjectId(projectId)` — returns todos ordered by `sortOrder`
- `create({ projectId, content })` — auto-assigns next `sortOrder`
- `update({ id, content })` — edit the text
- `delete(id)` — remove (used on delete or after convert-to-task)
- `reorder({ projectId, ids })` — bulk update `sortOrder` from an ordered array of IDs

## IPC Layer

New handlers in `electron/ipc/handlers.ts`:

| Method                    | Params                  | Returns         |
|---------------------------|-------------------------|-----------------|
| `project-todos:list`      | `{ projectId }`         | `ProjectTodo[]` |
| `project-todos:create`    | `{ projectId, content }`| `ProjectTodo`   |
| `project-todos:update`    | `{ id, content }`       | `ProjectTodo`   |
| `project-todos:delete`    | `{ id }`                | `void`          |
| `project-todos:reorder`   | `{ projectId, ids }`    | `void`          |

All typed in `src/lib/api.ts`, bridged in `electron/preload.ts`.

## React Query Hooks

New file: `src/hooks/use-project-todos.ts`

- `useProjectTodos(projectId)` — queries the list, keyed by `['project-todos', projectId]`
- `useCreateProjectTodo()` — mutation, invalidates the list
- `useUpdateProjectTodo()` — mutation, invalidates the list
- `useDeleteProjectTodo()` — mutation, invalidates the list
- `useReorderProjectTodos()` — mutation, optimistic update for smooth drag-and-drop

Follows the same pattern as `use-tasks.ts` and `use-projects.ts`.

## UI

### Backlog Overlay

**Component**: `src/features/project/ui-backlog-overlay/index.tsx`

**Trigger**: `Cmd+B` keybinding, command palette entry ("Open Backlog"), and a sidebar header button with count badge.

**Style**: Command palette style — centered floating panel, same visual treatment as the existing command palette (`Cmd+K`). Registered as overlay type `'backlog'` in the overlays store.

**Layout**:

```
+------------------------------------------+
| [Type a todo and press Enter...]         |
+------------------------------------------+
|  = Refactor auth service             ... |
|  = Add retry logic to API calls      ... |
|  = Update onboarding flow            ... |
|                                          |
|           (empty state:                  |
|     "No backlog items yet.               |
|   Type above to capture an idea.")       |
+------------------------------------------+
```

**Interactions**:

- **Top input**: Always focused on open. Type text + Enter to add a new todo. Input clears after adding, stays focused for rapid capture.
- **Items**: Each row shows a drag handle + content text. Hover reveals a `...` menu button.
- **Context menu** (`...`): Edit, Convert to task, Delete.
- **Edit**: Inline — the text becomes an editable input in place.
- **Convert to task**: Closes backlog overlay -> opens `new-task` overlay with content pre-filled as the prompt -> deletes todo on successful task creation.
- **Drag-and-drop**: Items reorderable via drag handles.
- **Dismiss**: Escape or click outside.
- **Scroll**: If the list grows long, the item area scrolls with a max height.

### Sidebar Entry Point

A small button in the sidebar header area (near the existing `SidebarContentTabs`):

- Notebook/list icon
- Count badge when there are backlog items (e.g., `3`)
- Clicking opens the backlog overlay (same as `Cmd+B`)

### Command Registration

Registered via `useCommands` in root route:

- **Label**: "Open Backlog"
- **Shortcut**: `Cmd+B`
- **Section**: Navigation
- **Handler**: Opens `'backlog'` overlay

Searchable in command palette (`Cmd+K`).

## State Changes

### Overlays Store

Add `'backlog'` to the overlay type union:

```ts
type OverlayType = 'new-task' | 'command-palette' | 'backlog';
```

### Navigation Store

No changes needed — overlay store handles open/close state.

## Convert-to-Task Flow

1. User clicks "Convert to task" from the context menu on a backlog item
2. Backlog overlay closes
3. `new-task` overlay opens
4. The todo's `content` is set into the new task draft store for the current project (pre-filling the prompt field)
5. User adjusts prompt, mode, worktree settings as desired
6. On successful task creation, the original todo is deleted

## Scope

- Backlog is **per-project**. Each project has its own independent backlog.
- On the "all tasks" route (`/all-tasks`), `Cmd+B` is disabled (no single project context).

## Error Handling

- Failed creates/updates show a brief inline error in the overlay.
- Optimistic reorder rolls back on failure.
- Convert-to-task only deletes the todo after the task is successfully created.

## Database Migration

New migration file: `electron/database/migrations/NNN_project_todos.ts`

```typescript
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('project_todos')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('projectId', 'text', (col) =>
      col.references('projects.id').onDelete('cascade').notNull()
    )
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_todos').execute();
}
```

## Files to Create/Modify

### New Files

- `electron/database/migrations/NNN_project_todos.ts` — migration
- `electron/database/repositories/project-todo-repository.ts` — data access
- `src/hooks/use-project-todos.ts` — React Query hooks
- `src/features/project/ui-backlog-overlay/index.tsx` — overlay component

### Modified Files

- `electron/database/schema.ts` — add `ProjectTodosTable` type
- `electron/database/migrator.ts` — register migration
- `electron/ipc/handlers.ts` — add 5 new handlers
- `electron/preload.ts` — expose new IPC methods
- `src/lib/api.ts` — add API types
- `shared/types.ts` — add `ProjectTodo` type
- `src/stores/overlays.ts` — add `'backlog'` overlay type
- `src/routes/__root.tsx` — register `Cmd+B` command
- `src/layout/ui-main-sidebar/index.tsx` or `src/features/task/ui-task-list/index.tsx` — add backlog button with count badge
