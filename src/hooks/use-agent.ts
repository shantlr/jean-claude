import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useTaskMessages } from '@/hooks/use-task-messages';
import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';

import type {
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';

export function useAgentStream(taskId: string) {
  const taskMessages = useTaskMessages(taskId);
  const queryClient = useQueryClient();

  // Invalidate task queries when status changes to a terminal state
  useEffect(() => {
    if (taskMessages.status === 'completed' || taskMessages.status === 'errored' || taskMessages.status === 'interrupted') {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [taskMessages.status, taskId, queryClient]);

  return taskMessages;
}

export function useAgentControls(taskId: string) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const queryClient = useQueryClient();
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);

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
      setPermission(taskId, null);
    },
    [taskId, setPermission]
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      await api.agent.respond(taskId, requestId, response);
      setQuestion(taskId, null);
    },
    [taskId, setQuestion]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      await api.agent.sendMessage(taskId, message);
    },
    [taskId]
  );

  const queuePrompt = useCallback(
    async (prompt: string) => {
      return api.agent.queuePrompt(taskId, prompt);
    },
    [taskId]
  );

  const cancelQueuedPrompt = useCallback(
    async (promptId: string) => {
      await api.agent.cancelQueuedPrompt(taskId, promptId);
    },
    [taskId]
  );

  return {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    queuePrompt,
    cancelQueuedPrompt,
    isStarting,
    isStopping,
  };
}
