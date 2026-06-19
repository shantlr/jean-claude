import { create } from 'zustand';

import type { AgentQuestion, QueuedPrompt } from '@shared/agent-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from '@shared/normalized-message-v2';
import type { RunCommandLogStream, RunStatus } from '@shared/run-command-types';
import type { TaskStatus, TaskStepStatus } from '@shared/types';

import { clearReviewCommentsForTask } from './review-comments';
import { parseRunCommandLogBatch } from './utils-run-command-log-parser';

type StepExecutionStatus = TaskStatus | TaskStepStatus;

const MAX_RUN_COMMAND_LOG_LINES = 5000;
const RUN_COMMAND_LOG_CHUNK_LINE_LIMIT = 200;

export interface RunCommandLogLine {
  stream: RunCommandLogStream;
  line: string;
  timestamp: number;
}

export interface RunCommandLogChunk {
  id: string;
  lines: RunCommandLogLine[];
  lineCount: number;
}

export interface RunCommandLogState {
  chunks: RunCommandLogChunk[];
  pendingLines: Record<RunCommandLogStream, RunCommandLogLine | null>;
  trailingText: Record<RunCommandLogStream, string>;
  totalLineCount: number;
  updatedAt: number;
  version: number;
}

export type RunCommandLogs = Record<string, RunCommandLogState>;

export function getRunCommandLogLineCount(
  log: RunCommandLogState | null | undefined,
): number {
  if (!log) return 0;
  return (
    log.totalLineCount +
    (log.pendingLines.stdout ? 1 : 0) +
    (log.pendingLines.stderr ? 1 : 0)
  );
}

export function getRunCommandLogLines(
  log: RunCommandLogState | null | undefined,
): RunCommandLogLine[] {
  if (!log) return [];

  const lines = log.chunks.flatMap((chunk) => chunk.lines);
  if (log.pendingLines.stdout) lines.push(log.pendingLines.stdout);
  if (log.pendingLines.stderr) lines.push(log.pendingLines.stderr);
  return lines;
}

export interface TaskState {
  taskId: string;
  messages: NormalizedEntry[];
  status: StepExecutionStatus;
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

/**
 * Lightweight pending-request tracking keyed by taskId.
 * Always populated on permission/question IPC events regardless of whether the
 * step is fully loaded, so the feed can refine attention even for tasks whose
 * panel has never been opened.
 */
export interface PendingRequest {
  type: 'permission' | 'question';
  permission?: NormalizedPermissionRequest & { taskId: string };
  question?: {
    taskId: string;
    requestId: string;
    questions: AgentQuestion[];
  };
}

interface TaskMessagesStore {
  /** Keyed by stepId — each step has its own message/state entry */
  steps: Record<string, TaskState>;
  /** Keyed by taskId — lightweight pending request tracking (always populated) */
  pendingRequestsByTaskId: Record<string, PendingRequest>;
  /** Keyed by taskId — run command logs are task-level, not step-level */
  runCommandLogs: Record<string, RunCommandLogs>;
  /** Keyed by taskId/runCommandId — drops stale IPC batches after log reset. */
  runCommandLogGenerations: Record<string, Record<string, number>>;
  /** Keyed by taskId — running command status with command details */
  runCommandRunning: Record<string, RunStatus>;
  cacheLimit: number;

