import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import type {
  AzureBuildRun,
  AzureRelease,
  AzureBuildTimeline,
  AzureReleaseDetail,
  AzureGitRef,
  AzureBuildDefinitionDetail,
  YamlPipelineParameter,
} from '@shared/pipeline-types';

export function usePipelineRuns(params: {
  providerId: string;
  azureProjectId: string;
  definitionId: number;
  kind: 'build' | 'release';
  enabled?: boolean;
}) {
  const {
    providerId,
    azureProjectId,
    definitionId,
    kind,
    enabled = true,
  } = params;

  return useQuery<AzureBuildRun[] | AzureRelease[]>({
    queryKey: ['pipeline-runs', providerId, azureProjectId, definitionId, kind],
    queryFn: () =>
      api.pipelines.listRuns({
        providerId,
        azureProjectId,
        definitionId,
        kind,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export type PipelineRunWithContext = (AzureBuildRun | AzureRelease) & {
  jcProjectId: string;
  kind: 'build' | 'release';
};

export function useAllPipelineRuns(params: {
  pipelines: Array<{
    providerId: string;
    azureProjectId: string;
    definitionId: number;
    kind: 'build' | 'release';
    jcProjectId: string;
  }>;
  enabled?: boolean;
}) {
  const { pipelines, enabled = true } = params;

  const queryKey = [
    'pipeline-runs-all',
    pipelines.map(
      (p) => `${p.providerId}:${p.azureProjectId}:${p.definitionId}:${p.kind}`,
    ),
  ];

  return useQuery<PipelineRunWithContext[]>({
    queryKey,
    queryFn: async () => {
      const results = await Promise.allSettled(
        pipelines.map(async (pipeline) => {
          const runs = await api.pipelines.listRuns({
            providerId: pipeline.providerId,
            azureProjectId: pipeline.azureProjectId,
            definitionId: pipeline.definitionId,
            kind: pipeline.kind,
          });
          return runs.map((run) => ({
            ...run,
            jcProjectId: pipeline.jcProjectId,
            kind: pipeline.kind,
          }));
        }),
      );

      return results
        .filter(
          (r): r is PromiseFulfilledResult<PipelineRunWithContext[]> =>
            r.status === 'fulfilled',
        )
        .flatMap((r) => r.value);
    },
    enabled: enabled && pipelines.length > 0,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useBuildTimeline(params: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  enabled?: boolean;
}) {
  const { providerId, azureProjectId, buildId, enabled = true } = params;

  return useQuery<AzureBuildTimeline>({
    queryKey: ['build-timeline', providerId, azureProjectId, buildId],
    queryFn: () =>
      api.pipelines.getBuildTimeline({ providerId, azureProjectId, buildId }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useBuildLog(params: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  logId: number;
  enabled?: boolean;
}) {
  const { providerId, azureProjectId, buildId, logId, enabled = true } = params;

  return useQuery<string>({
    queryKey: ['build-log', providerId, azureProjectId, buildId, logId],
    queryFn: () =>
      api.pipelines.getBuildLog({ providerId, azureProjectId, buildId, logId }),
    enabled,
    staleTime: 60_000,
  });
}

export function useReleaseDetail(params: {
  providerId: string;
  azureProjectId: string;
  releaseId: number;
  enabled?: boolean;
}) {
  const { providerId, azureProjectId, releaseId, enabled = true } = params;

  return useQuery<AzureReleaseDetail>({
    queryKey: ['release-detail', providerId, azureProjectId, releaseId],
    queryFn: () =>
      api.pipelines.getRelease({ providerId, azureProjectId, releaseId }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useBranches(params: {
  providerId: string;
  azureProjectId: string;
  repoId: string;
  enabled?: boolean;
}) {
  const { providerId, azureProjectId, repoId, enabled = true } = params;

  return useQuery<AzureGitRef[]>({
    queryKey: ['branches', providerId, azureProjectId, repoId],
    queryFn: () =>
      api.pipelines.listBranches({ providerId, azureProjectId, repoId }),
    enabled,
    staleTime: 300_000,
  });
}

export function useBranchNames(params: {
  providerId: string;
  azureProjectId: string;
  repoId: string;
  enabled?: boolean;
}) {
  const { data: branches, ...rest } = useBranches(params);

  const branchNames = useMemo(
    () =>
      (branches ?? []).map((ref) =>
        ref.name.startsWith('refs/heads/')
          ? ref.name.slice('refs/heads/'.length)
          : ref.name,
      ),
    [branches],
  );

  return { ...rest, data: branchNames };
}

export function useBuildDefinitionParams(params: {
  providerId: string;
  azureProjectId: string;
  definitionId: number;
  enabled?: boolean;
}) {
  const { providerId, azureProjectId, definitionId, enabled = true } = params;

  return useQuery<AzureBuildDefinitionDetail>({
    queryKey: [
      'build-definition-params',
      providerId,
      azureProjectId,
      definitionId,
    ],
    queryFn: () =>
      api.pipelines.getDefinitionParams({
        providerId,
        azureProjectId,
        definitionId,
      }),
    enabled,
    staleTime: 300_000,
  });
}

export function useYamlPipelineParameters(params: {
  providerId: string;
  azureProjectId: string;
  repoId: string;
  yamlFilename: string;
  branch: string;
  enabled?: boolean;
}) {
  const {
    providerId,
    azureProjectId,
    repoId,
    yamlFilename,
    branch,
    enabled = true,
  } = params;

  return useQuery<YamlPipelineParameter[]>({
    queryKey: [
      'yaml-pipeline-parameters',
      providerId,
      azureProjectId,
      repoId,
      yamlFilename,
      branch,
    ],
    queryFn: () =>
      api.pipelines.getYamlParameters({
        providerId,
        azureProjectId,
        repoId,
        yamlFilename,
        branch,
      }),
    enabled: enabled && !!yamlFilename && !!repoId,
    staleTime: 60_000, // 1-minute cache (branch content can change)
    placeholderData: (prev) => prev, // keep previous data while refetching on branch change
  });
}

export function useQueueBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      sourceBranch: string;
      parameters?: Record<string, string>;
      templateParameters?: Record<string, string>;
    }) => api.pipelines.queueBuild(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
    },
  });
}

export function useCreateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      description?: string;
    }) => api.pipelines.createRelease(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
    },
  });
}

export function useCancelBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => api.pipelines.cancelBuild(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
      queryClient.invalidateQueries({ queryKey: ['build-timeline'] });
    },
  });
}
