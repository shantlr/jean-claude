import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useMessagesWithRawData({
  taskId,
  stepId,
}: {
  taskId: string | undefined;
  stepId: string | null;
}) {
  return useQuery({
    queryKey: ['messagesWithRawData', taskId, stepId],
    queryFn: () => api.agent.getMessagesWithRawData(taskId!, stepId!),
    enabled: !!taskId && !!stepId,
  });
}
