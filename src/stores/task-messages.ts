import { create } from 'zustand';

import type { AgentQuestion, QueuedPrompt } from '@shared/agent-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from '@shared/normalized-message-v2';
import type { TaskStatus } from '@shared/types';

export interface TaskState {
  messages: NormalizedEntry[];
  status: TaskStatus;
  error: string | null;
  pendingPermission: (NormalizedPermissionRequest & { taskId: string }) | null;
  pendingQuestion: {
    taskId: string;
    requestId: string;
    questions: AgentQuestion[];
  } | null;
  queuedPrompts: QueuedPrompt[];
  lastAccessedAt: number;
}

interface TaskMessagesStore {
  tasks: Record<string, TaskState>;
  cacheLimit: number;

  // Actions
  loadTask: (
    taskId: string,
    messages: NormalizedEntry[],
    status: TaskStatus,
  ) => void;
  addEntry: (taskId: string, entry: NormalizedEntry) => void;
  updateEntry: (taskId: string, entry: NormalizedEntry) => void;
  updateToolResult: (
    taskId: string,
    toolId: string,
    result: string | undefined,
    isError: boolean,
    durationMs?: number,
  ) => void;
  setStatus: (
    taskId: string,
    status: TaskStatus,
    error?: string | null,
  ) => void;
  setPermission: (
    taskId: string,
    permission: TaskState['pendingPermission'],
  ) => void;
  setQuestion: (taskId: string, question: TaskState['pendingQuestion']) => void;
  setQueuedPrompts: (taskId: string, queuedPrompts: QueuedPrompt[]) => void;
  touchTask: (taskId: string) => void;
  unloadTask: (taskId: string) => void;

  // Selectors
  isLoaded: (taskId: string) => boolean;
  getRunningTaskIds: () => string[];
}

const DEFAULT_CACHE_LIMIT = 10;

function evictIfNeeded(
  tasks: Record<string, TaskState>,
  cacheLimit: number,
): Record<string, TaskState> {
  const entries = Object.entries(tasks);
  const inactiveTasks = entries.filter(
    ([, state]) => state.status !== 'running',
  );

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
          queuedPrompts: [],
          lastAccessedAt: Date.now(),
        },
      };
      return { tasks: evictIfNeeded(newTasks, state.cacheLimit) };
    });
  },

  addEntry: (taskId, entry) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            messages: [...task.messages, entry],
          },
        },
      };
    });
  },

  updateEntry: (taskId, entry) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      const idx = task.messages.findIndex((m) => m.id === entry.id);
      let updatedMessages: NormalizedEntry[];
      if (idx !== -1) {
        updatedMessages = [...task.messages];
        updatedMessages[idx] = entry;
      } else {
        updatedMessages = [...task.messages, entry];
      }
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, messages: updatedMessages },
        },
      };
    });
  },

  updateToolResult: (taskId, toolId, result, _isError, _durationMs) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      const idx = task.messages.findIndex(
        (m) => m.type === 'tool-use' && 'toolId' in m && m.toolId === toolId,
      );
      if (idx === -1) return state;
      const entry = task.messages[idx] as NormalizedEntry;
      if (entry.type !== 'tool-use') return state;
      const patched = { ...entry, result } as NormalizedEntry;
      const updatedMessages = [...task.messages];
      updatedMessages[idx] = patched;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, messages: updatedMessages },
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

  setQueuedPrompts: (taskId, queuedPrompts) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            queuedPrompts,
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
      const { [taskId]: _removed, ...rest } = state.tasks;
      void _removed; // Intentionally unused - destructuring to exclude from rest
      return { tasks: rest };
    });
  },

  isLoaded: (taskId) => !!get().tasks[taskId],

  getRunningTaskIds: () =>
    Object.entries(get().tasks)
      .filter(([, state]) => state.status === 'running')
      .map(([id]) => id),
}));
