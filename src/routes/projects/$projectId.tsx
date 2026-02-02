import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useNavigationStore } from '@/stores/navigation';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const setProjectFilter = useNavigationStore((s) => s.setProjectFilter);

  // Sync project filter to current project
  useEffect(() => {
    setProjectFilter(projectId);
  }, [projectId, setProjectFilter]);

  return <Outlet />;
}
