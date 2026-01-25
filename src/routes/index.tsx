import { createFileRoute, redirect } from '@tanstack/react-router';

import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigation';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { lastLocation, setLastLocation } = useNavigationStore.getState();

    if (lastLocation.projectId) {
      // Validate project still exists
      const project = await api.projects.findById(lastLocation.projectId);

      if (project) {
        if (lastLocation.taskId) {
          // Validate task still exists
          const task = await api.tasks.findById(lastLocation.taskId);
          if (task) {
            throw redirect({
              to: '/projects/$projectId/tasks/$taskId',
              params: {
                projectId: lastLocation.projectId,
                taskId: lastLocation.taskId,
              },
            });
          }
        }
        // Task invalid or not set, go to project
        throw redirect({
          to: '/projects/$projectId',
          params: { projectId: lastLocation.projectId },
        });
      }

      // Project invalid, clear and fall through
      setLastLocation(null, null);
    }

    throw redirect({ to: '/settings' });
  },
});
