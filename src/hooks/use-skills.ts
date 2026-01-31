import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const skillsQueryKeys = {
  all: ['skills'] as const,
  byTask: (taskId: string) => [...skillsQueryKeys.all, 'task', taskId] as const,
};

export function useSkills(taskId: string | undefined) {
  return useQuery({
    queryKey: skillsQueryKeys.byTask(taskId ?? ''),
    queryFn: () => api.tasks.getSkills(taskId!),
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // Skills don't change often, cache for 5 minutes
  });
}
