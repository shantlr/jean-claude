import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AddGitHubSourceParams,
  InstallSourceItemsParams,
  UpdateSourceInstallParams,
} from '@shared/source-management-types';
import { api } from '@/lib/api';
import { managedAgentsQueryKeys } from '@/hooks/use-managed-agents';
import { managedSkillsQueryKeys } from '@/hooks/use-managed-skills';
import { skillsQueryKeys } from '@/hooks/use-skills';


export const sourcesQueryKeys = {
  all: ['sources'] as const,
  list: () => [...sourcesQueryKeys.all, 'list'] as const,
};

export function useSources() {
  return useQuery({
    queryKey: sourcesQueryKeys.list(),
    queryFn: () => api.sourceManagement.list(),
    staleTime: 30_000,
  });
}

export function useAddGithubSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: AddGitHubSourceParams) =>
      api.sourceManagement.addGithub(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKeys.all });
    },
  });
}

export function useRefreshSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.sourceManagement.refresh(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKeys.all });
    },
  });
}

export function useInstallSourceItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: InstallSourceItemsParams) =>
      api.sourceManagement.installItems(params),
    onSuccess: () => {
      invalidateSourcesAndInstalledInventory(queryClient);
    },
  });
}

export function useUpdateSourceInstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UpdateSourceInstallParams) =>
      api.sourceManagement.updateInstall(params),
    onSuccess: () => {
      invalidateSourcesAndInstalledInventory(queryClient);
    },
  });
}

export function useRemoveSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.sourceManagement.remove(sourceId),
    onSuccess: () => {
      invalidateSourcesAndInstalledInventory(queryClient);
    },
  });
}

function invalidateSourcesAndInstalledInventory(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: sourcesQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: managedSkillsQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
}
