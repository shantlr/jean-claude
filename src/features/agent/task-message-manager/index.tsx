import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { NormalizedEntry } from '@shared/normalized-message-v2';

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
  const addEntry = useTaskMessagesStore((s) => s.addEntry);
  const updateEntry = useTaskMessagesStore((s) => s.updateEntry);
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
  const appendRunCommandLine = useTaskMessagesStore(
    (s) => s.appendRunCommandLine,
  );
  const setRunCommandRunning = useTaskMessagesStore(
    (s) => s.setRunCommandRunning,
  );

  useEffect(() => {
    const unsub = api.agent.onEvent((event) => {
      const { taskId, stepId } = event;

      switch (event.type) {
        case 'entry':
          if (isLoaded(stepId)) {
            addEntry(stepId, event.entry);
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'entry-update':
          if (isLoaded(stepId)) {
            updateEntry(stepId, event.entry);
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'tool-result':
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
          if (isLoaded(stepId)) {
            setStatus(stepId, event.status, event.error);
          }
          // When task moves away from waiting, clear any tracked pending request
          if (event.status !== 'waiting') {
            clearPendingRequestForTask(taskId);
          }
          // Also invalidate task queries so task-level status updates
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['steps', { taskId }] });
          // Invalidate feed so status changes appear instantly
          queryClient.invalidateQueries({
            queryKey: ['feed', 'items'],
          });
          break;
        case 'permission':
          if (isLoaded(stepId)) {
            setPermission(stepId, event);
          }
          // Always track at task level so the feed can refine attention
          // even when the step isn't loaded (task panel never opened).
          setPendingRequestForTask(taskId, {
            type: 'permission',
            permission: event,
          });
          // Invalidate feed so attention changes to needs-permission
          queryClient.invalidateQueries({
            queryKey: ['feed', 'items'],
          });
          break;
        case 'question':
          if (isLoaded(stepId)) {
            setQuestion(stepId, event);
          }
          // Always track at task level so the feed can refine attention
          // even when the step isn't loaded (task panel never opened).
          setPendingRequestForTask(taskId, {
            type: 'question',
            question: event,
          });
          // Invalidate feed so attention changes to has-question
          queryClient.invalidateQueries({
            queryKey: ['feed', 'items'],
          });
          break;
        case 'name-updated':
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
          break;
        case 'queue-update':
          if (isLoaded(stepId)) {
            setQueuedPrompts(stepId, event.queuedPrompts);
          }
          break;
      }
    });

    return unsub;
  }, [
    queryClient,
    addEntry,
    updateEntry,
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
      (taskId, runCommandId, stream, line) => {
        appendRunCommandLine(taskId, runCommandId, stream, line);
      },
    );

    return unsub;
  }, [appendRunCommandLine]);

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
