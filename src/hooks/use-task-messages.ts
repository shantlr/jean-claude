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
