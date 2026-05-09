import { useQuery } from '@tanstack/react-query';

import {
  api,
  type AzureDevOpsWorkItem,
  type AzureDevOpsUser,
  type AzureDevOpsIteration,
  type WorkItemComment,
} from '@/lib/api';

export function useWorkItems(params: {
  providerId: string;
  projectId: string;
  projectName: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
    excludeWorkItemTypes?: string[];
    searchText?: string;
    iterationPath?: string;
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

export function useIterations(params: {
  providerId: string;
  projectName: string;
}) {
  return useQuery<AzureDevOpsIteration[]>({
    queryKey: ['iterations', params.providerId, params.projectName],
    queryFn: () => api.azureDevOps.getIterations(params),
    enabled: !!params.providerId && !!params.projectName,
    staleTime: 5 * 60_000, // 5 minutes - iterations change infrequently
  });
}

export function useWorkItemById(params: {
  providerId: string | null;
  workItemId: number | null;
}) {
  return useQuery({
    queryKey: ['work-item', params.providerId, params.workItemId],
    queryFn: () =>
      api.azureDevOps.getWorkItemById({
        providerId: params.providerId!,
        workItemId: params.workItemId!,
      }),
    enabled: !!params.providerId && !!params.workItemId,
    staleTime: 5 * 60_000,
  });
}

export function useWorkItemComments(params: {
  providerId: string | null;
  projectName: string | null;
  workItemIds: number[];
}) {
  return useQuery<WorkItemComment[]>({
    queryKey: [
      'work-item-comments',
      params.providerId,
      params.projectName,
      params.workItemIds,
    ],
    queryFn: async () => {
      if (
        !params.providerId ||
        !params.projectName ||
        params.workItemIds.length === 0
      )
        return [];
      const results = await Promise.all(
        params.workItemIds.map((workItemId) =>
          api.azureDevOps.getWorkItemComments({
            providerId: params.providerId!,
            projectName: params.projectName!,
            workItemId,
          }),
        ),
      );
      return results.flat();
    },
    enabled:
      !!params.providerId &&
      !!params.projectName &&
      params.workItemIds.length > 0,
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
