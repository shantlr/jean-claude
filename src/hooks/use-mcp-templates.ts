// src/hooks/use-mcp-templates.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '../../shared/mcp-types';

// MCP Templates
export function useMcpTemplates() {
  return useQuery({
    queryKey: ['mcpTemplates'],
    queryFn: () => api.mcpTemplates.findAll(),
  });
}

export function useMcpTemplate(id: string) {
  return useQuery({
    queryKey: ['mcpTemplates', id],
    queryFn: () => api.mcpTemplates.findById(id),
    enabled: !!id,
  });
}

export function useMcpPresets() {
  return useQuery({
    queryKey: ['mcpPresets'],
    queryFn: () => api.mcpTemplates.getPresets(),
  });
}

export function useEnabledMcpTemplates(projectId: string) {
  return useQuery({
    queryKey: ['mcpTemplates', 'enabled', projectId],
    queryFn: () => api.mcpTemplates.getEnabledForProject(projectId),
    enabled: !!projectId,
  });
}

export function useCreateMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewMcpServerTemplate) => api.mcpTemplates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

export function useUpdateMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMcpServerTemplate }) =>
      api.mcpTemplates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

export function useDeleteMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.mcpTemplates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

// Project MCP Overrides
export function useProjectMcpOverrides(projectId: string) {
  return useQuery({
    queryKey: ['projectMcpOverrides', projectId],
    queryFn: () => api.projectMcpOverrides.findByProjectId(projectId),
    enabled: !!projectId,
  });
}

export function useUpsertProjectMcpOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProjectMcpOverride) =>
      api.projectMcpOverrides.upsert(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectMcpOverrides', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['mcpTemplates', 'enabled', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['unifiedMcpServers', variables.projectId],
      });
    },
  });
}

export function useDeleteProjectMcpOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      mcpTemplateId,
    }: {
      projectId: string;
      mcpTemplateId: string;
    }) => api.projectMcpOverrides.delete(projectId, mcpTemplateId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectMcpOverrides', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['mcpTemplates', 'enabled', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['unifiedMcpServers', variables.projectId],
      });
    },
  });
}

// Unified MCP Servers
export function useUnifiedMcpServers(projectId: string, projectPath: string) {
  return useQuery({
    queryKey: ['unifiedMcpServers', projectId, projectPath],
    queryFn: () => api.unifiedMcp.getServers(projectId, projectPath),
    enabled: !!projectId && !!projectPath,
  });
}

export function useActivateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectPath,
      name,
      command,
    }: {
      projectPath: string;
      name: string;
      command: string;
    }) => api.unifiedMcp.activate(projectPath, name, command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unifiedMcpServers'] });
    },
  });
}

export function useDeactivateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectPath,
      name,
    }: {
      projectPath: string;
      name: string;
    }) => api.unifiedMcp.deactivate(projectPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unifiedMcpServers'] });
    },
  });
}

export function useSubstituteVariables() {
  return useMutation({
    mutationFn: ({
      commandTemplate,
      userVariables,
      context,
    }: {
      commandTemplate: string;
      userVariables: Record<string, string>;
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      };
    }) =>
      api.unifiedMcp.substituteVariables(
        commandTemplate,
        userVariables,
        context,
      ),
  });
}
