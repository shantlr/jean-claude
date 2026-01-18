import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import { StatusIndicator } from '@/components/status-indicator';
import { useTask, useMarkTaskAsRead } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  component: TaskPanel,
});

function TaskPanel() {
  const { taskId } = Route.useParams();
  const { data: task } = useTask(taskId);
  const markAsRead = useMarkTaskAsRead();

  // Mark task as read when viewing
  useEffect(() => {
    if (task && task.status !== 'running') {
      markAsRead.mutate(taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task?.status]);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-700 px-6 py-4">
        <StatusIndicator status={task.status} className="h-3 w-3" />
        <h1 className="flex-1 truncate text-lg font-semibold">{task.name}</h1>
        <span className="text-sm text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>

      {/* Body (placeholder) */}
      <div className="flex-1 overflow-auto p-6">
        {/* Task prompt */}
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-400">Prompt</h2>
          <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm">{task.prompt}</pre>
          </div>
        </div>

        {/* Placeholder message */}
        <div className="rounded-lg border border-dashed border-neutral-700 p-8 text-center">
          <p className="mb-2 text-neutral-400">Agent session will appear here</p>
          <p className="text-sm text-neutral-600">Agent integration coming in Phase 2.3</p>
        </div>
      </div>
    </div>
  );
}
