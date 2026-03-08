import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const skillsQueryKeys = {
  all: ['skills'] as const,
  byStep: (taskId: string, stepId?: string) =>
    [...skillsQueryKeys.all, 'step', taskId, stepId ?? ''] as const,
  byProject: (projectId: string) =>
    [...skillsQueryKeys.all, 'project', projectId] as const,
};

/**
 * Fetches enabled skills for a task step.
 * The IPC handler resolves the backend type from the step and the project
 * path from the task's worktree (or its parent project), then returns only
 * skills that are enabled for that backend.
 */
export function useSkills(params: { taskId?: string; stepId?: string }) {
  const { taskId, stepId } = params;

  return useQuery({
    queryKey: skillsQueryKeys.byStep(taskId ?? '', stepId),
    queryFn: () => api.skillManagement.getForStep({ taskId: taskId!, stepId }),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useProjectSkills(projectId: string | undefined) {
  return useQuery({
    queryKey: skillsQueryKeys.byProject(projectId ?? ''),
    queryFn: () => api.projects.getSkills(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Skills don't change often, cache for 5 minutes
  });
}
