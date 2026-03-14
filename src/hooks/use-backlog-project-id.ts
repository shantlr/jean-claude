import { useParams } from '@tanstack/react-router';

import { useTask } from '@/hooks/use-tasks';
import {
  useCurrentVisibleProject,
  useNavigationStore,
} from '@/stores/navigation';

/**
 * Resolves the projectId for the backlog feature.
 * When on a specific project route, returns that projectId.
 * When on /all/:taskId, resolves the task's projectId.
 * Falls back to the last visited project when on /all without a task.
 * Returns undefined when no project can be determined.
 */
export function useBacklogProjectId(): string | undefined {
  const { projectId } = useCurrentVisibleProject();
  const params = useParams({ strict: false });
  const lastLocation = useNavigationStore((s) => s.lastLocation);

  const allViewTaskId =
    projectId === 'all' && typeof params.taskId === 'string'
      ? params.taskId
      : '';
  const { data: allViewTask } = useTask(allViewTaskId);

  if (projectId !== 'all') return projectId;
  if (allViewTask?.projectId) return allViewTask.projectId;
  if (lastLocation.type === 'project') return lastLocation.projectId;
  return undefined;
}
