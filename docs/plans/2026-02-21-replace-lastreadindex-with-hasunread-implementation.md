# Replace lastReadIndex with hasUnread Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the costly `lastReadIndex` integer tracking with a simple `hasUnread` boolean, remove unread count badges, and add a green-to-gold animated border for completed-but-unread tasks.

**Architecture:** Database migration replaces `lastReadIndex` column with `hasUnread` boolean. Server-side agent-service sets `hasUnread=true` on task completion. The existing `tasks:focused` IPC event clears it. Renderer removes the expensive `useEffect` and unread count badge, replacing it with a CSS border animation.

**Tech Stack:** SQLite (via Kysely), Electron IPC, React, Tailwind CSS (with `@utility` directives and `@property` for CSS animations)

---

### Task 1: Database Migration — Replace lastReadIndex with hasUnread

**Files:**
- Create: `electron/database/migrations/030_replace_lastreadindex_with_hasunread.ts`
- Modify: `electron/database/migrator.ts`

**Step 1: Write the migration file**

Create `electron/database/migrations/030_replace_lastreadindex_with_hasunread.ts`:

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Simple column add/drop — no table recreation needed
  // SQLite 3.35+ supports DROP COLUMN
  await db.schema
    .alterTable('tasks')
    .addColumn('hasUnread', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema.alterTable('tasks').dropColumn('lastReadIndex').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('lastReadIndex', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema.alterTable('tasks').dropColumn('hasUnread').execute();
}
```

Note: SQLite 3.35.0+ (bundled with Electron's better-sqlite3) supports `ALTER TABLE ... DROP COLUMN`, so no table recreation is needed. The column has no constraints that would prevent dropping.

**Step 2: Register the migration in migrator.ts**

In `electron/database/migrator.ts`, add:

```typescript
import * as m030 from './migrations/030_replace_lastreadindex_with_hasunread';
```

And in the `migrations` record:

```typescript
'030_replace_lastreadindex_with_hasunread': m030,
```

**Step 3: Commit**

```bash
git add electron/database/migrations/030_replace_lastreadindex_with_hasunread.ts electron/database/migrator.ts
git commit -m "feat: add migration to replace lastReadIndex with hasUnread"
```

---

### Task 2: Update Schema and Shared Types

**Files:**
- Modify: `electron/database/schema.ts:99` — replace `lastReadIndex: number` with `hasUnread: number`
- Modify: `shared/types.ts:145-222` — update Task, NewTask, UpdateTask interfaces

**Step 1: Update database schema**

In `electron/database/schema.ts`, line 99, change:

```typescript
// OLD
lastReadIndex: number;

// NEW
hasUnread: number; // SQLite boolean: 0 = read, 1 = unread
```

**Step 2: Update shared types**

In `shared/types.ts`:

- `Task` interface (line 157): replace `lastReadIndex: number` with `hasUnread: boolean`
- `NewTask` interface (line 184): remove `lastReadIndex?: number`, add `hasUnread?: boolean`
- `UpdateTask` interface (line 210): remove `lastReadIndex?: number`, add `hasUnread?: boolean`

**Step 3: Commit**

```bash
git add electron/database/schema.ts shared/types.ts
git commit -m "feat: update schema and shared types — lastReadIndex → hasUnread"
```

---

### Task 3: Update Tasks Repository

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Update toTask to convert hasUnread**

In the `toTask` function (line 67), add `hasUnread` to the destructured fields and convert `0/1 → boolean`, similar to `userCompleted`:

- Add `'hasUnread'` to the `Omit` type parameter
- Add `hasUnread: boolean` to the return type
- Destructure `hasUnread` from `row`
- Add `hasUnread: Boolean(hasUnread)` to the return object

Do the same for `toTaskOrUndefined`.

**Step 2: Update toDbValues and toDbUpdateValues**

In `toDbValues` (line 137) and `toDbUpdateValues` (line 164):

- Destructure `hasUnread` alongside `userCompleted`
- Convert boolean to 0/1: `...(hasUnread !== undefined && { hasUnread: hasUnread ? 1 : 0 })`

Also remove `lastReadIndex` from the `CreateTaskInput` and `UpdateTaskInput` interfaces, and add `hasUnread?: boolean`.

**Step 3: Remove updateLastReadIndex method, add setHasUnread**

Remove the `updateLastReadIndex` method (lines 336-344).

Add a new method:

```typescript
setHasUnread: async (id: string, hasUnread: boolean) => {
  await db
    .updateTable('tasks')
    .set({ hasUnread: hasUnread ? 1 : 0, updatedAt: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
},
```

**Step 4: Remove messageCount subqueries**

Remove the `.select((eb) => eb.selectFrom('agent_messages')...as('messageCount'))` from:
- `findByProjectId` (lines 199-205)
- `findAllActive` (lines 222-228)
- `findAllCompleted` (lines 250-256)
- `reorder` (lines 429-434)

**Step 5: Commit**

```bash
git add electron/database/repositories/tasks.ts
git commit -m "feat: update tasks repo — remove lastReadIndex/messageCount, add setHasUnread"
```

---

### Task 4: Update Agent Service — Track Focused Task and Set hasUnread on Completion

**Files:**
- Modify: `electron/services/agent-service.ts`

**Step 1: Add focusedTaskId property**

Add a private property to the `AgentService` class (near `mainWindow`):

```typescript
private focusedTaskId: string | null = null;
```

Add a public method:

```typescript
setFocusedTask(taskId: string | null): void {
  this.focusedTaskId = taskId;
}
```

**Step 2: Set hasUnread on task completion**

In the `runBackend` method, after the finalization at line ~475 (`await TaskRepository.update(taskId, { status })`), add:

```typescript
// Mark as unread if completed and user isn't viewing this task
if (status === 'completed') {
  const isFocused =
    this.mainWindow?.isFocused() && this.focusedTaskId === taskId;
  if (!isFocused) {
    await TaskRepository.setHasUnread(taskId, true);
  }
}
```

**Step 3: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat: agent service tracks focused task, sets hasUnread on completion"
```

---

### Task 5: Update IPC Layer — Handlers, Preload, API Types

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Update tasks:focused handler**

In `electron/ipc/handlers.ts`, expand the `tasks:focused` handler (line 139):

```typescript
ipcMain.on('tasks:focused', (_, taskId: string) => {
  notificationService.closeForTask(taskId);
  agentService.setFocusedTask(taskId);
  TaskRepository.setHasUnread(taskId, false);
});
```

**Step 2: Remove tasks:updateLastReadIndex handler**

Remove lines 367-371:

```typescript
ipcMain.handle(
  'tasks:updateLastReadIndex',
  (_, id: string, lastReadIndex: number) =>
    TaskRepository.updateLastReadIndex(id, lastReadIndex),
);
```

**Step 3: Remove updateLastReadIndex from preload.ts**

Remove lines 55-56:

```typescript
updateLastReadIndex: (id: string, lastReadIndex: number) =>
  ipcRenderer.invoke('tasks:updateLastReadIndex', id, lastReadIndex),
```

**Step 4: Update src/lib/api.ts**

- In `TaskWithProject` interface (line 218): remove `lastReadIndex: number` (line 231), remove `messageCount?: number` (line 242), add `hasUnread: boolean`
- In `Api.tasks` interface: remove `updateLastReadIndex` method (line 306)
- In the fallback API mock object: remove the `updateLastReadIndex` stub (lines 705-707)

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: update IPC layer — remove updateLastReadIndex, expand tasks:focused"
```

---

### Task 6: Remove Renderer-Side Unread Tracking

**Files:**
- Modify: `src/hooks/use-tasks.ts` — remove `useMarkTaskAsRead`
- Modify: `src/features/task/ui-task-panel/index.tsx` — remove lastReadIndex useEffect
- Modify: `src/features/task/ui-task-summary-card/index.tsx` — remove getUnreadCount and badge

**Step 1: Remove useMarkTaskAsRead hook**

In `src/hooks/use-tasks.ts`, delete the entire `useMarkTaskAsRead` function (lines 169-187).

**Step 2: Remove useEffect in TaskPanel**

In `src/features/task/ui-task-panel/index.tsx`:

- Remove the import of `useMarkTaskAsRead`
- Remove `const markAsRead = useMarkTaskAsRead();` (line 91)
- Remove the entire useEffect block (lines 190-210):

```typescript
// DELETE THIS ENTIRE BLOCK:
const markAsReadMutate = markAsRead.mutate;
const taskStatus = task?.status;
const lastReadIndex = task?.lastReadIndex ?? -1;
useEffect(() => {
  if (
    taskStatus !== 'running' &&
    lastReadIndex < agentState.messages.length - 1
  ) {
    markAsReadMutate({
      id: taskId,
      lastReadIndex: agentState.messages.length - 1,
    });
  }
}, [
  taskId,
  taskStatus,
  agentState.messages.length,
  markAsReadMutate,
  lastReadIndex,
]);
```

**Step 3: Remove unread count from TaskSummaryCard**

In `src/features/task/ui-task-summary-card/index.tsx`:

- Delete the entire `getUnreadCount` function (lines 15-24)
- Remove `const unreadCount = getUnreadCount(task);` (line 38)
- Remove the unread count badge from the JSX (lines 122-126):

```tsx
// DELETE:
) : unreadCount > 0 ? (
  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium">
    {unreadCount > 99 ? '99+' : unreadCount}
  </span>
```

Keep the `needsAttention` AlertCircle — just close the ternary with `: null}`.

**Step 4: Commit**

```bash
git add src/hooks/use-tasks.ts src/features/task/ui-task-panel/index.tsx src/features/task/ui-task-summary-card/index.tsx
git commit -m "feat: remove renderer-side lastReadIndex tracking and unread count badge"
```

---

### Task 7: Add Green-to-Gold Border Animation

**Files:**
- Modify: `src/index.css`
- Modify: `src/features/task/ui-task-summary-card/index.tsx`

**Step 1: Add CSS utilities**

In `src/index.css`, after the `question-border-selected` utility (after line 265), add:

```css
/* Animated gradient border for completed-but-unread tasks (green-to-gold) */
@utility completed-unread-border {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(var(--color-neutral-800), var(--color-neutral-800))
      padding-box,
    conic-gradient(
        from var(--gradient-angle),
        var(--color-green-500),
        var(--color-amber-400),
        var(--color-green-300),
        var(--color-green-500)
      )
      border-box;
  border: 1px solid transparent;
  animation: gradient-rotate 2s linear infinite;
  box-shadow: 0 0 6px 0px
    color-mix(in srgb, var(--color-green-500) 35%, transparent);
}

@utility completed-unread-border-selected {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(var(--color-neutral-700), var(--color-neutral-700))
      padding-box,
    conic-gradient(
        from var(--gradient-angle),
        var(--color-green-500),
        var(--color-amber-400),
        var(--color-green-300),
        var(--color-green-500)
      )
      border-box;
  border: 1px solid transparent;
  animation: gradient-rotate 2s linear infinite;
  box-shadow: 0 0 6px 0px
    color-mix(in srgb, var(--color-green-500) 50%, transparent);
}
```

**Step 2: Apply animation in TaskSummaryCard**

In `src/features/task/ui-task-summary-card/index.tsx`, update the className logic (lines 86-103).

The new priority chain is: permission > question > running > **completed-unread** > plain.

Insert a new condition between running and the default:

```tsx
className={clsx(
  'flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 transition-colors',
  hasPendingPermission
    ? isSelected
      ? 'permission-border-selected'
      : 'permission-border'
    : hasPendingQuestion
      ? isSelected
        ? 'question-border-selected'
        : 'question-border'
      : task.status === 'running'
        ? isSelected
          ? 'running-border-selected'
          : 'running-border'
        : task.hasUnread
          ? isSelected
            ? 'completed-unread-border-selected'
            : 'completed-unread-border'
          : isSelected
            ? 'border border-blue-500 bg-neutral-700'
            : 'border border-transparent hover:bg-neutral-800',
)}
```

Note: `task.hasUnread` needs to be available on `TaskWithProject`. Since we added it in Task 5, it should already be there. The `task` prop is typed as `TaskWithProject` which extends from the query results.

**Step 3: Commit**

```bash
git add src/index.css src/features/task/ui-task-summary-card/index.tsx
git commit -m "feat: add green-to-gold animated border for completed unread tasks"
```

---

### Task 8: Lint and Type-Check

**Step 1: Run lint with auto-fix**

```bash
pnpm lint --fix
```

Fix any remaining lint issues.

**Step 2: Run type-check**

```bash
pnpm ts-check
```

Fix any type errors. Common things to watch for:
- References to `lastReadIndex` anywhere in the codebase
- References to `messageCount` on task objects
- References to `updateLastReadIndex` in API types
- The `toTask` function return type needs `hasUnread: boolean` added

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint and type-check issues"
```
