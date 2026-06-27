import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';

import { useProject } from '@/hooks/use-projects';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Loading...
      </div>
    );
  }

  if (project?.archivedAt) {
    return <Navigate to="/all" replace />;
  }

  return <Outlet />;
}
