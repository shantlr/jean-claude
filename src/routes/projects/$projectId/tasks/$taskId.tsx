import { createFileRoute } from '@tanstack/react-router';

import { TaskPanel } from '@/features/task/ui-task-panel';

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  component: ProjectTaskPanel,
});

function ProjectTaskPanel() {
  const { taskId } = Route.useParams();

  return <TaskPanel taskId={taskId} />;
}
