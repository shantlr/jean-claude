import { useQuery } from '@tanstack/react-query';

import { api, type AzureDevOpsWorkItem } from '@/lib/api';

export function useWorkItems(params: {
  providerId: string;
  projectId: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
  };
}) {
  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: [
      'work-items',
      params.providerId,
      params.projectId,
      params.filters,
    ],
    queryFn: () => api.azureDevOps.queryWorkItems(params),
    enabled: !!params.providerId && !!params.projectId,
    staleTime: 60_000,
  });
}
