# Run Command Log Persistence on Task Switch

## Problem

Run command logs are lost when switching between tasks. Two root causes:

1. **IPC listener scoped to task panel**: The `api.runCommands.onLog` subscription lives in `useRunCommands` hook, which is only mounted inside `RunButton` → `ui-task-panel`. When navigating to a different task, the component unmounts, the listener is removed, and new log lines from the still-running process are silently dropped.

2. **Aggressive cache eviction**: The `task-messages` Zustand store has a `DEFAULT_CACHE_LIMIT` of 10 inactive tasks. Even previously captured logs can be evicted when switching between many tasks.

## Approach

**Global listener + lazy task state + increased cache limit.**

### Change 1: Move `onLog` into `TaskMessageManager`

`TaskMessageManager` (`src/features/agent/task-message-manager/index.tsx`) is already a global component rendered in `__root.tsx` that listens for all agent events across all tasks. Add the `api.runCommands.onLog` subscription here so logs accumulate for every task regardless of focus.

Unlike agent events (which gate on `isLoaded(taskId)`), the log handler must **not** gate on `isLoaded` — logs need to accumulate even for tasks not yet loaded into the store.

### Change 2: Lazy init in `appendRunCommandLine`

Currently `appendRunCommandLine` in `task-messages.ts` bails with `if (!task) return state` when the task doesn't exist in the store. Change it to create a skeleton `TaskState` (with empty messages, `runCommandLogs` populated) so logs can accumulate for unfocused tasks.

### Change 3: Remove `onLog` from `useRunCommands`

The `onLog` subscription in `src/hooks/use-run-commands.ts` is no longer needed since `TaskMessageManager` handles it globally. Remove it. Keep `onStatusChange` in the hook since status display is only needed when the component is mounted.

### Change 4: Bump `DEFAULT_CACHE_LIMIT` to 25

In `task-messages.ts`, increase from 10 to 25 to reduce eviction frequency.

## Files Touched

| File | Change |
|---|---|
| `src/features/agent/task-message-manager/index.tsx` | Add `onLog` subscription |
| `src/stores/task-messages.ts` | Lazy init in `appendRunCommandLine`, bump cache to 25 |
| `src/hooks/use-run-commands.ts` | Remove `onLog` subscription |

## What Stays the Same

- `clearRunCommandLogs` / `clearAllRunCommandLogs` behavior
- `command-logs-pane` UI (reads from same store location)
- `RunButton` (still uses `useRunCommands` for status and start/stop)
- `MAX_RUN_COMMAND_LOG_LINES = 5000` cap per command
- Main process `run-command-service.ts` (no changes)
- Preload bridge (no changes)
