# Refetch Pending Requests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the frontend to refetch pending permission/question requests when refocusing a task, so missed IPC events can be recovered.

**Architecture:** Add a new IPC endpoint `agent:getPendingRequest` that returns the current pending request (if any) from the in-memory session. The frontend calls this when navigating to a task and on window focus.

**Tech Stack:** TypeScript, Electron IPC, React Query, Zustand

---

## Task 1: Add getPendingRequest method to AgentService

**Files:**
- Modify: `electron/services/agent-service.ts`

**Step 1: Add the getPendingRequest method**

Add this method to the `AgentService` class (after `getQueuedPrompts`):

```typescript
/**
 * Get the current pending request for a task (permission or question).
 * Returns null if no pending request exists.
 */
getPendingRequest(taskId: string): {
  type: 'permission';
  data: AgentPermissionEvent;
} | {
  type: 'question';
  data: AgentQuestionEvent;
} | null {
  const session = this.sessions.get(taskId);
  if (!session || session.pendingRequests.length === 0) {
    return null;
  }

  const request = session.pendingRequests[0];
  if (request.type === 'question') {
    return {
      type: 'question',
      data: {
        taskId,
        requestId: request.requestId,
        questions: request.input.questions as AgentQuestion[],
      },
    };
  }

  // Permission request
  const sessionAllowButton = this.getSessionAllowButton(request.toolName, request.input);
  return {
    type: 'permission',
    data: {
      taskId,
      requestId: request.requestId,
      toolName: request.toolName,
      input: request.input,
      sessionAllowButton,
    },
  };
}
```

**Step 2: Add imports if needed**

Ensure `AgentPermissionEvent`, `AgentQuestionEvent`, and `AgentQuestion` are imported from `shared/agent-types.ts` (they should already be there).

---

## Task 2: Add IPC handler and channel constant

**Files:**
- Modify: `shared/agent-types.ts`
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add channel constant to AGENT_CHANNELS**

In `shared/agent-types.ts`, add to `AGENT_CHANNELS`:

```typescript
export const AGENT_CHANNELS = {
  // Events (main -> renderer)
  MESSAGE: 'agent:message',
  STATUS: 'agent:status',
  PERMISSION: 'agent:permission',
  QUESTION: 'agent:question',
  NAME_UPDATED: 'agent:nameUpdated',
  QUEUE_UPDATE: 'agent:queueUpdate',
  // Invoke (renderer -> main)
  START: 'agent:start',
  STOP: 'agent:stop',
  RESPOND: 'agent:respond',
  SEND_MESSAGE: 'agent:sendMessage',
  GET_MESSAGES: 'agent:getMessages',
  GET_MESSAGE_COUNT: 'agent:getMessageCount',
  QUEUE_PROMPT: 'agent:queuePrompt',
  CANCEL_QUEUED_PROMPT: 'agent:cancelQueuedPrompt',
  GET_PENDING_REQUEST: 'agent:getPendingRequest',  // Add this line
} as const;
```

**Step 2: Add IPC handler**

In `electron/ipc/handlers.ts`, add after the `GET_MESSAGE_COUNT` handler:

```typescript
ipcMain.handle(AGENT_CHANNELS.GET_PENDING_REQUEST, (_, taskId: string) => {
  return agentService.getPendingRequest(taskId);
});
```

**Step 3: Update the AGENT_CHANNELS import**

Ensure `AGENT_CHANNELS` is already imported in handlers.ts (it should be).

---

## Task 3: Add preload bridge and API types

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add to preload.ts**

In `electron/preload.ts`, add to the `agent` object (after `getMessageCount`):

```typescript
getPendingRequest: (taskId: string) =>
  ipcRenderer.invoke(AGENT_CHANNELS.GET_PENDING_REQUEST, taskId),
```

**Step 2: Add types to api.ts**

In `src/lib/api.ts`, add to the `Api` interface's `agent` property:

```typescript
getPendingRequest: (taskId: string) => Promise<{
  type: 'permission';
  data: AgentPermissionEvent;
} | {
  type: 'question';
  data: AgentQuestionEvent;
} | null>;
```

**Step 3: Add fallback implementation**

In the fallback api object in `src/lib/api.ts`, add to the `agent` property (after `getMessageCount`):

```typescript
getPendingRequest: async () => null,
```

---

## Task 4: Fetch pending request on task navigation

**Files:**
- Modify: `src/hooks/use-task-messages.ts`

**Step 1: Update the hook to fetch pending requests**

Replace the existing `useTaskMessages` hook implementation:

