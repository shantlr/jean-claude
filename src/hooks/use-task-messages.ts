import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useTaskMessagesStore, TaskState } from '@/stores/task-messages';

export function useTaskMessages(taskId: string) {
  const taskState = useTaskMessagesStore((s) => s.tasks[taskId]);
  const loadTask = useTaskMessagesStore((s) => s.loadTask);
  const touchTask = useTaskMessagesStore((s) => s.touchTask);
  const isLoaded = !!taskState;

  useEffect(() => {
    if (!isLoaded) {
      Promise.all([api.agent.getMessages(taskId), api.tasks.findById(taskId)]).then(
        ([messages, task]) => {
          if (task) {
            loadTask(taskId, messages, task.status);
          }
        }
      );
    } else {
      touchTask(taskId);
    }
  }, [taskId, isLoaded, loadTask, touchTask]);

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
  };
}
