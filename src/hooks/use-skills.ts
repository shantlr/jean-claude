import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const skillsQueryKeys = {
  all: ['skills'] as const,
  byTask: (taskId: string) => [...skillsQueryKeys.all, 'task', taskId] as const,
  byProject: (projectId: string) =>
    [...skillsQueryKeys.all, 'project', projectId] as const,
};

export function useSkills(taskId: string | undefined) {
  return useQuery({
    queryKey: skillsQueryKeys.byTask(taskId ?? ''),
    queryFn: () => api.tasks.getSkills(taskId!),
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // Skills don't change often, cache for 5 minutes
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
