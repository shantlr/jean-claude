import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="flex h-full">
      {/* Project Sidebar will go here */}
      <div className="w-64 border-r border-neutral-700 p-4">
        <h2 className="font-semibold">Project: {projectId}</h2>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
