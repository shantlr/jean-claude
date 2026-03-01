import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

export const managedSkillsQueryKeys = {
  all: ['managedSkills'] as const,
  byBackend: (backendType: AgentBackendType, projectPath?: string) =>
    [...managedSkillsQueryKeys.all, backendType, projectPath ?? ''] as const,
  content: (skillPath: string) =>
    [...managedSkillsQueryKeys.all, 'content', skillPath] as const,
};

export function useManagedSkills(
  backendType: AgentBackendType,
  projectPath?: string,
) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.byBackend(backendType, projectPath),
    queryFn: () => api.skillManagement.getAll(backendType, projectPath),
    staleTime: 30_000,
  });
}

export function useSkillContent(skillPath: string | null) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.content(skillPath ?? ''),
    queryFn: () => api.skillManagement.getContent(skillPath!),
    enabled: !!skillPath,
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      backendType: AgentBackendType;
      scope: SkillScope;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => api.skillManagement.create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      skillPath: string;
      backendType: AgentBackendType;
      name?: string;
      description?: string;
      content?: string;
    }) => api.skillManagement.update(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      skillPath,
      backendType,
    }: {
      skillPath: string;
      backendType: AgentBackendType;
    }) => api.skillManagement.delete(skillPath, backendType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useDisableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      skillPath,
      backendType,
    }: {
      skillPath: string;
      backendType: AgentBackendType;
    }) => api.skillManagement.disable(skillPath, backendType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      skillPath,
      backendType,
    }: {
      skillPath: string;
      backendType: AgentBackendType;
    }) => api.skillManagement.enable(skillPath, backendType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}
