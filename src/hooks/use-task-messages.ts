import { useCallback, useEffect, useRef } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore, TaskState } from '@/stores/task-messages';

// Hoisted outside component to avoid recreation on every render
const DEFAULT_TASK_STATE: TaskState = {
  messages: [],
  status: 'waiting',
  error: null,
  pendingPermission: null,
  pendingQuestion: null,
  queuedPrompts: [],
  lastAccessedAt: 0,
};

export function useTaskMessages({
  taskId,
  stepId,
}: {
  taskId: string;
  stepId: string | null;
}) {
  const stepState = useTaskMessagesStore((s) =>
    stepId ? s.steps[stepId] : undefined,
  );
  const loadStep = useTaskMessagesStore((s) => s.loadStep);
  const touchStep = useTaskMessagesStore((s) => s.touchStep);
  const unloadStep = useTaskMessagesStore((s) => s.unloadStep);
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const isLoaded = !!stepState;
  // Track which step we're currently fetching to prevent duplicate requests
  const fetchingRef = useRef<string | null>(null);
  // Track which step we've done a sync check for (only relevant when already loaded)
  const syncCheckedRef = useRef<string | null>(null);

  const fetchPendingRequest = useCallback(async () => {
    if (!stepId) return;
    const pendingRequest = await api.agent.getPendingRequest(stepId);
    if (pendingRequest) {
      if (pendingRequest.type === 'permission') {
        setPermission(stepId, pendingRequest.data);
      } else {
        setQuestion(stepId, pendingRequest.data);
      }
    }
  }, [stepId, setPermission, setQuestion]);

  const fetchMessages = useCallback(() => {
    if (!stepId) return;
    fetchingRef.current = stepId;
    Promise.all([
      api.agent.getMessages(stepId),
      api.tasks.findById(taskId),
    ]).then(([messages, task]) => {
      if (task) {
        loadStep(stepId, messages, task.status);
        // Also fetch pending request after loading step
        fetchPendingRequest();
      }
      // Clear fetching ref after load completes
      if (fetchingRef.current === stepId) {
        fetchingRef.current = null;
      }
    });
  }, [taskId, stepId, loadStep, fetchPendingRequest]);

  const refetch = useCallback(() => {
    if (!stepId) return;
    // Force a fresh fetch by unloading and re-fetching
    unloadStep(stepId);
    syncCheckedRef.current = null;
    fetchMessages();
  }, [stepId, unloadStep, fetchMessages]);

  useEffect(() => {
    if (!stepId) return;

    if (!isLoaded) {
      // Not loaded - fetch everything from backend
      // Reset sync check since we need a fresh load
      syncCheckedRef.current = null;

      // Only fetch if we're not already fetching this step
      if (fetchingRef.current !== stepId) {
        fetchMessages();
      }
    } else {
      // Already loaded - clear fetching ref
      fetchingRef.current = null;
      touchStep(stepId);

      // Only run sync check once per step open (not on every re-render)
      if (syncCheckedRef.current !== stepId) {
        syncCheckedRef.current = stepId;

        // Check message count sync
        api.agent.getMessageCount(stepId).then((backendCount) => {
          const frontendCount = stepState?.messages.length ?? 0;
          if (backendCount !== frontendCount) {
            // Out of sync - reload from backend
            fetchMessages();
          }
        });

        // Also fetch pending request (in case we missed an IPC event)
        fetchPendingRequest();
      }
    }
  }, [
    stepId,
    isLoaded,
    touchStep,
    stepState?.messages.length,
    fetchMessages,
    fetchPendingRequest,
  ]);

  // Refetch pending request when window regains focus
  useEffect(() => {
    if (!stepId) return;

    const handleFocus = () => {
      // Only refetch if the step is loaded and in a waiting state
      if (isLoaded && stepState?.status === 'waiting') {
        fetchPendingRequest();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [stepId, isLoaded, stepState?.status, fetchPendingRequest]);

  const state = stepState ?? DEFAULT_TASK_STATE;

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    pendingPermission: state.pendingPermission,
    pendingQuestion: state.pendingQuestion,
    queuedPrompts: state.queuedPrompts,
    isLoading: !stepId || !isLoaded,
    refetch,
  };
}
