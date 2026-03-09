import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTaskMessages } from '@/hooks/use-task-messages';
import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useToastStore } from '@/stores/toasts';
import type { PromptPart } from '@shared/agent-backend-types';
import type { PermissionResponse, QuestionResponse } from '@shared/agent-types';

export function useAgentStream({
  taskId,
  stepId,
}: {
  taskId: string;
  stepId: string | null;
}) {
  const taskMessages = useTaskMessages({ taskId, stepId });
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

export function useAgentControls({
  taskId,
  stepId,
}: {
  taskId: string;
  stepId: string | null;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const startInFlightRef = useRef(false);
  const queryClient = useQueryClient();
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const addToast = useToastStore((s) => s.addToast);

  const start = useCallback(async () => {
    if (!stepId || startInFlightRef.current) return;
    startInFlightRef.current = true;
    setIsStarting(true);
    try {
      await api.agent.start(stepId);
    } catch (error) {
      addToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to start the step',
      });
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  }, [stepId, addToast]);

  const stop = useCallback(async () => {
    if (!stepId) return;
    setIsStopping(true);
    try {
      await api.agent.stop(stepId);
    } finally {
      setIsStopping(false);
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    }
  }, [stepId, taskId, queryClient]);

  const respondToPermission = useCallback(
    async (requestId: string, response: PermissionResponse) => {
      if (!stepId) return;
      try {
        await api.agent.respond(stepId, requestId, response);
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to respond to permission request',
        });
      }
      setPermission(stepId, null);
    },
    [stepId, setPermission, addToast],
  );

  const respondToQuestion = useCallback(
    async (requestId: string, response: QuestionResponse) => {
      if (!stepId) return;
      try {
        await api.agent.respond(stepId, requestId, response);
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to respond to question',
        });
      }
      setQuestion(stepId, null);
    },
    [stepId, setQuestion, addToast],
  );

  const sendMessage = useCallback(
    async (parts: PromptPart[]) => {
      if (!stepId) return;
      await api.agent.sendMessage(stepId, parts);
    },
    [stepId],
  );

  const queuePrompt = useCallback(
    async (parts: PromptPart[]) => {
      if (!stepId) return { promptId: '' };
      return api.agent.queuePrompt(stepId, parts);
    },
    [stepId],
  );

  const cancelQueuedPrompt = useCallback(
    async (promptId: string) => {
      if (!stepId) return;
      await api.agent.cancelQueuedPrompt(stepId, promptId);
    },
    [stepId],
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
