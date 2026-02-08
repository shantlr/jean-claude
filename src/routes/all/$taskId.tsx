import { createFileRoute } from '@tanstack/react-router';

import { TaskPanel } from '@/features/task/ui-task-panel';

export const Route = createFileRoute('/all/$taskId')({
  component: AllTaskPanel,
});

function AllTaskPanel() {
  const { taskId } = Route.useParams();

  return <TaskPanel taskId={taskId} />;
}
