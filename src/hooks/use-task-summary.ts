import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type TaskSummary } from '@/lib/api';

export function useTaskSummary(taskId: string | null) {
  return useQuery<TaskSummary | undefined>({
    queryKey: ['task-summary', taskId],
    queryFn: () => {
      if (!taskId) {
        return undefined;
      }
      return api.tasks.summary.get(taskId);
    },
    enabled: !!taskId,
    // Summaries don't change often, avoid refetching on every focus
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useGenerateSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.summary.generate(taskId),
    onSuccess: (summary) => {
      // Update the cache with the new summary
      queryClient.setQueryData(['task-summary', summary.taskId], summary);
      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({
        queryKey: ['task-summary', summary.taskId],
      });
    },
  });
}
