import { useMutation } from '@tanstack/react-query';

import { api, AzureDevOpsOrganization } from '@/lib/api';

// Get organizations using an existing token (by ID)
export function useGetAzureDevOpsOrganizations() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (tokenId: string) => api.azureDevOps.getOrganizations(tokenId),
  });
}

// Validate a raw token and get organizations (for token creation flow)
export function useValidateAzureDevOpsToken() {
  return useMutation<AzureDevOpsOrganization[], Error, string>({
    mutationFn: (token: string) => api.azureDevOps.validateToken(token),
  });
}

// Get token expiration from Azure DevOps API
export function useGetAzureDevOpsTokenExpiration() {
  return useMutation<string | null, Error, string>({
    mutationFn: (tokenId: string) => api.azureDevOps.getTokenExpiration(tokenId),
  });
}
