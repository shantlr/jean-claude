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
    const unsubMessage = api.agent.onMessage(({ taskId, message }) => {
      if (isLoaded(taskId)) {
        appendMessage(taskId, message);
      }
    });

    const unsubStatus = api.agent.onStatus(({ taskId, status, error }) => {
      if (isLoaded(taskId)) {
        setStatus(taskId, status, error);
      }
    });

    const unsubPermission = api.agent.onPermission((event) => {
      if (isLoaded(event.taskId)) {
        setPermission(event.taskId, event);
      }
    });

    const unsubQuestion = api.agent.onQuestion((event) => {
      if (isLoaded(event.taskId)) {
        setQuestion(event.taskId, event);
      }
    });

    const unsubNameUpdated = api.agent.onNameUpdated(({ taskId }) => {
      // Invalidate task queries so the UI refreshes with the new name
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
    });

    const unsubQueueUpdate = api.agent.onQueueUpdate(({ taskId, queuedPrompts }) => {
      if (isLoaded(taskId)) {
        setQueuedPrompts(taskId, queuedPrompts);
      }
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubPermission();
      unsubQuestion();
      unsubNameUpdated();
      unsubQueueUpdate();
    };
  }, [queryClient, appendMessage, setStatus, setPermission, setQuestion, setQueuedPrompts, isLoaded]);

  return null;
}
