import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import type { TrackedPipeline } from '@shared/pipeline-types';

export function useTrackedPipelines(projectId: string) {
  return useQuery({
    queryKey: ['tracked-pipelines', projectId],
    queryFn: () => api.trackedPipelines.list(projectId),
    staleTime: 60_000,
  });
}

export function useAllTrackedPipelines() {
  return useQuery({
    queryKey: ['tracked-pipelines-all'],
    queryFn: () => api.trackedPipelines.listAll(),
    staleTime: 60_000,
  });
}

export function useAllTrackedPipelinesGrouped() {
  const { data: allPipelines = [], ...rest } = useAllTrackedPipelines();

  const grouped = useMemo(() => {
    const map = new Map<string, TrackedPipeline[]>();
    for (const pipeline of allPipelines) {
      if (!pipeline.visible) continue;
      const existing = map.get(pipeline.projectId);
      if (existing) {
        existing.push(pipeline);
      } else {
        map.set(pipeline.projectId, [pipeline]);
      }
    }
    return map;
  }, [allPipelines]);

  return { ...rest, data: grouped };
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
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines-all'],
      });
    },
  });
}

export function useToggleTrackedPipelineVisible(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      api.trackedPipelines.toggleVisible(id, visible),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines-all'],
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
