import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore } from '@/stores/task-messages';

export function TaskMessageManager() {
  const queryClient = useQueryClient();
  const appendMessage = useTaskMessagesStore((s) => s.appendMessage);
  const setStatus = useTaskMessagesStore((s) => s.setStatus);
  const setPermission = useTaskMessagesStore((s) => s.setPermission);
  const setQuestion = useTaskMessagesStore((s) => s.setQuestion);
  const setQueuedPrompts = useTaskMessagesStore((s) => s.setQueuedPrompts);
  const isLoaded = useTaskMessagesStore((s) => s.isLoaded);

  useEffect(() => {
    console.log('Subscribing to task message manager events');
    const unsubMessage = api.agent.onMessage(({ taskId, message }) => {
      console.log(
        `[TaskMessageManager] Received message for task ${taskId}, type: ${message.type}`,
        { isLoaded },
      );
      if (isLoaded(taskId)) {
        appendMessage(taskId, message);
      }
    });

    const unsubStatus = api.agent.onStatus(({ taskId, status, error }) => {
      console.log(
        `[TaskMessageManager] Received status for task ${taskId}: ${status}`,
        { isLoaded },
      );
      if (isLoaded(taskId)) {
        setStatus(taskId, status, error);
      }
    });

    const unsubPermission = api.agent.onPermission((event) => {
      console.log(
        `[TaskMessageManager] Received permission for task ${event.taskId}`,
        { isLoaded },
      );
      if (isLoaded(event.taskId)) {
        setPermission(event.taskId, event);
      }
    });

    const unsubQuestion = api.agent.onQuestion((event) => {
      console.log(
        `[TaskMessageManager] Received question for task ${event.taskId}`,
        { isLoaded },
      );
      if (isLoaded(event.taskId)) {
        setQuestion(event.taskId, event);
      }
    });

    const unsubNameUpdated = api.agent.onNameUpdated(({ taskId }) => {
      console.log(
        `[TaskMessageManager] Received name update for task ${taskId}`,
        { isLoaded },
      );
      // Invalidate task queries so the UI refreshes with the new name
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    });

    const unsubQueueUpdate = api.agent.onQueueUpdate(
      ({ taskId, queuedPrompts }) => {
        console.log(
          `[TaskMessageManager] Received queue update for task ${taskId}`,
          { isLoaded },
        );
        if (isLoaded(taskId)) {
          setQueuedPrompts(taskId, queuedPrompts);
        }
      },
    );

    return () => {
      console.log('Unsubscribing from task message manager events');
      unsubMessage();
      unsubStatus();
      unsubPermission();
      unsubQuestion();
      unsubNameUpdated();
      unsubQueueUpdate();
    };
  }, [
    queryClient,
    appendMessage,
    setStatus,
    setPermission,
    setQuestion,
    setQueuedPrompts,
    isLoaded,
  ]);

  return null;
}
