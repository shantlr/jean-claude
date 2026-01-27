import { useMutation } from '@tanstack/react-query';

import { api, AzureDevOpsOrganization } from '@/lib/api';

export function useGetAzureDevOpsOrganizations() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (token: string) => api.azureDevOps.getOrganizations(token),
  });
}
