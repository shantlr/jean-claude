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
    const subscriptionId = Date.now();
    console.log(
      `[TaskMessageManager] Subscribing (subscriptionId=${subscriptionId})`,
    );
    const unsubMessage = api.agent.onMessage(({ taskId, message }) => {
      const loaded = isLoaded(taskId);
      console.log(
        `[TaskMessageManager] Received message for task ${taskId}, type: ${message.type}, isLoaded: ${loaded}, subscriptionId: ${subscriptionId}`,
      );
      if (loaded) {
        appendMessage(taskId, message);
      } else {
        console.warn(
          `[TaskMessageManager] DROPPING message for unloaded task ${taskId}`,
        );
      }
    });

    const unsubStatus = api.agent.onStatus(({ taskId, status, error }) => {
      const loaded = isLoaded(taskId);
      console.log(
        `[TaskMessageManager] Received status for task ${taskId}: ${status}, isLoaded: ${loaded}`,
      );
      if (loaded) {
        setStatus(taskId, status, error);
      } else {
        console.warn(
          `[TaskMessageManager] DROPPING status for unloaded task ${taskId}`,
        );
      }
    });

    const unsubPermission = api.agent.onPermission((event) => {
      const loaded = isLoaded(event.taskId);
      console.log(
        `[TaskMessageManager] Received permission for task ${event.taskId}, isLoaded: ${loaded}`,
      );
      if (loaded) {
        setPermission(event.taskId, event);
      }
    });

    const unsubQuestion = api.agent.onQuestion((event) => {
      const loaded = isLoaded(event.taskId);
      console.log(
        `[TaskMessageManager] Received question for task ${event.taskId}, isLoaded: ${loaded}`,
      );
      if (loaded) {
        setQuestion(event.taskId, event);
      }
    });

    const unsubNameUpdated = api.agent.onNameUpdated(({ taskId }) => {
      console.log(
        `[TaskMessageManager] Received name update for task ${taskId}`,
      );
      // Invalidate task queries so the UI refreshes with the new name
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    });

    const unsubQueueUpdate = api.agent.onQueueUpdate(
      ({ taskId, queuedPrompts }) => {
        const loaded = isLoaded(taskId);
        console.log(
          `[TaskMessageManager] Received queue update for task ${taskId}, isLoaded: ${loaded}`,
        );
        if (loaded) {
          setQueuedPrompts(taskId, queuedPrompts);
        }
      },
    );

    return () => {
      console.log(
        `[TaskMessageManager] Unsubscribing (subscriptionId=${subscriptionId})`,
      );
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
