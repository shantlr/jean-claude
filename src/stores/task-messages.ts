import { create } from 'zustand';

import type {
  AgentMessage,
  AgentPermissionEvent,
  AgentQuestionEvent,
  QueuedPrompt,
} from '../../shared/agent-types';
import type { TaskStatus } from '../../shared/types';

export interface TaskState {
  messages: AgentMessage[];
  status: TaskStatus;
  error: string | null;
  pendingPermission: AgentPermissionEvent | null;
  pendingQuestion: AgentQuestionEvent | null;
  queuedPrompts: QueuedPrompt[];
  lastAccessedAt: number;
}

interface TaskMessagesStore {
  tasks: Record<string, TaskState>;
  cacheLimit: number;

  // Actions
  loadTask: (
    taskId: string,
    messages: AgentMessage[],
    status: TaskStatus,
  ) => void;
  appendMessage: (taskId: string, message: AgentMessage) => void;
  setStatus: (
    taskId: string,
    status: TaskStatus,
    error?: string | null,
  ) => void;
  setPermission: (
    taskId: string,
    permission: AgentPermissionEvent | null,
  ) => void;
  setQuestion: (taskId: string, question: AgentQuestionEvent | null) => void;
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
