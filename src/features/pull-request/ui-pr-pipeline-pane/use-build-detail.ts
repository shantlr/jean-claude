import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AzureBuildDetail } from '@shared/pipeline-types';

export function useBuildDetail(params: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  refetchInterval?: number | false;
}) {
  const {
    providerId,
    azureProjectId,
    buildId,
    refetchInterval = false,
  } = params;

  return useQuery<AzureBuildDetail>({
    queryKey: ['build-detail', providerId, azureProjectId, buildId],
    queryFn: () =>
      api.pipelines.getBuild({ providerId, azureProjectId, buildId }),
    staleTime: 10_000,
    refetchInterval,
  });
}
