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
          break;
        case 'question':
          if (isLoaded(stepId)) {
            setQuestion(stepId, event);
          }
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
      setRunCommandRunning(taskId, status.isRunning);
    });

    // Fetch after subscribing so we never miss events that fire between
    // the IPC round-trip and listener registration.
    api.runCommands
      .getTaskIdsWithRunningCommands()
      .then((taskIds) => {
        for (const taskId of taskIds) {
          setRunCommandRunning(taskId, true);
        }
      })
      .catch(() => {
        // Ignore — can happen during app shutdown
      });

    return unsub;
  }, [setRunCommandRunning]);

  return null;
}
