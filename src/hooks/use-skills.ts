import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Skill } from '@shared/skill-types';

export const skillsQueryKeys = {
  all: ['skills'] as const,
  byTask: (taskId: string) => [...skillsQueryKeys.all, 'task', taskId] as const,
  byProject: (projectId: string) =>
    [...skillsQueryKeys.all, 'project', projectId] as const,
};

// tasks:getSkills removed — return empty until step-aware skill discovery lands
export function useSkills(_taskId: string | undefined) {
  return useQuery({
    queryKey: skillsQueryKeys.byTask(''),
    queryFn: (): Promise<Skill[]> => Promise.resolve([]),
    initialData: [] as Skill[],
    staleTime: Infinity,
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
