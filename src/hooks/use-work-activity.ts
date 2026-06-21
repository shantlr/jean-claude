import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { WorkActivityWeekParams } from '@shared/work-activity-types';

export function useWorkActivity(params: WorkActivityWeekParams) {
  return useQuery({
    queryKey: ['work-activity', params],
    queryFn: () => api.workActivity.getRange(params),
  });
}

export function useDeleteWorkActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params?: { before?: string }) => {
      if (params?.before !== undefined) {
        return api.workActivity.deleteBefore(params.before);
      }
      return api.workActivity.deleteAll();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-activity'] });
    },
  });
}
