import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { TaskPanel } from '@/features/task/ui-task-panel';

export const Route = createFileRoute('/all/$taskId')({
  component: AllTaskPanel,
});

function AllTaskPanel() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();

  const handleNavigateAfterDelete = () => {
    // Navigate to the root which will redirect appropriately
    navigate({ to: '/' });
  };

  return (
    <TaskPanel
      taskId={taskId}
      onNavigateAfterDelete={handleNavigateAfterDelete}
    />
  );
}
