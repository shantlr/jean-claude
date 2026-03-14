import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useTrackedPipelines(projectId: string) {
  return useQuery({
    queryKey: ['tracked-pipelines', projectId],
    queryFn: () => api.trackedPipelines.list(projectId),
    staleTime: 60_000,
  });
}

export function useToggleTrackedPipeline(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.trackedPipelines.toggle(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
    },
  });
}

export function useDiscoverPipelines(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.trackedPipelines.discover(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
    },
  });
}
