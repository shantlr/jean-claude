import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useProjectTasks } from '@/hooks/use-tasks';
import { useLastTaskForProject } from '@/stores/navigation';

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectIndex,
});

function ProjectIndex() {
  const { projectId } = Route.useParams();
  const { data: tasks, isLoading } = useProjectTasks(projectId);
  const { lastTaskId, clearTaskNavHistoryState } =
    useLastTaskForProject(projectId);

  const lastTaskNotFound = lastTaskId
    ? !!tasks?.find((t) => t.id === lastTaskId)
    : false;

  useEffect(() => {
    if (lastTaskNotFound) {
      clearTaskNavHistoryState(lastTaskId);
    }
  }, [clearTaskNavHistoryState, lastTaskId, lastTaskNotFound]);

  if (isLoading) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Loading...
      </div>
    );
  }

  // Redirect to last viewed task or first task if any exist
  if (tasks && tasks.length > 0) {
    // Check if lastTaskId is valid for this project
    const lastTask = lastTaskId ? tasks.find((t) => t.id === lastTaskId) : null;

    const targetTaskId = lastTask?.id ?? tasks[0].id;

    return (
      <Navigate
        to="/projects/$projectId/tasks/$taskId"
        params={{ projectId, taskId: targetTaskId }}
        replace
      />
    );
  }

  // Empty state
  return (
    <div className="text-ink-3 flex h-full flex-col items-center justify-center">
      <p className="mb-2 text-lg">No tasks yet</p>
      <p className="text-sm">Create a new task to get started</p>
    </div>
  );
}
