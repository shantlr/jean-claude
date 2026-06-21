import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AgentMigrationExecuteResult,
  AgentMigrationPreviewResult,
} from '@shared/agent-management-types';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { api } from '@/lib/api';



export const managedAgentsQueryKeys = {
  all: ['managedAgents'] as const,
  content: (agentPath: string) =>
    [...managedAgentsQueryKeys.all, 'content', agentPath] as const,
};

const sourcesQueryKeys = {
  all: ['sources'] as const,
};

export function useManagedAgents() {
  return useQuery({
    queryKey: managedAgentsQueryKeys.all,
    queryFn: () => api.agentManagement.getAll(),
    staleTime: 30_000,
  });
}

export function useAgentContent(agentPath: string | null) {
  return useQuery({
    queryKey: managedAgentsQueryKeys.content(agentPath ?? ''),
    queryFn: () => api.agentManagement.getContent(agentPath!),
    enabled: !!agentPath,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      enabledBackends: AgentBackendType[];
      name: string;
      description: string;
      content: string;
    }) => api.agentManagement.create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { agentPath: string; content: string }) =>
      api.agentManagement.update(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: sourcesQueryKeys.all });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentPath: string) => api.agentManagement.delete(agentPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: sourcesQueryKeys.all });
    },
  });
}

export function useDisableAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentPath,
      backendType,
    }: {
      agentPath: string;
      backendType: AgentBackendType;
    }) => api.agentManagement.disable(agentPath, backendType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
    },
  });
}

export function useEnableAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentPath,
      backendType,
    }: {
      agentPath: string;
      backendType: AgentBackendType;
    }) => api.agentManagement.enable(agentPath, backendType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
    },
  });
}

export function useLegacyAgentMigrationPreview() {
  return useMutation<AgentMigrationPreviewResult>({
    mutationFn: () => api.agentManagement.migrationPreview(),
  });
}

export function useHasLegacyAgents() {
  return useQuery<boolean>({
    queryKey: [...managedAgentsQueryKeys.all, 'hasLegacy'] as const,
    queryFn: async () => {
      const result = await api.agentManagement.migrationPreview();
      return result.items.length > 0;
    },
  });
}

export function useLegacyAgentMigrationExecute() {
  const queryClient = useQueryClient();
  return useMutation<AgentMigrationExecuteResult, Error, { itemIds: string[] }>(
    {
      mutationFn: (params) => api.agentManagement.migrationExecute(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: managedAgentsQueryKeys.all });
      },
    },
  );
}
