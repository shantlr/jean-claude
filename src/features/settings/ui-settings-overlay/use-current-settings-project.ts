import { useParams } from '@tanstack/react-router';

import { useProjects } from '@/hooks/use-projects';
import { useTask } from '@/hooks/use-tasks';
import { useCurrentVisibleProject } from '@/stores/navigation';

export function useCurrentSettingsProject() {
  const routeParams = useParams({ strict: false });
  const routeTaskId =
    typeof routeParams.taskId === 'string' ? routeParams.taskId : '';
  const { projectId: visibleProjectId } = useCurrentVisibleProject();
  const { data: currentTask } = useTask(routeTaskId);
  const { data: projects = [] } = useProjects();

  const projectId =
    visibleProjectId === 'all'
      ? (currentTask?.projectId ?? 'all')
      : visibleProjectId;

  const currentProject =
    projectId !== 'all'
      ? (projects.find((project) => project.id === projectId) ?? null)
      : null;

  return { currentProject };
}
