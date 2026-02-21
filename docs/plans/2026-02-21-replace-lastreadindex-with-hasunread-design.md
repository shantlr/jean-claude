# Replace lastReadIndex with hasUnread Boolean + Completion Border Animation

## Problem

The current `lastReadIndex` system tracks the exact message index a user has read per task. This involves:

- A `lastReadIndex` integer column on `tasks`
- A `messageCount` subquery on every task list fetch
- A `useEffect` in `TaskPanel` that fires on every message length change, comparing indices and calling `updateLastReadIndex`
- An unread count badge in the sidebar computed as `messageCount - 1 - lastReadIndex`

This is costly in re-renders (the `useEffect` depends on `agentState.messages.length`, which changes frequently during streaming) and provides more granularity than needed. We don't need to know *how many* messages are unread — just whether the user has seen the task since it completed.

## Design

### Approach: Boolean `hasUnread` column

Replace the index-based tracking with a single boolean `hasUnread` (default `false`) on the tasks table.

**Set `hasUnread = true`:** Server-side in `agent-service.ts` when a task transitions to `completed` status (not errored or interrupted). Only set if the task is not currently focused by the user.

**Clear `hasUnread = false`:** In the `tasks:focused` IPC handler when the user focuses a task panel while the window is focused. This reuses the existing `tasks:focused` event already fired by `TaskPanel` on mount and on window focus.

### Data Model Changes

**New migration** adds `hasUnread` column, removes `lastReadIndex`:

- Add `hasUnread INTEGER NOT NULL DEFAULT 0` (SQLite boolean)
- Remove `lastReadIndex` column (requires table recreation since SQLite doesn't support DROP COLUMN cleanly with our constraints)

**Remove `messageCount` subquery** from `findByProjectId()` and `findAllActive()` in the tasks repository.

**New repository method:** `setHasUnread(id, hasUnread)` — simple update.

**Remove:** `updateLastReadIndex()` repository method, IPC handler, preload bridge method, API type, and `useMarkTaskAsRead` hook.

**Update shared types:** Remove `lastReadIndex` from `Task`, `NewTask`, `UpdateTask`. Add `hasUnread: boolean` to `Task`. Remove `messageCount` from `TaskWithProject`.

### Agent Service Changes

In `agent-service.ts`, after finalizing a task as `completed` (line ~474):

```ts
const status = result.isError ? 'errored' : 'completed';
await TaskRepository.update(taskId, { status });

// Mark as unread if completed and not currently focused
if (status === 'completed') {
  const isFocused = this.mainWindow?.isFocused() && this.focusedTaskId === taskId;
  if (!isFocused) {
    await TaskRepository.setHasUnread(taskId, true);
  }
}
```

This requires tracking the currently focused task in the agent service. The `tasks:focused` event already fires — we just need to store the taskId.

### IPC Handler Changes

Expand `tasks:focused` handler:

```ts
ipcMain.on('tasks:focused', async (_, taskId: string) => {
  notificationService.closeForTask(taskId);
  agentService.setFocusedTask(taskId);
  await TaskRepository.setHasUnread(taskId, false);
});
```

### Renderer Removal

- **`ui-task-panel/index.tsx`**: Remove the `useEffect` (lines 190-210) that tracked `lastReadIndex` and called `markAsReadMutate`. Remove the `useMarkTaskAsRead` hook usage.
- **`ui-task-summary-card/index.tsx`**: Remove `getUnreadCount()` function and the blue pill badge.
- **`use-tasks.ts`**: Remove `useMarkTaskAsRead` mutation hook.

### Green-to-Gold Border Animation

Add `completed-unread-border` and `completed-unread-border-selected` CSS utilities in `index.css`, following the existing rotating conic-gradient pattern:

- **Gradient colors:** `green-500 -> amber-400 -> green-300 -> green-500`
- **Rotation speed:** 2s (celebratory, slightly slower)
- **Glow:** `green-500` at 35% (unselected) / 50% (selected)
- **Background:** `neutral-800` (unselected) / `neutral-700` (selected)

**Priority chain** in `ui-task-summary-card` className:

```
permission > question > running > completed-unread > plain selected/unselected
```

New condition inserted: `task.hasUnread && task.status === 'completed'`

## Files Affected

| File | Change |
|------|--------|
| `electron/database/migrations/NNN_replace_lastreadindex_with_hasunread.ts` | New migration |
| `electron/database/migrator.ts` | Register migration |
| `electron/database/schema.ts` | Replace `lastReadIndex` with `hasUnread` |
| `electron/database/repositories/tasks.ts` | Add `setHasUnread`, remove `updateLastReadIndex`, remove `messageCount` subquery |
| `electron/ipc/handlers.ts` | Update `tasks:focused`, remove `tasks:updateLastReadIndex` |
| `electron/preload.ts` | Remove `updateLastReadIndex`, add focused task tracking |
| `electron/services/agent-service.ts` | Set `hasUnread=true` on completion, track focused task |
| `shared/types.ts` | Replace `lastReadIndex` with `hasUnread` on Task types |
| `src/lib/api.ts` | Update types, remove `updateLastReadIndex` |
| `src/hooks/use-tasks.ts` | Remove `useMarkTaskAsRead` |
| `src/features/task/ui-task-panel/index.tsx` | Remove `useEffect` for lastReadIndex |
| `src/features/task/ui-task-summary-card/index.tsx` | Remove unread badge, add `completed-unread-border` class |
| `src/index.css` | Add `completed-unread-border` and `completed-unread-border-selected` utilities |
