import { create } from 'zustand';

import type { AgentQuestion, QueuedPrompt } from '@shared/agent-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from '@shared/normalized-message-v2';
import type { RunCommandLogStream } from '@shared/run-command-types';
import type { TaskStatus } from '@shared/types';

const MAX_RUN_COMMAND_LOG_LINES = 5000;

interface RunCommandLogEntry {
  stream: RunCommandLogStream;
  line: string;
  timestamp: number;
}

interface RunCommandLogState {
  lines: RunCommandLogEntry[];
  updatedAt: number;
}

export type RunCommandLogs = Record<string, RunCommandLogState>;

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
  /** Keyed by stepId — each step has its own message/state entry */
  steps: Record<string, TaskState>;
  /** Keyed by taskId — run command logs are task-level, not step-level */
  runCommandLogs: Record<string, RunCommandLogs>;
  cacheLimit: number;

  // Actions (all keyed by stepId)
  loadStep: (
    stepId: string,
    messages: NormalizedEntry[],
    status: TaskStatus,
  ) => void;
  addEntry: (stepId: string, entry: NormalizedEntry) => void;
  updateEntry: (stepId: string, entry: NormalizedEntry) => void;
  updateToolResult: (
    stepId: string,
    toolId: string,
    result: string | undefined,
    isError: boolean,
    durationMs?: number,
  ) => void;
  setStatus: (
    stepId: string,
    status: TaskStatus,
    error?: string | null,
  ) => void;
  setPermission: (
    stepId: string,
    permission: TaskState['pendingPermission'],
  ) => void;
  setQuestion: (stepId: string, question: TaskState['pendingQuestion']) => void;
  setQueuedPrompts: (stepId: string, queuedPrompts: QueuedPrompt[]) => void;
  appendRunCommandLine: (
    taskId: string,
    runCommandId: string,
    stream: RunCommandLogStream,
    line: string,
  ) => void;
  clearRunCommandLogs: (taskId: string, runCommandId: string) => void;
  clearAllRunCommandLogs: (taskId: string) => void;
  touchStep: (stepId: string) => void;
  unloadStep: (stepId: string) => void;

  // Selectors
  isLoaded: (stepId: string) => boolean;
  getRunningStepIds: () => string[];
}

const DEFAULT_CACHE_LIMIT = 25;

function evictIfNeeded(
  steps: Record<string, TaskState>,
  cacheLimit: number,
): Record<string, TaskState> {
  const entries = Object.entries(steps);
  const inactiveSteps = entries.filter(
    ([, state]) => state.status !== 'running',
  );

  if (inactiveSteps.length <= cacheLimit) {
    return steps;
  }

  // Sort by lastAccessedAt ascending (oldest first)
  inactiveSteps.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  const toEvict = inactiveSteps.length - cacheLimit;
  const idsToEvict = new Set(inactiveSteps.slice(0, toEvict).map(([id]) => id));

  const newSteps: Record<string, TaskState> = {};
  for (const [id, state] of entries) {
    if (!idsToEvict.has(id)) {
      newSteps[id] = state;
    }
  }

  return newSteps;
}

export const useTaskMessagesStore = create<TaskMessagesStore>((set, get) => ({
  steps: {},
  runCommandLogs: {},
  cacheLimit: DEFAULT_CACHE_LIMIT,

  loadStep: (stepId, messages, status) => {
    set((state) => {
      const newSteps = {
        ...state.steps,
        [stepId]: {
          messages,
          status,
          error: null,
          pendingPermission: null,
          pendingQuestion: null,
          queuedPrompts: [],
          lastAccessedAt: Date.now(),
        },
      };
      return { steps: evictIfNeeded(newSteps, state.cacheLimit) };
    });
  },

  addEntry: (stepId, entry) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            messages: [...step.messages, entry],
          },
        },
      };
    });
  },

  updateEntry: (stepId, entry) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      const idx = step.messages.findIndex((m) => m.id === entry.id);
      let updatedMessages: NormalizedEntry[];
      if (idx !== -1) {
        updatedMessages = [...step.messages];
        updatedMessages[idx] = entry;
      } else {
        updatedMessages = [...step.messages, entry];
      }
      return {
        steps: {
          ...state.steps,
          [stepId]: { ...step, messages: updatedMessages },
        },
      };
    });
  },

  updateToolResult: (stepId, toolId, result, _isError, _durationMs) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      const idx = step.messages.findIndex(
        (m) => m.type === 'tool-use' && 'toolId' in m && m.toolId === toolId,
      );
      if (idx === -1) return state;
      const entry = step.messages[idx] as NormalizedEntry;
      if (entry.type !== 'tool-use') return state;
      const patched = { ...entry, result } as NormalizedEntry;
      const updatedMessages = [...step.messages];
      updatedMessages[idx] = patched;
      return {
        steps: {
          ...state.steps,
          [stepId]: { ...step, messages: updatedMessages },
        },
      };
    });
  },

  setStatus: (stepId, status, error = null) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            status,
            error,
          },
        },
      };
    });
  },

  setPermission: (stepId, permission) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            pendingPermission: permission,
          },
        },
      };
    });
  },

  setQuestion: (stepId, question) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            pendingQuestion: question,
          },
        },
      };
    });
  },

  setQueuedPrompts: (stepId, queuedPrompts) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            queuedPrompts,
          },
        },
      };
    });
  },

  appendRunCommandLine: (taskId, runCommandId, stream, line) => {
    set((state) => {
      const taskLogs = state.runCommandLogs[taskId] ?? {};
      const existingLog = taskLogs[runCommandId] ?? {
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
        runCommandLogs: {
          ...state.runCommandLogs,
          [taskId]: {
            ...taskLogs,
            [runCommandId]: {
              lines: cappedLines,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  clearRunCommandLogs: (taskId, runCommandId) => {
    set((state) => {
      const taskLogs = state.runCommandLogs[taskId];
      if (!taskLogs) return state;

      const { [runCommandId]: _removed, ...restLogs } = taskLogs;
      void _removed;

      return {
        runCommandLogs: {
          ...state.runCommandLogs,
          [taskId]: restLogs,
        },
      };
    });
  },

  clearAllRunCommandLogs: (taskId) => {
    set((state) => {
      if (!state.runCommandLogs[taskId]) return state;

      const { [taskId]: _removed, ...rest } = state.runCommandLogs;
      void _removed;

      return { runCommandLogs: rest };
    });
  },

  touchStep: (stepId) => {
    set((state) => {
      const step = state.steps[stepId];
      if (!step) return state;
      return {
        steps: {
          ...state.steps,
          [stepId]: {
            ...step,
            lastAccessedAt: Date.now(),
          },
        },
      };
    });
  },

  unloadStep: (stepId) => {
    set((state) => {
      const { [stepId]: _removed, ...rest } = state.steps;
      void _removed; // Intentionally unused - destructuring to exclude from rest
      return { steps: rest };
    });
  },

  isLoaded: (stepId) => !!get().steps[stepId],

  getRunningStepIds: () =>
    Object.entries(get().steps)
      .filter(([, state]) => state.status === 'running')
      .map(([id]) => id),
}));
