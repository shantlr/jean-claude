import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useReorderTrackedPipelines(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.trackedPipelines.reorder(projectId, orderedIds),
    onMutate: async (orderedIds) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ['tracked-pipelines', projectId],
        }),
        queryClient.cancelQueries({ queryKey: ['tracked-pipelines-all'] }),
      ]);

      const previousProjectPipelines = queryClient.getQueryData<
        TrackedPipeline[]
      >(['tracked-pipelines', projectId]);
      const previousAllPipelines = queryClient.getQueryData<TrackedPipeline[]>([
        'tracked-pipelines-all',
      ]);

      if (previousProjectPipelines) {
        const projectPipelineMap = new Map(
          previousProjectPipelines.map((pipeline) => [pipeline.id, pipeline]),
        );
        const reordered = orderedIds.flatMap((id, index) => {
          const pipeline = projectPipelineMap.get(id);
          return pipeline ? [{ ...pipeline, sortOrder: index }] : [];
        });

        if (reordered.length === previousProjectPipelines.length) {
          queryClient.setQueryData(['tracked-pipelines', projectId], reordered);
        }
      }

      if (previousAllPipelines) {
        const allPipelineMap = new Map(
          previousAllPipelines.map((pipeline) => [pipeline.id, pipeline]),
        );
        const reorderedProjectPipelines = orderedIds.flatMap((id, index) => {
          const pipeline = allPipelineMap.get(id);
          return pipeline ? [{ ...pipeline, sortOrder: index }] : [];
        });

        const projectPipelineCount = previousAllPipelines.filter(
          (pipeline) => pipeline.projectId === projectId,
        ).length;

        if (reorderedProjectPipelines.length !== projectPipelineCount) {
          return { previousProjectPipelines, previousAllPipelines };
        }

        let nextProjectPipelineIndex = 0;
        const reorderedAllPipelines = previousAllPipelines.map((pipeline) => {
          if (pipeline.projectId !== projectId) return pipeline;
          const nextPipeline =
            reorderedProjectPipelines[nextProjectPipelineIndex] ?? pipeline;
          nextProjectPipelineIndex += 1;
          return nextPipeline;
        });

        queryClient.setQueryData(
          ['tracked-pipelines-all'],
          reorderedAllPipelines,
        );
      }

      return { previousProjectPipelines, previousAllPipelines };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previousProjectPipelines) {
        queryClient.setQueryData(
          ['tracked-pipelines', projectId],
          context.previousProjectPipelines,
        );
      }
      if (context?.previousAllPipelines) {
        queryClient.setQueryData(
          ['tracked-pipelines-all'],
          context.previousAllPipelines,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['tracked-pipelines', projectId],
      });
      queryClient.invalidateQueries({ queryKey: ['tracked-pipelines-all'] });
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
