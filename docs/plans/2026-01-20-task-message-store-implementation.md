# Task Message Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a Zustand store for task messages with LRU caching, global IPC subscription, and database-backed unread tracking.

**Architecture:** Frontend Zustand store holds loaded task state (messages, status, permissions). A root-level component subscribes to all agent IPC events globally. Unread counts derived from `lastReadIndex` column in DB combined with `messageCount` subquery.

**Tech Stack:** Zustand, Kysely (SQLite), React, Electron IPC

---

## Task 1: Add `lastReadIndex` Migration

**Files:**
- Create: `electron/database/migrations/005_task_last_read_index.ts`
- Modify: `electron/database/migrator.ts:6-13`
- Modify: `electron/database/schema.ts:55-67`

**Step 1: Create migration file**

```typescript
// electron/database/migrations/005_task_last_read_index.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('lastReadIndex', 'integer', (col) => col.defaultTo(-1).notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('lastReadIndex').execute();
}
```

**Step 2: Register migration in migrator**

In `electron/database/migrator.ts`, add import and registration:

```typescript
import * as m005 from './migrations/005_task_last_read_index';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
  '003_task_read_at': m003,
  '004_agent_messages': m004,
  '005_task_last_read_index': m005,
};
```

**Step 3: Update schema types**

In `electron/database/schema.ts`, add to `TaskTable`:

```typescript
export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  prompt: string;
  status: TaskStatus;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  readAt: string | null;
  lastReadIndex: number;  // Add this line
  createdAt: Generated<string>;
  updatedAt: string;
}
```

**Step 4: Update shared types**

In `shared/types.ts`, add `lastReadIndex` to `Task`, `NewTask`, and `UpdateTask`:

```typescript
export interface Task {
  // ... existing fields
  lastReadIndex: number;
}

export interface NewTask {
  // ... existing fields
  lastReadIndex?: number;
}

export interface UpdateTask {
  // ... existing fields
  lastReadIndex?: number;
}
```

**Step 5: Commit**

```bash
git add electron/database/migrations/005_task_last_read_index.ts electron/database/migrator.ts electron/database/schema.ts shared/types.ts
git commit -m "feat(db): add lastReadIndex column to tasks table"
```

---

## Task 2: Update Task Repository with `messageCount` and `updateLastReadIndex`

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Add `messageCount` subquery to `findByProjectId`**

Replace the existing `findByProjectId` method:

```typescript
findByProjectId: (projectId: string) =>
  db
    .selectFrom('tasks')
    .selectAll('tasks')
    .select((eb) =>
      eb
        .selectFrom('agent_messages')
        .whereRef('agent_messages.taskId', '=', 'tasks.id')
        .select((eb2) => eb2.fn.countAll<number>().as('count'))
        .as('messageCount')
    )
    .where('projectId', '=', projectId)
    .orderBy('createdAt', 'desc')
    .execute(),
```

**Step 2: Add `updateLastReadIndex` method**

Add new method to `TaskRepository`:

```typescript
updateLastReadIndex: (id: string, lastReadIndex: number) =>
  db
    .updateTable('tasks')
    .set({ lastReadIndex, updatedAt: new Date().toISOString() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow(),
```

**Step 3: Commit**

```bash
git add electron/database/repositories/tasks.ts
git commit -m "feat(repo): add messageCount subquery and updateLastReadIndex method"
```

---

## Task 3: Expose `updateLastReadIndex` via IPC

**Files:**
- Modify: `electron/ipc/handlers.ts:56-59`
- Modify: `electron/preload.ts:23-25`
- Modify: `src/lib/api.ts:38-46,98-106`

**Step 1: Add IPC handler**

In `electron/ipc/handlers.ts`, add after `tasks:markAsRead` handler:

```typescript
ipcMain.handle('tasks:updateLastReadIndex', (_, id: string, lastReadIndex: number) =>
  TaskRepository.updateLastReadIndex(id, lastReadIndex),
);
```

**Step 2: Expose in preload**

In `electron/preload.ts`, add to `tasks` object:

