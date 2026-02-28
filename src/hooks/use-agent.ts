import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useTaskMessages } from '@/hooks/use-task-messages';
import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useToastStore } from '@/stores/toasts';
import type { PromptPart } from '@shared/agent-backend-types';
import type { PermissionResponse, QuestionResponse } from '@shared/agent-types';

export function useAgentStream(taskId: string) {
  const taskMessages = useTaskMessages(taskId);
  const queryClient = useQueryClient();

  // Invalidate task queries when status changes to a terminal state
  useEffect(() => {
    if (
      taskMessages.status === 'completed' ||
      taskMessages.status === 'errored' ||
      taskMessages.status === 'interrupted'
    ) {
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
  const addToast = useToastStore((s) => s.addToast);

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
      try {
        await api.agent.respond(taskId, requestId, response);
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to respond to permission request',
        });
      }
      setPermission(taskId, null);
    },
    [taskId, setPermission, addToast],
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      try {
        await api.agent.respond(taskId, requestId, response);
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to respond to question',
        });
      }
      setQuestion(taskId, null);
    },
    [taskId, setQuestion, addToast],
  );

  const sendMessage = useCallback(
    async (parts: PromptPart[]) => {
      await api.agent.sendMessage(taskId, parts);
    },
    [taskId],
  );

  const queuePrompt = useCallback(
    async (parts: PromptPart[]) => {
      return api.agent.queuePrompt(taskId, parts);
    },
    [taskId],
  );

  const cancelQueuedPrompt = useCallback(
    async (promptId: string) => {
      await api.agent.cancelQueuedPrompt(taskId, promptId);
    },
    [taskId],
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
