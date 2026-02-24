import { useProject } from '@/hooks/use-projects';
import { useTask } from '@/hooks/use-tasks';

export function useTaskRootPath(taskId: string) {
  const { data: task, isLoading: isTaskLoading } = useTask(taskId);
  const projectId = task?.worktreePath ? '' : (task?.projectId ?? '');
  const { data: project, isLoading: isProjectLoading } = useProject(projectId);

  const rootPath = task?.worktreePath ?? project?.path ?? null;

  return {
    rootPath,
    isLoading: isTaskLoading || (!!projectId && isProjectLoading),
  };
}
