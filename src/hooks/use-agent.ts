import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

import type {
  AgentMessage,
  AgentPermissionEvent,
  AgentQuestionEvent,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
import type { TaskStatus } from '../../shared/types';

export interface AgentState {
  messages: AgentMessage[];
  status: TaskStatus;
  error: string | null;
  pendingPermission: AgentPermissionEvent | null;
  pendingQuestion: AgentQuestionEvent | null;
}

const initialState: AgentState = {
  messages: [],
  status: 'waiting',
  error: null,
  pendingPermission: null,
  pendingQuestion: null,
};

export function useAgentStream(taskId: string) {
  const [state, setState] = useState<AgentState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const taskIdRef = useRef(taskId);
  const loadedMessagesRef = useRef<Set<string>>(new Set());

  // Keep taskId ref updated
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  // Load persisted messages when taskId changes
  useEffect(() => {
    let cancelled = false;

    // Reset state for new task
    loadedMessagesRef.current = new Set();
    setState(initialState);
    setIsLoading(true);

    console.log(`[useAgentStream] Loading messages for task ${taskId}`);
    api.agent
      .getMessages(taskId)
      .then((persistedMessages) => {
        console.log(`[useAgentStream] Loaded ${persistedMessages.length} messages for task ${taskId}`);
        if (!cancelled && taskIdRef.current === taskId) {
          // Mark all persisted messages as loaded to avoid duplicates from events
          persistedMessages.forEach((msg, idx) => {
            loadedMessagesRef.current.add(`${idx}`);
          });

          setState((prev) => ({
            ...prev,
            // Merge persisted messages with any that came in via events
            // Persisted messages come first, then any new event messages
            messages: persistedMessages,
          }));
        }
      })
      .catch((error) => {
        console.error('Failed to load messages:', error);
      })
      .finally(() => {
        if (!cancelled && taskIdRef.current === taskId) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Subscribe to agent events
  useEffect(() => {
    const unsubMessage = api.agent.onMessage((event) => {
      if (event.taskId !== taskIdRef.current) return;
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, event.message],
      }));
    });

    const unsubStatus = api.agent.onStatus((event) => {
      if (event.taskId !== taskIdRef.current) return;
      setState((prev) => ({
        ...prev,
        status: event.status,
        error: event.error || null,
      }));
      // Invalidate task queries to update UI elsewhere
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    const unsubPermission = api.agent.onPermission((event) => {
      if (event.taskId !== taskIdRef.current) return;
      setState((prev) => ({
        ...prev,
        pendingPermission: event,
      }));
    });

    const unsubQuestion = api.agent.onQuestion((event) => {
      if (event.taskId !== taskIdRef.current) return;
      setState((prev) => ({
        ...prev,
        pendingQuestion: event,
      }));
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubPermission();
      unsubQuestion();
    };
  }, [taskId, queryClient]);

  return { ...state, isLoading };
}

export function useAgentControls(taskId: string) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const queryClient = useQueryClient();

  const start = useCallback(async () => {
    setIsStarting(true);
    try {
      await api.agent.start(taskId);
    } finally {
      setIsStarting(false);
    }
  }, [taskId]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await api.agent.stop(taskId);
    } finally {
      setIsStopping(false);
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    }
  }, [taskId, queryClient]);

  const respondToPermission = useCallback(
    async (requestId: string, response: PermissionResponse) => {
      await api.agent.respond(taskId, requestId, response);
    },
    [taskId]
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      await api.agent.respond(taskId, requestId, response);
    },
    [taskId]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      await api.agent.sendMessage(taskId, message);
    },
    [taskId]
  );

  return {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    isStarting,
    isStopping,
  };
}
