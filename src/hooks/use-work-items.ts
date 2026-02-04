import { useQuery } from '@tanstack/react-query';

import { api, type AzureDevOpsWorkItem, type AzureDevOpsUser } from '@/lib/api';

export function useWorkItems(params: {
  providerId: string;
  projectId: string;
  projectName: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
    searchText?: string;
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
    enabled: !!params.providerId && !!params.projectId && !!params.projectName,
    staleTime: 60_000,
  });
}

export function useCurrentAzureUser(providerId: string | null) {
  return useQuery<AzureDevOpsUser>({
    queryKey: ['azure-current-user', providerId],
    queryFn: () => api.azureDevOps.getCurrentUser(providerId!),
    enabled: !!providerId,
    staleTime: 5 * 60_000, // 5 minutes - user info doesn't change often
  });
}
