# Task Message Store Design

## Overview

Rework how task messages are stored on the frontend to enable:
1. **Unread badges** on task list items
2. **Fast task switching** — messages stay in memory, no re-fetch on every view
3. **Global message listening** — receive messages from any running task, not just the focused one

## Current State

Messages are managed in local React state within `useAgentStream` hook. This means:
- Messages are lost when navigating away from a task
- Must re-fetch from DB every time task page mounts
- No way to show unread counts without loading the full task

## Design

### Zustand Store

A global Zustand store holds task state for all loaded tasks:

```typescript
// src/stores/task-messages.ts

interface TaskState {
  messages: AgentMessage[];
  status: TaskStatus;
  error: string | null;
  pendingPermission: AgentPermissionEvent | null;
  pendingQuestion: AgentQuestionEvent | null;
  lastAccessedAt: number; // for LRU eviction
}

interface TaskMessagesStore {
  // State
  tasks: Record<string, TaskState>;
  cacheLimit: number; // default 10, configurable later

  // Actions
  loadTask: (taskId: string, messages: AgentMessage[], status: TaskStatus) => void;
  appendMessage: (taskId: string, message: AgentMessage) => void;
  setStatus: (taskId: string, status: TaskStatus, error?: string) => void;
  setPermission: (taskId: string, permission: AgentPermissionEvent | null) => void;
  setQuestion: (taskId: string, question: AgentQuestionEvent | null) => void;
  touchTask: (taskId: string) => void;
  unloadTask: (taskId: string) => void;

  // Derived
  isLoaded: (taskId: string) => boolean;
  getRunningTaskIds: () => string[];
}
```

### LRU Cache Eviction

- **Running tasks are never evicted** — determined by `status === 'running'`
- **Inactive tasks follow LRU** — evict oldest by `lastAccessedAt` when exceeding `cacheLimit`
- **Default cache limit: 10** — will be configurable in settings later

Eviction happens in `loadTask` action:
1. Check count of inactive (non-running) loaded tasks
2. If exceeding limit, sort by `lastAccessedAt` ascending
3. Evict oldest until under limit

### Global Message Subscription

A `TaskMessageManager` component mounts at app root and subscribes to all IPC events:

```tsx
// src/features/agent/task-message-manager/index.tsx

export function TaskMessageManager() {
  const { appendMessage, setStatus, setPermission, setQuestion, isLoaded } = useTaskMessagesStore();

  useEffect(() => {
    const unsubs = [
      api.agent.onMessage(({ taskId, message }) => {
        if (isLoaded(taskId)) {
          appendMessage(taskId, message);
        }
      }),
      api.agent.onStatus(({ taskId, status, error }) => {
        if (isLoaded(taskId)) {
          setStatus(taskId, status, error);
        }
      }),
      api.agent.onPermission((event) => {
        if (isLoaded(event.taskId)) {
          setPermission(event.taskId, event);
        }
      }),
      api.agent.onQuestion((event) => {
        if (isLoaded(event.taskId)) {
          setQuestion(event.taskId, event);
        }
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  return null;
}
```

Mount in root layout alongside providers.

### Unread Tracking

#### Database: `lastReadIndex` Column

Add to `tasks` table:
- Column: `lastReadIndex INTEGER DEFAULT -1`
- `-1` means no messages have been read (all are unread)

Repository additions:
- `updateLastReadIndex(taskId: string, index: number)` — called when user views a task
- `findByProjectId` modified to include `messageCount` via subquery

#### Calculating Unread Count

```typescript
const unreadCount = Math.max(0, (messageCount - 1) - lastReadIndex);
```

- For task list: use `task.messageCount` from DB query
- For loaded tasks: can use live `messages.length` from store

#### When to Mark as Read

When task page mounts or receives focus, call:
```typescript
api.tasks.updateLastReadIndex(taskId, messages.length - 1);
```

### Hook: `useTaskMessages`

Replaces message management in `useAgentStream`:

```typescript
// src/hooks/use-task-messages.ts

export function useTaskMessages(taskId: string) {
  const taskState = useTaskMessagesStore((s) => s.tasks[taskId]);
  const isLoaded = !!taskState;
  const loadTask = useTaskMessagesStore((s) => s.loadTask);
  const touchTask = useTaskMessagesStore((s) => s.touchTask);

  useEffect(() => {
    if (!isLoaded) {
      // Fetch from DB and load into store
      Promise.all([
        api.agent.getMessages(taskId),
        api.tasks.get(taskId),
      ]).then(([messages, task]) => {
        loadTask(taskId, messages, task.status);
      });
    } else {
      touchTask(taskId);
    }
  }, [taskId, isLoaded]);

  return {
    messages: taskState?.messages ?? [],
    status: taskState?.status ?? 'waiting',
    error: taskState?.error ?? null,
    pendingPermission: taskState?.pendingPermission ?? null,
    pendingQuestion: taskState?.pendingQuestion ?? null,
    isLoading: !isLoaded,
  };
}
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/stores/task-messages.ts` | Zustand store for task state |
| `src/features/agent/task-message-manager/index.tsx` | Global IPC listener component |
| `src/hooks/use-task-messages.ts` | Hook to access/load task from store |
| `electron/database/migrations/005_task_last_read_index.ts` | Migration for `lastReadIndex` |

### Modified Files

| File | Changes |
|------|---------|
| `electron/database/schema.ts` | Add `lastReadIndex` to `TaskTable` |
| `electron/database/repositories/tasks.ts` | Add `messageCount` subquery, `updateLastReadIndex` method |
| `electron/ipc/handlers.ts` | Add handler for `tasks:updateLastReadIndex` |
| `electron/preload.ts` | Expose `updateLastReadIndex` |
| `src/lib/api.ts` | Add type for `updateLastReadIndex` |
| `src/hooks/use-agent.ts` | Refactor to use store, remove local message state |
| `src/routes/projects/$projectId/tasks/$taskId.tsx` | Use new hooks, mark as read on mount |
| `src/routes/__root.tsx` | Mount `TaskMessageManager` |
| Task list component | Display unread badge |

## Data Flow

```
Agent SDK → AgentService.emitMessage()
    ↓
Persist to SQLite
    ↓
IPC event to renderer
    ↓
TaskMessageManager receives event
    ↓
If task loaded in store → update store
    ↓
React components re-render via Zustand selectors
```

## Unread Badge Flow

```
Task list mounts
    ↓
useTasks() fetches tasks with messageCount
    ↓
For each task: unread = (messageCount - 1) - lastReadIndex
    ↓
Render badge if unread > 0
```

## Mark as Read Flow

```
Task page mounts
    ↓
useTaskMessages() loads task into store
    ↓
Call api.tasks.updateLastReadIndex(taskId, messages.length - 1)
    ↓
Invalidate task list query (updates badge)
```
