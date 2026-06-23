import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { invalidateTaskFeed } from './feed-invalidations';

const MESSAGE_UPDATE_FLUSH_MS = 300;

function invalidateWorktreeDiffIfNeeded(
  queryClient: QueryClient,
  taskId: string,
  entry: NormalizedEntry,
) {
  if (
    entry.type === 'tool-use' &&
    (entry.name === 'write' || entry.name === 'edit') &&
    entry.result
  ) {
    queryClient.invalidateQueries({ queryKey: ['worktree-diff', taskId] });
    queryClient.invalidateQueries({
      queryKey: ['worktree-file-content', taskId],
    });
  }
}

export function TaskMessageManager() {
  const queryClient = useQueryClient();
  const applyEntryBatch = useTaskMessagesStore((s) => s.applyEntryBatch);
  const updateToolResult = useTaskMessagesStore((s) => s.updateToolResult);
  const setStatus = useTaskMessagesStore((s) => s.setStatus);
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const setQueuedPrompts = useTaskMessagesStore((s) => s.setQueuedPrompts);
  const isLoaded = useTaskMessagesStore((s) => s.isLoaded);
  const setPendingRequestForTask = useTaskMessagesStore(
    (s) => s.setPendingRequestForTask,
  );
  const clearPendingRequestForTask = useTaskMessagesStore(
    (s) => s.clearPendingRequestForTask,
  );
  const appendRunCommandLogBatch = useTaskMessagesStore(
    (s) => s.appendRunCommandLogBatch,
  );
  const applyRunCommandLogsReset = useTaskMessagesStore(
    (s) => s.applyRunCommandLogsReset,
  );
  const setRunCommandRunning = useTaskMessagesStore(
    (s) => s.setRunCommandRunning,
  );

  useEffect(() => {
    const pendingEntryUpdates: Array<{
      stepId: string;
      entry: NormalizedEntry;
      mode: 'append' | 'upsert';
    }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPendingEntryUpdates = (stepId?: string) => {
      if (pendingEntryUpdates.length === 0) return;

      if (stepId) {
        const matchingUpdates = pendingEntryUpdates.filter(
          (update) => update.stepId === stepId,
        );
        if (matchingUpdates.length === 0) return;

        const remainingUpdates = pendingEntryUpdates.filter(
          (update) => update.stepId !== stepId,
        );
        pendingEntryUpdates.length = 0;
        pendingEntryUpdates.push(...remainingUpdates);
        applyEntryBatch(matchingUpdates);
        return;
      }

      const updates = pendingEntryUpdates.splice(0);
      applyEntryBatch(updates);
    };

    const scheduleEntryUpdateFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPendingEntryUpdates();
      }, MESSAGE_UPDATE_FLUSH_MS);
    };

    const queueEntryUpdate = (
      stepId: string,
      entry: NormalizedEntry,
      mode: 'append' | 'upsert',
    ) => {
      pendingEntryUpdates.push({ stepId, entry, mode });
      scheduleEntryUpdateFlush();
    };

    const unsub = api.agent.onEvent((event) => {
      const { taskId, stepId } = event;

      switch (event.type) {
        case 'entry':
          if (isLoaded(stepId)) {
            queueEntryUpdate(stepId, event.entry, 'append');
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'entry-update':
          if (isLoaded(stepId)) {
            queueEntryUpdate(stepId, event.entry, 'upsert');
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'tool-result':
          flushPendingEntryUpdates(stepId);
          if (isLoaded(stepId)) {
            updateToolResult(
              stepId,
              event.toolId,
              event.result,
              event.isError,
              event.durationMs,
            );
          }
          break;
        case 'status':
          flushPendingEntryUpdates(stepId);
          if (isLoaded(stepId)) {
            setStatus(stepId, event.status, event.error);
          }
          // Clear pending requests when agent resumes or is stopped
          if (event.status === 'running' || event.status === 'interrupted') {
            clearPendingRequestForTask(taskId);
          }
          // Also invalidate task queries so task-level status updates
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['steps', { taskId }] });
          queryClient.invalidateQueries({ queryKey: ['steps', stepId] });
          // Invalidate feed so status changes appear instantly
          invalidateTaskFeed(queryClient);
          break;
        case 'permission':
          flushPendingEntryUpdates(stepId);
          if (isLoaded(stepId)) {
            setPermission(stepId, event);
            setQuestion(stepId, null);
          }
          // Always track at task level so the feed can refine attention
          // even when the step isn't loaded (task panel never opened).
          setPendingRequestForTask(taskId, {
            type: 'permission',
            permission: event,
          });
          // Invalidate feed so attention changes to needs-permission
          invalidateTaskFeed(queryClient);
          break;
        case 'question':
          flushPendingEntryUpdates(stepId);
          if (event.questions.length === 0) {
            if (isLoaded(stepId)) {
              setQuestion(stepId, null);
            }
            clearPendingRequestForTask(taskId);
            invalidateTaskFeed(queryClient);
            break;
          }
          if (isLoaded(stepId)) {
            setQuestion(stepId, event);
            setPermission(stepId, null);
          }
          // Always track at task level so the feed can refine attention
          // even when the step isn't loaded (task panel never opened).
          setPendingRequestForTask(taskId, {
            type: 'question',
            question: event,
          });
          // Invalidate feed so attention changes to has-question
          invalidateTaskFeed(queryClient);
          break;
        case 'name-updated':
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
          break;
        case 'queue-update':
          flushPendingEntryUpdates(stepId);
          if (isLoaded(stepId)) {
            setQueuedPrompts(stepId, event.queuedPrompts);
          }
          break;
      }
    });

    return () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      flushPendingEntryUpdates();
      unsub();
    };
  }, [
    queryClient,
    applyEntryBatch,
    updateToolResult,
    setStatus,
    setPermission,
    setQuestion,
    setQueuedPrompts,
    isLoaded,
    setPendingRequestForTask,
    clearPendingRequestForTask,
  ]);

  useEffect(() => {
    const unsub = api.runCommands.onLog(
      (taskId, runCommandId, stream, text, generation) => {
        appendRunCommandLogBatch(
          taskId,
          runCommandId,
          stream,
          text,
          generation,
        );
      },
    );

    return unsub;
  }, [appendRunCommandLogBatch]);

  useEffect(() => {
    const unsub = api.runCommands.onLogsReset(
      (taskId, runCommandId, generation) => {
        applyRunCommandLogsReset(taskId, runCommandId, generation);
      },
    );

    return unsub;
  }, [applyRunCommandLogsReset]);

  // Subscribe to run command status changes AND initialize runCommandRunning
  // from the main process. Both live in the same effect so the listener is
  // guaranteed to be active before the initialization fetch resolves,
  // eliminating the race where a command stops between fetch and subscribe.
  useEffect(() => {
    const unsub = api.runCommands.onStatusChange((taskId, status) => {
      setRunCommandRunning(taskId, status.isRunning ? status : false);
    });

    // Fetch after subscribing so we never miss events that fire between
    // the IPC round-trip and listener registration.
    api.runCommands
      .getTaskIdsWithRunningCommands()
      .then(async (taskIds) => {
        const results = await Promise.all(
          taskIds.map((taskId) =>
            api.runCommands
              .getStatus(taskId)
              .then((status) => ({ taskId, status })),
          ),
        );
        for (const { taskId, status } of results) {
          setRunCommandRunning(taskId, status.isRunning ? status : false);
        }
      })
      .catch(() => {
        // Ignore — can happen during app shutdown
      });

    return unsub;
  }, [setRunCommandRunning]);

  return null;
}
