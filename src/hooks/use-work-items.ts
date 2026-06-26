import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  api,
  type AzureDevOpsIteration,
  type AzureDevOpsPullRequestStatus,
  type AzureDevOpsUser,
  type AzureDevOpsWorkItem,
  type AzureDevOpsWorkItemState,
  type WorkItemComment,
  type WorkItemHistoryEntry,
} from '@/lib/api';
import { useToastStore } from '@/stores/toasts';

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

export function useWorkItemsByIds(params: {
  providerId: string | null;
  workItemIds: number[];
}) {
  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: ['work-items-by-ids', params.providerId, params.workItemIds],
    queryFn: async () => {
      const results = await Promise.allSettled(
        params.workItemIds.map((workItemId) =>
          api.azureDevOps.getWorkItemById({
            providerId: params.providerId!,
            workItemId,
          }),
        ),
      );
      return results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((item): item is AzureDevOpsWorkItem => !!item);
    },
    enabled: !!params.providerId && params.workItemIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useLinkedPullRequestStatuses(params: {
  providerId: string | null;
  linkedPrs: Array<{ prId: number; projectId: string; repoId: string }>;
}) {
  return useQuery<AzureDevOpsPullRequestStatus[]>({
    queryKey: ['linked-pull-request-statuses', params.providerId, params.linkedPrs],
    queryFn: () =>
      api.azureDevOps.getPullRequestStatuses({
        providerId: params.providerId!,
        linkedPrs: params.linkedPrs,
      }),
    enabled: !!params.providerId && params.linkedPrs.length > 0,
    staleTime: 60_000,
  });
}

export function useWorkItemStates(params: {
  providerId: string | null;
  projectName: string | null;
  workItemType: string | null;
}) {
  return useQuery<AzureDevOpsWorkItemState[]>({
    queryKey: [
      'work-item-states',
      params.providerId,
      params.projectName,
      params.workItemType,
    ],
    queryFn: () =>
      api.azureDevOps.getWorkItemStates({
        providerId: params.providerId!,
        projectName: params.projectName!,
        workItemType: params.workItemType!,
      }),
    enabled:
      !!params.providerId && !!params.projectName && !!params.workItemType,
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

export function useWorkItemHistory(params: {
  providerId: string | null;
  projectName: string | null;
  workItemId: number | null;
}) {
  return useQuery<WorkItemHistoryEntry[]>({
    queryKey: [
      'work-item-history',
      params.providerId,
      params.projectName,
      params.workItemId,
    ],
    queryFn: () =>
      api.azureDevOps.getWorkItemHistory({
        providerId: params.providerId!,
        projectName: params.projectName!,
        workItemId: params.workItemId!,
      }),
    enabled: !!params.providerId && !!params.projectName && !!params.workItemId,
    staleTime: 60_000,
  });
}

export function useAddWorkItemComment() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
      text: string;
    }) => api.azureDevOps.addWorkItemComment(params),
    onSuccess: (comment, variables) => {
      queryClient.setQueryData<WorkItemComment[]>(
        [
          'work-item-comments',
          variables.providerId,
          variables.projectName,
          [variables.workItemId],
        ],
        (existing) => {
          if (!existing) return existing;
          return [comment, ...existing.filter((c) => c.id !== comment.id)];
        },
      );
      queryClient.invalidateQueries({
        queryKey: [
          'work-item-comments',
          variables.providerId,
          variables.projectName,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-item-history', variables.providerId],
      });
    },
    onError: () => {
      addToast({ message: 'Failed to add work item comment', type: 'error' });
    },
  });
}

export function useRelatedTestCases(params: {
  providerId: string | null;
  projectName: string | null;
  workItemId: number | null;
}) {
  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: [
      'related-test-cases',
      params.providerId,
      params.projectName,
      params.workItemId,
    ],
    queryFn: () =>
      api.azureDevOps.getRelatedTestCases({
        providerId: params.providerId!,
        projectName: params.projectName!,
        workItemId: params.workItemId!,
      }),
    enabled: !!params.providerId && !!params.projectName && !!params.workItemId,
    staleTime: 5 * 60_000,
  });
}

export type TestCaseWithSteps = {
  id: number;
  title: string;
  steps?: Array<{ action: string; expectedResult: string }>;
};

/**
 * Fetch related test cases for multiple work items at once.
 * Returns a map of workItemId -> test cases with their steps.
 */
export function useRelatedTestCasesForWorkItems(params: {
  providerId: string | null;
  projectName: string | null;
  workItemIds: number[];
}) {
  return useQuery<Record<number, TestCaseWithSteps[]>>({
    queryKey: [
      'related-test-cases-batch',
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
        return {};
      const results = await Promise.all(
        params.workItemIds.map(async (workItemId) => {
          const testCases = await api.azureDevOps.getRelatedTestCases({
            providerId: params.providerId!,
            projectName: params.projectName!,
            workItemId,
          });
          return [
            workItemId,
            testCases.map((tc) => ({
              id: tc.id,
              title: tc.fields.title,
              steps: tc.testSteps,
            })),
          ] as const;
        }),
      );
      return Object.fromEntries(results);
    },
    enabled:
      !!params.providerId &&
      !!params.projectName &&
      params.workItemIds.length > 0,
    staleTime: 5 * 60_000,
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

export function useUpdateWorkItemState() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      workItemId: number;
      state: string;
    }) => api.azureDevOps.updateWorkItemState(params),
    onMutate: async (variables) => {
      const queryKey = [
        'work-item',
        variables.providerId,
        variables.workItemId,
      ];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AzureDevOpsWorkItem | null>(
        queryKey,
      );
      if (previous) {
        queryClient.setQueryData<AzureDevOpsWorkItem>(queryKey, {
          ...previous,
          fields: { ...previous.fields, state: variables.state },
        });
      }
      return { previous, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      addToast({ message: 'Failed to update work item status', type: 'error' });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['work-item', variables.providerId, variables.workItemId],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-item-history', variables.providerId],
      });
      queryClient.invalidateQueries({
        queryKey: ['work-items'],
      });
      queryClient.invalidateQueries({
        queryKey: ['pull-request-work-items'],
      });
    },
  });
}