  // Actions (all keyed by stepId)
  loadStep: (
    stepId: string,
    taskId: string,
    messages: NormalizedEntry[],
    status: StepExecutionStatus,
  ) => void;
  applyEntryBatch: (
    updates: Array<{
      stepId: string;
      entry: NormalizedEntry;
      mode: 'append' | 'upsert';
    }>,
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
  appendRunCommandLogBatch: (
    taskId: string,
    runCommandId: string,
    stream: RunCommandLogStream,
    text: string,
    generation: number,
  ) => void;
  clearRunCommandLogs: (taskId: string, runCommandId: string) => void;
  resetRunCommandLogs: (taskId: string, runCommandId: string) => number;
  applyRunCommandLogsReset: (
    taskId: string,
    runCommandId: string,
    generation: number,
  ) => void;
  clearAllRunCommandLogs: (taskId: string) => void;
  setRunCommandRunning: (taskId: string, status: RunStatus | false) => void;
  setPendingRequestForTask: (taskId: string, request: PendingRequest) => void;
  clearPendingRequestForTask: (taskId: string) => void;
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

  // Collect taskIds of evicted steps
  const evictedTaskIds = new Set<string>();

  const newSteps: Record<string, TaskState> = {};
  for (const [id, state] of entries) {
    if (!idsToEvict.has(id)) {
      newSteps[id] = state;
    } else {
      evictedTaskIds.add(state.taskId);
    }
  }

  // Clear review comments for tasks that have no remaining loaded steps
  for (const taskId of evictedTaskIds) {
    const hasRemainingSteps = Object.values(newSteps).some(
      (s) => s.taskId === taskId,
    );
    if (!hasRemainingSteps) {
      clearReviewCommentsForTask(taskId);
    }
  }

  return newSteps;
}

function appendLinesToChunks({
  chunks,
  lines,
  runCommandId,
}: {
  chunks: RunCommandLogChunk[];
  lines: RunCommandLogLine[];
  runCommandId: string;
}): RunCommandLogChunk[] {
  if (lines.length === 0) return chunks;

  const nextChunks = chunks.slice();
  let current = nextChunks[nextChunks.length - 1];

  for (const line of lines) {
    if (!current || current.lineCount >= RUN_COMMAND_LOG_CHUNK_LINE_LIMIT) {
      current = {
        id: `${runCommandId}:${Date.now()}:${nextChunks.length}`,
        lines: [],
        lineCount: 0,
      };
      nextChunks.push(current);
    }

    current = {
      ...current,
      lines: [...current.lines, line],
      lineCount: current.lineCount + 1,
    };
    nextChunks[nextChunks.length - 1] = current;
  }

  return nextChunks;
}

function capLogChunks({
  chunks,
  totalLineCount,
}: {
  chunks: RunCommandLogChunk[];
  totalLineCount: number;
}): { chunks: RunCommandLogChunk[]; totalLineCount: number } {
  let nextChunks = chunks;
  let nextLineCount = totalLineCount;

  while (
    nextLineCount > MAX_RUN_COMMAND_LOG_LINES &&
    nextChunks.length > 1 &&
    nextLineCount - nextChunks[0].lineCount >= MAX_RUN_COMMAND_LOG_LINES
  ) {
    const [removed, ...rest] = nextChunks;
    nextChunks = rest;
    nextLineCount -= removed.lineCount;
  }

  if (nextLineCount > MAX_RUN_COMMAND_LOG_LINES && nextChunks.length > 0) {
    const excess = nextLineCount - MAX_RUN_COMMAND_LOG_LINES;
    const [chunk, ...rest] = nextChunks;
    const lines = chunk.lines.slice(excess);
    nextChunks = [{ ...chunk, lines, lineCount: lines.length }, ...rest];
    nextLineCount = MAX_RUN_COMMAND_LOG_LINES;
  }

  return { chunks: nextChunks, totalLineCount: nextLineCount };
}

function shouldKeepExistingEntry({
  existing,
  next,
}: {
  existing: NormalizedEntry;
  next: NormalizedEntry;
}): boolean {
  if (
    (existing.type === 'assistant-message' ||
      existing.type === 'thinking' ||
      existing.type === 'user-prompt') &&
    existing.type === next.type &&
    next.value.length < existing.value.length &&
    existing.value.startsWith(next.value)
  ) {
    return true;
  }

  if (
    existing.type === 'tool-use' &&
    next.type === 'tool-use' &&
    'result' in existing &&
    existing.result !== undefined &&
    (!('result' in next) || next.result === undefined)
  ) {
    return true;
  }

  return false;
}

export const useTaskMessagesStore = create<TaskMessagesStore>((set, get) => ({
  steps: {},
  pendingRequestsByTaskId: {},
  runCommandLogs: {},
  runCommandLogGenerations: {},
  runCommandRunning: {},
  cacheLimit: DEFAULT_CACHE_LIMIT,

  loadStep: (stepId, taskId, messages, status) => {
    set((state) => {
      const newSteps = {
        ...state.steps,
        [stepId]: {
          taskId,
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

  applyEntryBatch: (updates) => {
    if (updates.length === 0) return;

    set((state) => {
      let changed = false;
      const nextSteps = { ...state.steps };

      for (const update of updates) {
        const step = nextSteps[update.stepId];
        if (!step) continue;

        let updatedMessages: NormalizedEntry[];
        if (update.mode === 'append') {
          const idx = step.messages.findIndex((m) => m.id === update.entry.id);
          if (idx !== -1) {
            const existing = step.messages[idx];
            if (shouldKeepExistingEntry({ existing, next: update.entry })) {
              continue;
            }
            updatedMessages = [...step.messages];
            updatedMessages[idx] = update.entry;
          } else {
            updatedMessages = [...step.messages, update.entry];
          }
        } else {
          const idx = step.messages.findIndex((m) => m.id === update.entry.id);
          if (idx !== -1) {
            const existing = step.messages[idx];
            if (shouldKeepExistingEntry({ existing, next: update.entry })) {
              continue;
            }
            updatedMessages = [...step.messages];
            updatedMessages[idx] = update.entry;
          } else {
            updatedMessages = [...step.messages, update.entry];
          }
        }

        nextSteps[update.stepId] = {
          ...step,
          messages: updatedMessages,
        };
        changed = true;
      }

      if (!changed) return state;
      return { steps: nextSteps };
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
      // MCP results should be objects — wrap plain text in { content } to stay
      // consistent with the primary entry-update path in the normalizer.
      const patchedResult =
        entry.name === 'mcp' && typeof result === 'string'
          ? (tryParseJsonObject(result) ?? { content: result })
          : result;
      const patched = { ...entry, result: patchedResult } as NormalizedEntry;
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
            // Clear pending permission/question when stopped by user
            ...(status === 'interrupted' && {
              pendingPermission: null,
              pendingQuestion: null,
            }),
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

  appendRunCommandLogBatch: (
    taskId,
    runCommandId,
    stream,
    text,
    generation,
  ) => {
    set((state) => {
      const now = Date.now();
      const currentGeneration =
        state.runCommandLogGenerations[taskId]?.[runCommandId] ?? 0;
      if (generation < currentGeneration) return state;

      const taskLogs = state.runCommandLogs[taskId] ?? {};
      const existingLog = taskLogs[runCommandId] ?? {
        chunks: [],
        pendingLines: { stdout: null, stderr: null },
        trailingText: { stdout: '', stderr: '' },
        totalLineCount: 0,
        updatedAt: now,
        version: 0,
      };

      const parsed = parseRunCommandLogBatch({
        trailingText: existingLog.trailingText[stream],
        stream,
        text,
        timestamp: now,
      });
      const chunks = appendLinesToChunks({
        chunks: existingLog.chunks,
        lines: parsed.completedLines,
        runCommandId,
      });
      const capped = capLogChunks({
        chunks,
        totalLineCount:
          existingLog.totalLineCount + parsed.completedLines.length,
      });

      return {
        runCommandLogs: {
          ...state.runCommandLogs,
          [taskId]: {
            ...taskLogs,
            [runCommandId]: {
              chunks: capped.chunks,
              pendingLines: {
                ...existingLog.pendingLines,
                [stream]: parsed.pendingLine,
              },
              trailingText: {
                ...existingLog.trailingText,
                [stream]: parsed.trailingText,
              },
              totalLineCount: capped.totalLineCount,
              updatedAt: now,
              version: existingLog.version + 1,
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

  resetRunCommandLogs: (taskId, runCommandId) => {
    const currentGeneration =
      get().runCommandLogGenerations[taskId]?.[runCommandId] ?? 0;
    const nextGeneration = Math.max(currentGeneration + 1, Date.now());

    set((state) => {
      const taskLogs = state.runCommandLogs[taskId];
      const restLogs = taskLogs
        ? Object.fromEntries(
            Object.entries(taskLogs).filter(([id]) => id !== runCommandId),
          )
        : {};

      return {
        runCommandLogs: {
          ...state.runCommandLogs,
          [taskId]: restLogs,
        },
        runCommandLogGenerations: {
          ...state.runCommandLogGenerations,
          [taskId]: {
            ...(state.runCommandLogGenerations[taskId] ?? {}),
            [runCommandId]: nextGeneration,
          },
        },
      };
    });

    return nextGeneration;
  },

  applyRunCommandLogsReset: (taskId, runCommandId, generation) => {
    set((state) => {
      const currentGeneration =
        state.runCommandLogGenerations[taskId]?.[runCommandId] ?? 0;
      if (generation < currentGeneration) return state;

      const taskLogs = state.runCommandLogs[taskId];
      const restLogs = taskLogs
        ? Object.fromEntries(
            Object.entries(taskLogs).filter(([id]) => id !== runCommandId),
          )
        : {};

      return {
        runCommandLogs: {
          ...state.runCommandLogs,
          [taskId]: restLogs,
        },
        runCommandLogGenerations: {
          ...state.runCommandLogGenerations,
          [taskId]: {
            ...(state.runCommandLogGenerations[taskId] ?? {}),
            [runCommandId]: generation,
          },
        },
      };
    });
  },

  clearAllRunCommandLogs: (taskId) => {
    set((state) => {
      if (!state.runCommandLogs[taskId]) return state;

      const { [taskId]: _removedLogs, ...restLogs } = state.runCommandLogs;
      const { [taskId]: _removedGenerations, ...restGenerations } =
        state.runCommandLogGenerations;
      void _removedLogs;
      void _removedGenerations;

      return {
        runCommandLogs: restLogs,
        runCommandLogGenerations: restGenerations,
      };
    });
  },

  setRunCommandRunning: (taskId, status) => {
    set((state) => {
      if (!status && !state.runCommandRunning[taskId]) {
        return state;
      }
      if (!status) {
        const { [taskId]: _removed, ...rest } = state.runCommandRunning;
        void _removed;
        return { runCommandRunning: rest };
      }
      // Skip update if command list is unchanged
      const existing = state.runCommandRunning[taskId];
      if (existing) {
        const prev = existing.commands;
        const next = status.commands;
        if (
          prev.length === next.length &&
          prev.every(
            (c, i) =>
              c.id === next[i].id &&
              c.name === next[i].name &&
              c.command === next[i].command &&
              c.status === next[i].status,
          )
        ) {
          return state;
        }
      }
      return {
        runCommandRunning: {
          ...state.runCommandRunning,
          [taskId]: status,
        },
      };
    });
  },

  setPendingRequestForTask: (taskId, request) => {
    set((state) => ({
      pendingRequestsByTaskId: {
        ...state.pendingRequestsByTaskId,
        [taskId]: request,
      },
    }));
  },

  clearPendingRequestForTask: (taskId) => {
    set((state) => {
      if (!state.pendingRequestsByTaskId[taskId]) return state;
      const { [taskId]: _removed, ...rest } = state.pendingRequestsByTaskId;
      void _removed;
      return { pendingRequestsByTaskId: rest };
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

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return null;
}
