import { createFileRoute, Outlet } from '@tanstack/react-router';

import { ProjectSidebar } from '@/layout/ui-project-sidebar';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
