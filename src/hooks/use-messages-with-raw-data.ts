import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useMessagesWithRawData(taskId: string | undefined) {
  return useQuery({
    queryKey: ['messagesWithRawData', taskId],
    queryFn: () => api.agent.getMessagesWithRawData(taskId!),
    enabled: !!taskId,
  });
}
