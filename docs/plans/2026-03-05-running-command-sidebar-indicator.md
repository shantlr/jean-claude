# Running Command Sidebar Indicator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show an animated terminal icon on sidebar task cards when a task has running commands.

**Architecture:** Add `runCommandRunning` state (keyed by taskId) to the existing `task-messages` Zustand store. Subscribe to the global `api.runCommands.onStatusChange` IPC channel in the `TaskMessageManager` component (same pattern as the existing `onLog` subscription). The `TaskSummaryCard` reads from the store and renders an animated `Terminal` icon.

**Tech Stack:** React, Zustand, Tailwind CSS, lucide-react

---

### Task 1: Add `runCommandRunning` state to the task-messages store

**Files:**
- Modify: `src/stores/task-messages.ts`

**Step 1: Add the state field and action to the store**

In the `TaskMessagesStore` interface, add:

```ts
/** Keyed by taskId — whether the task has any running commands */
runCommandRunning: Record<string, boolean>;
```

Add the action to the interface:

```ts
setRunCommandRunning: (taskId: string, isRunning: boolean) => void;
```

**Step 2: Implement the initial state and action**

In the `create<TaskMessagesStore>` call, add the initial state:

```ts
runCommandRunning: {},
```

And the action implementation:

```ts
setRunCommandRunning: (taskId, isRunning) => {
  set((state) => {
    if (!isRunning && !state.runCommandRunning[taskId]) {
      return state; // no-op if already falsy
    }
    if (isRunning && state.runCommandRunning[taskId]) {
      return state; // no-op if already true
    }
    if (!isRunning) {
      const { [taskId]: _removed, ...rest } = state.runCommandRunning;
      void _removed;
      return { runCommandRunning: rest };
    }
    return {
      runCommandRunning: { ...state.runCommandRunning, [taskId]: true },
    };
  });
},
```

**Step 3: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/stores/task-messages.ts
git commit -m "feat: add runCommandRunning state to task-messages store"
```

---

### Task 2: Subscribe to `onStatusChange` in `TaskMessageManager`

**Files:**
- Modify: `src/features/agent/task-message-manager/index.tsx`

**Step 1: Read `setRunCommandRunning` from the store**

Add alongside the existing `appendRunCommandLine` selector:

```ts
const setRunCommandRunning = useTaskMessagesStore(
  (s) => s.setRunCommandRunning,
);
```

**Step 2: Add a new `useEffect` for `onStatusChange`**

Place it after the existing `onLog` `useEffect` (around line 120):

```tsx
useEffect(() => {
  const unsub = api.runCommands.onStatusChange((taskId, status) => {
    setRunCommandRunning(taskId, status.isRunning);
  });

  return unsub;
}, [setRunCommandRunning]);
```

**Step 3: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/agent/task-message-manager/index.tsx
git commit -m "feat: subscribe to run command status changes globally"
```

---

### Task 3: Add pulsing green terminal animation CSS

**Files:**
- Modify: `src/index.css`

**Step 1: Add the keyframes and utility class**

Add after the existing `@keyframes jobs-pulse` block (around line 163):

```css
/* Pulsing green glow for running command indicator */
@keyframes command-running-pulse {
  0%, 100% {
    opacity: 1;
    filter: drop-shadow(0 0 2px rgba(34, 197, 94, 0.6));
  }
  50% {
    opacity: 0.7;
    filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.9));
  }
}

@utility animate-command-running {
  animation: command-running-pulse 2s ease-in-out infinite;
}
```

**Step 2: Run lint**

Run: `pnpm lint --fix`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add pulsing green animation for running command indicator"
```

---

### Task 4: Render animated Terminal icon in TaskSummaryCard

**Files:**
- Modify: `src/features/task/ui-task-summary-card/index.tsx`

**Step 1: Add imports and store selector**

Add `Terminal` to the lucide-react import:

```ts
import {
  AlertCircle,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Terminal,
} from 'lucide-react';
```

Add the store selector inside the component, after the existing `needsAttention` line:

```ts
const hasRunningCommand = useTaskMessagesStore(
  (s) => s.runCommandRunning[task.id] ?? false,
);
```

**Step 2: Render the icon in the top row**

Add the Terminal icon after the existing PR icon (after the `{task.pullRequestId && ...}` block, before the `<span>` with the display name):

```tsx
{hasRunningCommand && (
  <Terminal
    className="h-3.5 w-3.5 shrink-0 text-green-500 animate-command-running"
    title="Command running"
  />
)}
```

**Step 3: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/task/ui-task-summary-card/index.tsx
git commit -m "feat: show animated terminal icon when task has running commands"
```

---

### Task 5: Final verification

**Step 1: Run full lint and type check**

Run: `pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint`
Expected: All pass with no errors
