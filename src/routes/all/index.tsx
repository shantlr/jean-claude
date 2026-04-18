import { createFileRoute, Navigate } from '@tanstack/react-router';

import { useAllActiveTasks } from '@/hooks/use-tasks';

export const Route = createFileRoute('/all/')({
  component: AllIndex,
});

function AllIndex() {
  const { data: activeTasks = [], isLoading } = useAllActiveTasks();

  if (isLoading) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Loading...
      </div>
    );
  }

  if (activeTasks.length > 0) {
    return (
      <Navigate
        to="/all/$taskId"
        params={{ taskId: activeTasks[0].id }}
        replace
      />
    );
  }

  return <Navigate to="/projects/new" replace />;
}