```typescript
updateLastReadIndex: (id: string, lastReadIndex: number) =>
  ipcRenderer.invoke('tasks:updateLastReadIndex', id, lastReadIndex),
```

**Step 3: Add type to API interface**

In `src/lib/api.ts`, add to `Api.tasks`:

```typescript
updateLastReadIndex: (id: string, lastReadIndex: number) => Promise<Task>;
```

**Step 4: Add stub to fallback API**

In `src/lib/api.ts`, add to fallback `tasks` object:

```typescript
updateLastReadIndex: async () => { throw new Error('API not available'); },
```

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat(ipc): expose updateLastReadIndex endpoint"
```

---

## Task 4: Create Zustand Task Messages Store

**Files:**
- Create: `src/stores/task-messages.ts`

**Step 1: Create the store**

```typescript
// src/stores/task-messages.ts
import { create } from 'zustand';

import type {
  AgentMessage,
  AgentPermissionEvent,
  AgentQuestionEvent,
} from '../../shared/agent-types';
import type { TaskStatus } from '../../shared/types';

export interface TaskState {
  messages: AgentMessage[];
  status: TaskStatus;
  error: string | null;
  pendingPermission: AgentPermissionEvent | null;
  pendingQuestion: AgentQuestionEvent | null;
  lastAccessedAt: number;
}

interface TaskMessagesStore {
  tasks: Record<string, TaskState>;
  cacheLimit: number;

  // Actions
  loadTask: (taskId: string, messages: AgentMessage[], status: TaskStatus) => void;
  appendMessage: (taskId: string, message: AgentMessage) => void;
  setStatus: (taskId: string, status: TaskStatus, error?: string | null) => void;
  setPermission: (taskId: string, permission: AgentPermissionEvent | null) => void;
  setQuestion: (taskId: string, question: AgentQuestionEvent | null) => void;
  touchTask: (taskId: string) => void;
  unloadTask: (taskId: string) => void;

  // Selectors
  isLoaded: (taskId: string) => boolean;
  getRunningTaskIds: () => string[];
}

const DEFAULT_CACHE_LIMIT = 10;

function evictIfNeeded(
  tasks: Record<string, TaskState>,
  cacheLimit: number
): Record<string, TaskState> {
  const entries = Object.entries(tasks);
  const inactiveTasks = entries.filter(([, state]) => state.status !== 'running');

  if (inactiveTasks.length <= cacheLimit) {
    return tasks;
  }

  // Sort by lastAccessedAt ascending (oldest first)
  inactiveTasks.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  const toEvict = inactiveTasks.length - cacheLimit;
  const idsToEvict = new Set(inactiveTasks.slice(0, toEvict).map(([id]) => id));

  const newTasks: Record<string, TaskState> = {};
  for (const [id, state] of entries) {
    if (!idsToEvict.has(id)) {
      newTasks[id] = state;
    }
  }

  return newTasks;
}

export const useTaskMessagesStore = create<TaskMessagesStore>((set, get) => ({
  tasks: {},
  cacheLimit: DEFAULT_CACHE_LIMIT,

  loadTask: (taskId, messages, status) => {
    set((state) => {
      const newTasks = {
        ...state.tasks,
        [taskId]: {
          messages,
          status,
          error: null,
          pendingPermission: null,
          pendingQuestion: null,
          lastAccessedAt: Date.now(),
        },
      };
      return { tasks: evictIfNeeded(newTasks, state.cacheLimit) };
    });
  },

  appendMessage: (taskId, message) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            messages: [...task.messages, message],
          },
        },
      };
    });
  },

  setStatus: (taskId, status, error = null) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status,
            error,
          },
        },
      };
    });
  },

  setPermission: (taskId, permission) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            pendingPermission: permission,
          },
        },
      };
    });
  },

  setQuestion: (taskId, question) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            pendingQuestion: question,
          },
        },
      };
    });
  },

  touchTask: (taskId) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            lastAccessedAt: Date.now(),
          },
        },
      };
    });
  },

  unloadTask: (taskId) => {
    set((state) => {
      const { [taskId]: _, ...rest } = state.tasks;
      return { tasks: rest };
    });
  },

  isLoaded: (taskId) => !!get().tasks[taskId],

  getRunningTaskIds: () =>
    Object.entries(get().tasks)
      .filter(([, state]) => state.status === 'running')
      .map(([id]) => id),
}));
```

**Step 2: Commit**

```bash
git add src/stores/task-messages.ts
git commit -m "feat(store): create Zustand task messages store with LRU eviction"
```

---

## Task 5: Create Global Task Message Manager Component

**Files:**
- Create: `src/features/agent/task-message-manager/index.tsx`

**Step 1: Create the component**

```typescript
// src/features/agent/task-message-manager/index.tsx
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';

