import { createFileRoute, Navigate } from '@tanstack/react-router';

import { useProjectTasks } from '@/hooks/use-tasks';

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectIndex,
});

function ProjectIndex() {
  const { projectId } = Route.useParams();
  const { data: tasks, isLoading } = useProjectTasks(projectId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  // Redirect to first task if any exist
  if (tasks && tasks.length > 0) {
    return (
      <Navigate
        to="/projects/$projectId/tasks/$taskId"
        params={{ projectId, taskId: tasks[0].id }}
        replace
      />
    );
  }

  // Empty state
  return (
    <div className="flex h-full flex-col items-center justify-center text-neutral-500">
      <p className="mb-2 text-lg">No tasks yet</p>
      <p className="text-sm">Create a new task to get started</p>
    </div>
  );
}
