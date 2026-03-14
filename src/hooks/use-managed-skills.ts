import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { skillsQueryKeys } from '@/hooks/use-skills';
import { api } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  LegacySkillMigrationExecuteResult,
  LegacySkillMigrationPreviewResult,
  RegistrySearchResult,
  RegistrySkillContent,
  SkillScope,
} from '@shared/skill-types';

export const managedSkillsQueryKeys = {
  all: ['managedSkills'] as const,
  unified: (projectPath?: string) =>
    [...managedSkillsQueryKeys.all, 'unified', projectPath ?? ''] as const,
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

export function useAllManagedSkills(projectPath?: string) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.unified(projectPath),
    queryFn: () => api.skillManagement.getAllUnified(projectPath),
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
      enabledBackends: AgentBackendType[];
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
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
      });
    },
  });
}

export function useLegacySkillMigrationPreview() {
  return useMutation<LegacySkillMigrationPreviewResult>({
    mutationFn: () => api.skillManagement.migrationPreview(),
  });
}

export function useHasLegacySkills() {
  return useQuery<boolean>({
    queryKey: [...managedSkillsQueryKeys.all, 'hasLegacy'] as const,
    queryFn: async () => {
      const result = await api.skillManagement.migrationPreview();
      return result.items.length > 0;
    },
  });
}

export function useLegacySkillMigrationExecute() {
  const queryClient = useQueryClient();
  return useMutation<
    LegacySkillMigrationExecuteResult,
    Error,
    { itemIds: string[] }
  >({
    mutationFn: (params) => api.skillManagement.migrationExecute(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
      });
    },
  });
}

// --- Skills Registry (skills.sh) ---

const registryQueryKeys = {
  search: (query: string) => ['skillRegistry', 'search', query] as const,
  content: (source: string | null, skillId: string | null) =>
    ['skillRegistry', 'content', source, skillId] as const,
};

export function useRegistrySearch(query: string) {
  return useQuery<RegistrySearchResult>({
    queryKey: registryQueryKeys.search(query),
    queryFn: () => api.skillManagement.registrySearch(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useRegistrySkillContent(
  source: string | null,
  skillId: string | null,
) {
  return useQuery<RegistrySkillContent>({
    queryKey: registryQueryKeys.content(source, skillId),
    queryFn: () => api.skillManagement.registryFetchContent(source!, skillId!),
    enabled: !!source && !!skillId,
    staleTime: 5 * 60_000,
  });
}

export function useInstallRegistrySkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      source: string;
      skillId: string;
      enabledBackends: AgentBackendType[];
    }) => api.skillManagement.registryInstall(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: skillsQueryKeys.all,
      });
    },
  });
}