export function TaskMessageManager() {
  const appendMessage = useTaskMessagesStore((s) => s.appendMessage);
  const setStatus = useTaskMessagesStore((s) => s.setStatus);
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const isLoaded = useTaskMessagesStore((s) => s.isLoaded);

  useEffect(() => {
    const unsubMessage = api.agent.onMessage(({ taskId, message }) => {
      if (isLoaded(taskId)) {
        appendMessage(taskId, message);
      }
    });

    const unsubStatus = api.agent.onStatus(({ taskId, status, error }) => {
      if (isLoaded(taskId)) {
        setStatus(taskId, status, error);
      }
    });

    const unsubPermission = api.agent.onPermission((event) => {
      if (isLoaded(event.taskId)) {
        setPermission(event.taskId, event);
      }
    });

    const unsubQuestion = api.agent.onQuestion((event) => {
      if (isLoaded(event.taskId)) {
        setQuestion(event.taskId, event);
      }
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubPermission();
      unsubQuestion();
    };
  }, [appendMessage, setStatus, setPermission, setQuestion, isLoaded]);

  return null;
}
```

**Step 2: Commit**

```bash
git add src/features/agent/task-message-manager/index.tsx
git commit -m "feat(agent): create TaskMessageManager for global IPC subscription"
```

---

## Task 6: Mount TaskMessageManager in Root Layout

**Files:**
- Modify: `src/routes/__root.tsx`

**Step 1: Import and render TaskMessageManager**

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router';

import { TaskMessageManager } from '@/features/agent/task-message-manager';
import { Header } from '@/layout/ui-header';
import { MainSidebar } from '@/layout/ui-main-sidebar';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <TaskMessageManager />
      <MainSidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(layout): mount TaskMessageManager in root layout"
```

---

## Task 7: Create `useTaskMessages` Hook

**Files:**
- Create: `src/hooks/use-task-messages.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/use-task-messages.ts
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore, TaskState } from '@/stores/task-messages';

export function useTaskMessages(taskId: string) {
  const taskState = useTaskMessagesStore((s) => s.tasks[taskId]);
  const loadTask = useTaskMessagesStore((s) => s.loadTask);
  const touchTask = useTaskMessagesStore((s) => s.touchTask);
  const isLoaded = !!taskState;

  useEffect(() => {
    if (!isLoaded) {
      Promise.all([api.agent.getMessages(taskId), api.tasks.findById(taskId)]).then(
        ([messages, task]) => {
          if (task) {
            loadTask(taskId, messages, task.status);
          }
        }
      );
    } else {
      touchTask(taskId);
    }
  }, [taskId, isLoaded, loadTask, touchTask]);

  const defaultState: TaskState = {
    messages: [],
    status: 'waiting',
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    lastAccessedAt: 0,
  };

  const state = taskState ?? defaultState;

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    pendingPermission: state.pendingPermission,
    pendingQuestion: state.pendingQuestion,
    isLoading: !isLoaded,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-task-messages.ts
git commit -m "feat(hooks): create useTaskMessages hook to access store"
```

---

## Task 8: Refactor `useAgentStream` to Use Store

**Files:**
- Modify: `src/hooks/use-agent.ts`

**Step 1: Replace `useAgentStream` implementation**

Replace the entire `useAgentStream` function with a simpler version that delegates to `useTaskMessages`:

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useTaskMessages } from '@/hooks/use-task-messages';

