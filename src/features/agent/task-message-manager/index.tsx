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

  useEffect(() => {
    const unsub = api.agent.onEvent((event) => {
      const { taskId } = event;

      switch (event.type) {
        case 'entry':
          if (isLoaded(taskId)) {
            addEntry(taskId, event.entry);
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'entry-update':
          if (isLoaded(taskId)) {
            updateEntry(taskId, event.entry);
            invalidateWorktreeDiffIfNeeded(queryClient, taskId, event.entry);
          }
          break;
        case 'tool-result':
          if (isLoaded(taskId)) {
            updateToolResult(
              taskId,
              event.toolId,
              event.result,
              event.isError,
              event.durationMs,
            );
          }
          break;
        case 'status':
          if (isLoaded(taskId)) {
            setStatus(taskId, event.status, event.error);
          }
          break;
        case 'permission':
          if (isLoaded(taskId)) {
            setPermission(taskId, event);
          }
          break;
        case 'question':
          if (isLoaded(taskId)) {
            setQuestion(taskId, event);
          }
          break;
        case 'name-updated':
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
          break;
        case 'queue-update':
          if (isLoaded(taskId)) {
            setQueuedPrompts(taskId, event.queuedPrompts);
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

  return null;
}
