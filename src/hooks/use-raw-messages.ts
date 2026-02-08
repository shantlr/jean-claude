import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useRawMessages(taskId: string | undefined) {
  return useQuery({
    queryKey: ['rawMessages', taskId],
    queryFn: () => api.agent.getRawMessages(taskId!),
    enabled: !!taskId,
  });
}