import type {
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';

export function useAgentStream(taskId: string) {
  const taskMessages = useTaskMessages(taskId);
  const queryClient = useQueryClient();

  // Invalidate task queries when status changes
  useEffect(() => {
    if (taskMessages.status === 'completed' || taskMessages.status === 'errored') {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [taskMessages.status, taskId, queryClient]);

  return taskMessages;
}

export function useAgentControls(taskId: string) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const queryClient = useQueryClient();

  const start = useCallback(async () => {
    setIsStarting(true);
    try {
      await api.agent.start(taskId);
    } finally {
      setIsStarting(false);
    }
  }, [taskId]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await api.agent.stop(taskId);
    } finally {
      setIsStopping(false);
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    }
  }, [taskId, queryClient]);

  const respondToPermission = useCallback(
    async (requestId: string, response: PermissionResponse) => {
      await api.agent.respond(taskId, requestId, response);
    },
    [taskId]
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      await api.agent.respond(taskId, requestId, response);
    },
    [taskId]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      await api.agent.sendMessage(taskId, message);
    },
    [taskId]
  );

  return {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    isStarting,
    isStopping,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-agent.ts
git commit -m "refactor(hooks): simplify useAgentStream to use store via useTaskMessages"
```

---

## Task 9: Update Task Page to Mark as Read with `lastReadIndex`

**Files:**
- Modify: `src/routes/projects/$projectId/tasks/$taskId.tsx:59-65`
- Modify: `src/hooks/use-tasks.ts:66-78`

**Step 1: Update `useMarkTaskAsRead` to use `updateLastReadIndex`**

In `src/hooks/use-tasks.ts`, replace `useMarkTaskAsRead`:

```typescript
export function useMarkTaskAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lastReadIndex }: { id: string; lastReadIndex: number }) =>
      api.tasks.updateLastReadIndex(id, lastReadIndex),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}
