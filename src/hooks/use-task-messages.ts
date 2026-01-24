import { useCallback, useEffect, useRef } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore, TaskState } from '@/stores/task-messages';

export function useTaskMessages(taskId: string) {
  const taskState = useTaskMessagesStore((s) => s.tasks[taskId]);
  const loadTask = useTaskMessagesStore((s) => s.loadTask);
  const touchTask = useTaskMessagesStore((s) => s.touchTask);
  const unloadTask = useTaskMessagesStore((s) => s.unloadTask);
  const isLoaded = !!taskState;
  // Track which task we're currently fetching to prevent duplicate requests
  const fetchingRef = useRef<string | null>(null);
  // Track which task we've done a sync check for (only relevant when already loaded)
  const syncCheckedRef = useRef<string | null>(null);

  const fetchMessages = useCallback(() => {
    fetchingRef.current = taskId;
    Promise.all([api.agent.getMessages(taskId), api.tasks.findById(taskId)]).then(
      ([messages, task]) => {
        if (task) {
          loadTask(taskId, messages, task.status);
        }
        // Clear fetching ref after load completes
        if (fetchingRef.current === taskId) {
          fetchingRef.current = null;
        }
      }
    );
  }, [taskId, loadTask]);

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
        api.agent.getMessageCount(taskId).then((backendCount) => {
          const frontendCount = taskState?.messages.length ?? 0;
          if (backendCount !== frontendCount) {
            // Out of sync - reload from backend
            console.log(
              `[useTaskMessages] Sync mismatch for task ${taskId}: frontend=${frontendCount}, backend=${backendCount}. Reloading.`
            );
            fetchMessages();
          }
        });
      }
    }
  }, [taskId, isLoaded, touchTask, taskState?.messages.length, fetchMessages]);

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
    refetch,
  };
}
