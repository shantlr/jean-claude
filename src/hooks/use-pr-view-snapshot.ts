import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useRecordPrView() {
  return useMutation({
    mutationFn: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => api.prSnapshots.record(params),
  });
}