```

**Step 2: Update task page to pass `lastReadIndex`**

In `src/routes/projects/$projectId/tasks/$taskId.tsx`, update the mark as read effect:

```typescript
// Mark task as read when viewing (except when running)
useEffect(() => {
  if (task && agentState.messages.length > 0 && task.status !== 'running') {
    markAsRead.mutate({ id: taskId, lastReadIndex: agentState.messages.length - 1 });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [taskId, task?.status, agentState.messages.length]);
```

**Step 3: Commit**

```bash
git add src/hooks/use-tasks.ts src/routes/projects/\$projectId/tasks/\$taskId.tsx
git commit -m "feat(tasks): mark as read using lastReadIndex"
```

---

## Task 10: Update Task List Item Unread Badge Logic

**Files:**
- Modify: `src/features/task/ui-task-list-item/index.tsx`

**Step 1: Update unread calculation**

Replace `isTaskUnread` function and update the component to use `messageCount`:

```typescript
import { Link } from '@tanstack/react-router';

import { StatusIndicator } from '@/common/ui/status-indicator';
import { formatRelativeTime } from '@/lib/time';

import type { Task } from '../../../../shared/types';

interface TaskWithMessageCount extends Task {
  messageCount?: number;
}

interface TaskListItemProps {
  task: TaskWithMessageCount;
  projectId: string;
  isActive?: boolean;
}

export function getUnreadCount(task: TaskWithMessageCount): number {
  if (task.status === 'running') return 0;
  const messageCount = task.messageCount ?? 0;
  if (messageCount === 0) return 0;
  return Math.max(0, messageCount - 1 - task.lastReadIndex);
}

export function TaskListItem({ task, projectId, isActive }: TaskListItemProps) {
  const unreadCount = getUnreadCount(task);

  return (
    <Link
      to="/projects/$projectId/tasks/$taskId"
      params={{ projectId, taskId: task.id }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
    >
      <StatusIndicator status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.name}</span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/task/ui-task-list-item/index.tsx
git commit -m "feat(ui): show unread message count badge on task list items"
```

---

## Task 11: Add Pending Permission/Question Indicators to Task List

**Files:**
- Modify: `src/features/task/ui-task-list-item/index.tsx`

**Step 1: Add store selector for pending state**

Update the component to also show when a task is waiting for permission or has a question:

```typescript
import { Link } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';

import { StatusIndicator } from '@/common/ui/status-indicator';
import { formatRelativeTime } from '@/lib/time';
import { useTaskMessagesStore } from '@/stores/task-messages';

import type { Task } from '../../../../shared/types';

interface TaskWithMessageCount extends Task {
  messageCount?: number;
}

interface TaskListItemProps {
  task: TaskWithMessageCount;
  projectId: string;
  isActive?: boolean;
}

export function getUnreadCount(task: TaskWithMessageCount): number {
  if (task.status === 'running') return 0;
  const messageCount = task.messageCount ?? 0;
  if (messageCount === 0) return 0;
  return Math.max(0, messageCount - 1 - task.lastReadIndex);
}

export function TaskListItem({ task, projectId, isActive }: TaskListItemProps) {
  const unreadCount = getUnreadCount(task);
  const taskState = useTaskMessagesStore((s) => s.tasks[task.id]);
  const needsAttention = taskState?.pendingPermission || taskState?.pendingQuestion;

  return (
    <Link
      to="/projects/$projectId/tasks/$taskId"
      params={{ projectId, taskId: task.id }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
    >
      <StatusIndicator status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.name}</span>
          {needsAttention && (
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          {unreadCount > 0 && !needsAttention && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/task/ui-task-list-item/index.tsx
git commit -m "feat(ui): show attention indicator when task needs permission/answer"
```

---

## Task 12: Clear Pending Permission/Question After Response

**Files:**
- Modify: `src/hooks/use-agent.ts`

**Step 1: Clear store state after responding**

Update `respondToPermission` and `respondToQuestion` in `useAgentControls`:

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useTaskMessages } from '@/hooks/use-task-messages';
import { useTaskMessagesStore } from '@/stores/task-messages';

import type {
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';

export function useAgentStream(taskId: string) {
  const taskMessages = useTaskMessages(taskId);
  const queryClient = useQueryClient();

  // Invalidate task queries when status changes
  useEffect(() => {
    if (taskMessages.status === 'completed' || taskMessages.status === 'errored') {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [taskMessages.status, taskId, queryClient]);

  return taskMessages;
}

export function useAgentControls(taskId: string) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const queryClient = useQueryClient();
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);

  const start = useCallback(async () => {
    setIsStarting(true);
    try {
      await api.agent.start(taskId);
    } finally {
      setIsStarting(false);
    }
  }, [taskId]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await api.agent.stop(taskId);
    } finally {
      setIsStopping(false);
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    }
  }, [taskId, queryClient]);

  const respondToPermission = useCallback(
    async (requestId: string, response: PermissionResponse) => {
      await api.agent.respond(taskId, requestId, response);
      setPermission(taskId, null);
    },
    [taskId, setPermission]
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      await api.agent.respond(taskId, requestId, response);
      setQuestion(taskId, null);
    },
    [taskId, setQuestion]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      await api.agent.sendMessage(taskId, message);
    },
    [taskId]
  );

  return {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    isStarting,
    isStopping,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-agent.ts
git commit -m "fix(agent): clear pending permission/question after responding"
```

---

## Task 13: Run Lint and Fix Any Issues

**Step 1: Run lint**

```bash
pnpm lint
```

**Step 2: Fix any lint errors that appear**

**Step 3: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: lint errors"
```

---

## Summary

After completing all tasks, you will have:

1. **Database**: `lastReadIndex` column on tasks table
2. **Repository**: `messageCount` subquery in `findByProjectId`, `updateLastReadIndex` method
3. **IPC**: `updateLastReadIndex` endpoint exposed
4. **Store**: Zustand store with LRU eviction for task state
5. **Global listener**: `TaskMessageManager` component subscribing to all agent events
6. **Hooks**: `useTaskMessages` for accessing store, refactored `useAgentStream`
7. **UI**: Unread count badges and attention indicators on task list items
