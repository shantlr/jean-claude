# Run Command Log Persistence on Task Switch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep run command logs accumulating in the background when the user switches away from a task, so logs are still there when they return.

**Architecture:** Move the `api.runCommands.onLog` IPC subscription from the per-task `useRunCommands` hook into the global `TaskMessageManager` component. Update `appendRunCommandLine` to lazily create a skeleton task state when the task isn't in the store. Bump the in-memory cache limit from 10 to 25.

**Tech Stack:** React, Zustand, Electron IPC

---

### Task 1: Update `appendRunCommandLine` to lazily init task state

**Files:**
- Modify: `src/stores/task-messages.ts:263-301` (the `appendRunCommandLine` action)
- Modify: `src/stores/task-messages.ts:85` (the `DEFAULT_CACHE_LIMIT` constant)

**Step 1: Change `DEFAULT_CACHE_LIMIT` from 10 to 25**

In `src/stores/task-messages.ts`, change line 85:

```ts
// Before:
const DEFAULT_CACHE_LIMIT = 10;

// After:
const DEFAULT_CACHE_LIMIT = 25;
```

**Step 2: Update `appendRunCommandLine` to create a skeleton task state when task doesn't exist**

In `src/stores/task-messages.ts`, replace the `appendRunCommandLine` action (lines 263-301). Instead of bailing when `!task`, create a minimal `TaskState`:

```ts
  appendRunCommandLine: (taskId, runCommandId, stream, line) => {
    set((state) => {
      const task = state.tasks[taskId] ?? {
        messages: [],
        status: 'completed' as TaskStatus,
        error: null,
        pendingPermission: null,
        pendingQuestion: null,
        queuedPrompts: [],
        runCommandLogs: {},
        lastAccessedAt: Date.now(),
      };

      const existingLog = task.runCommandLogs[runCommandId] ?? {
        lines: [],
        updatedAt: Date.now(),
      };
      const nextLines = [
        ...existingLog.lines,
        {
          stream,
          line,
          timestamp: Date.now(),
        },
      ];
      const cappedLines =
        nextLines.length > MAX_RUN_COMMAND_LOG_LINES
          ? nextLines.slice(-MAX_RUN_COMMAND_LOG_LINES)
          : nextLines;

      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            runCommandLogs: {
              ...task.runCommandLogs,
              [runCommandId]: {
                lines: cappedLines,
                updatedAt: Date.now(),
              },
            },
          },
        },
      };
    });
  },
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 2: Add `onLog` subscription to `TaskMessageManager`

**Files:**
- Modify: `src/features/agent/task-message-manager/index.tsx`

**Step 1: Add `appendRunCommandLine` selector and `onLog` subscription**

In `src/features/agent/task-message-manager/index.tsx`:

1. Add the store selector alongside the existing ones (after line 35):

```ts
  const appendRunCommandLine = useTaskMessagesStore(
    (s) => s.appendRunCommandLine,
  );
```

2. Add a second `useEffect` for the run command log subscription (after the existing `useEffect` block, before the `return null`):

```ts
  useEffect(() => {
    const unsub = api.runCommands.onLog(
      (taskId, runCommandId, stream, line) => {
        appendRunCommandLine(taskId, runCommandId, stream, line);
      },
    );

    return unsub;
  }, [appendRunCommandLine]);
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

---

### Task 3: Remove `onLog` subscription from `useRunCommands`

**Files:**
- Modify: `src/hooks/use-run-commands.ts:30-64`

**Step 1: Remove `appendRunCommandLine` selector**

Delete lines 30-32:

```ts
  const appendRunCommandLine = useTaskMessagesStore(
    (state) => state.appendRunCommandLine,
  );
```

**Step 2: Remove the `onLog` subscription from the `useEffect`**

Replace the `useEffect` block (lines 41-64) to only subscribe to `onStatusChange`:

```ts
  useEffect(() => {
    const unsubscribeStatus = api.runCommands.onStatusChange(
      (changedTaskId, newStatus) => {
        if (changedTaskId === taskId) {
          setStatus(newStatus);
        }
      },
    );

    return () => {
      unsubscribeStatus();
    };
  }, [taskId]);
```

Note: the dependency array no longer needs `appendRunCommandLine`.

**Step 3: Clean up unused import**

The `useTaskMessagesStore` import may still be needed for `clearRunCommandLogs`. Verify and remove only if no longer used. It IS still used for `clearRunCommandLogs` on line 33-35, so keep it.

**Step 4: Verify TypeScript compiles and lint passes**

Run: `pnpm ts-check && pnpm lint --fix && pnpm lint`
Expected: No errors

---

### Task 4: Manual verification

**Step 1: Verify the data flow works end-to-end**

1. Open the app (`pnpm dev`)
2. Create a task with a run command configured
3. Start the run command — verify logs appear
4. Switch to a different task — the command keeps running in the background
5. Switch back to the original task — verify logs accumulated while you were away
6. Verify starting/stopping commands still works normally