```typescript
import { useCallback, useEffect, useRef } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore, TaskState } from '@/stores/task-messages';

export function useTaskMessages(taskId: string) {
  const taskState = useTaskMessagesStore((s) => s.tasks[taskId]);
  const loadTask = useTaskMessagesStore((s) => s.loadTask);
  const touchTask = useTaskMessagesStore((s) => s.touchTask);
  const unloadTask = useTaskMessagesStore((s) => s.unloadTask);
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const isLoaded = !!taskState;
  // Track which task we're currently fetching to prevent duplicate requests
  const fetchingRef = useRef<string | null>(null);
  // Track which task we've done a sync check for (only relevant when already loaded)
  const syncCheckedRef = useRef<string | null>(null);

  const fetchPendingRequest = useCallback(async () => {
    const pendingRequest = await api.agent.getPendingRequest(taskId);
    if (pendingRequest) {
      if (pendingRequest.type === 'permission') {
        setPermission(taskId, pendingRequest.data);
      } else {
        setQuestion(taskId, pendingRequest.data);
      }
    }
  }, [taskId, setPermission, setQuestion]);

  const fetchMessages = useCallback(() => {
    fetchingRef.current = taskId;
    Promise.all([
      api.agent.getMessages(taskId),
      api.tasks.findById(taskId),
    ]).then(([messages, task]) => {
      if (task) {
        loadTask(taskId, messages, task.status);
        // Also fetch pending request after loading task
        fetchPendingRequest();
      }
      // Clear fetching ref after load completes
      if (fetchingRef.current === taskId) {
        fetchingRef.current = null;
      }
    });
  }, [taskId, loadTask, fetchPendingRequest]);

  const refetch = useCallback(() => {
    // Force a fresh fetch by unloading and re-fetching
    unloadTask(taskId);
    syncCheckedRef.current = null;
    fetchMessages();
  }, [taskId, unloadTask, fetchMessages]);

  useEffect(() => {
    if (!isLoaded) {
      // Not loaded - fetch everything from backend
      // Reset sync check since we need a fresh load
      syncCheckedRef.current = null;

      // Only fetch if we're not already fetching this task
      if (fetchingRef.current !== taskId) {
        fetchMessages();
      }
    } else {
      // Already loaded - clear fetching ref
      fetchingRef.current = null;
      touchTask(taskId);

      // Only run sync check once per task open (not on every re-render)
      if (syncCheckedRef.current !== taskId) {
        syncCheckedRef.current = taskId;

        // Check message count sync
        api.agent.getMessageCount(taskId).then((backendCount) => {
          const frontendCount = taskState?.messages.length ?? 0;
          if (backendCount !== frontendCount) {
            // Out of sync - reload from backend
            console.log(
              `[useTaskMessages] Sync mismatch for task ${taskId}: frontend=${frontendCount}, backend=${backendCount}. Reloading.`,
            );
            fetchMessages();
          }
        });

        // Also fetch pending request (in case we missed an IPC event)
        fetchPendingRequest();
      }
    }
  }, [taskId, isLoaded, touchTask, taskState?.messages.length, fetchMessages, fetchPendingRequest]);

  const defaultState: TaskState = {
    messages: [],
    status: 'waiting',
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    queuedPrompts: [],
    lastAccessedAt: 0,
  };

  const state = taskState ?? defaultState;

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    pendingPermission: state.pendingPermission,
    pendingQuestion: state.pendingQuestion,
    queuedPrompts: state.queuedPrompts,
    isLoading: !isLoaded,
    refetch,
  };
}
```

---

## Task 5: Refetch pending requests on window focus

**Files:**
- Modify: `src/hooks/use-task-messages.ts`

**Step 1: Add window focus listener**

Update the hook to refetch pending requests when window regains focus. Add this effect after the existing one:

```typescript
// Refetch pending request when window regains focus
useEffect(() => {
  const handleFocus = () => {
    // Only refetch if the task is loaded and in a waiting state
    if (isLoaded && taskState?.status === 'waiting') {
      console.log(`[useTaskMessages] Window focused, refetching pending request for task ${taskId}`);
      fetchPendingRequest();
    }
  };

  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, [taskId, isLoaded, taskState?.status, fetchPendingRequest]);
```

---

## Task 6: Run lint and verify

**Step 1: Run lint**

```bash
pnpm lint --fix
```

**Step 2: Manual verification**

1. Start a task and let it reach a permission request
2. Switch to a different task
3. Switch back - verify the permission bar appears
4. Start a task and let it reach a permission request
5. Minimize/unfocus the window
6. Refocus the window - verify the permission bar appears

---

## Summary of Changes

| File | Change |
|------|--------|
| `electron/services/agent-service.ts` | Add `getPendingRequest()` method |
| `shared/agent-types.ts` | Add `GET_PENDING_REQUEST` to `AGENT_CHANNELS` |
| `electron/ipc/handlers.ts` | Add IPC handler for `getPendingRequest` |
| `electron/preload.ts` | Expose `getPendingRequest` to renderer |
| `src/lib/api.ts` | Add type and fallback for `getPendingRequest` |
| `src/hooks/use-task-messages.ts` | Call `getPendingRequest` on task load and window focus |
