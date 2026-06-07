import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { NewProject, Project, UpdateProject } from '@shared/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.findAll,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.findById(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProject) => api.projects.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProject }) =>
      api.projects.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({
        queryKey: ['project-is-git-repository', id],
      });
      queryClient.invalidateQueries({ queryKey: ['project-branches', id] });
      queryClient.invalidateQueries({
        queryKey: ['project-current-branch', id],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useUploadProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      sourcePath,
    }: {
      projectId: string;
      sourcePath: string;
    }) => api.projects.uploadLogo(projectId, sourcePath),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-logo'] });
      queryClient.invalidateQueries({
        queryKey: ['project-logo-history', projectId],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useGenerateProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      customPrompt,
    }: {
      projectId: string;
      customPrompt?: string;
    }) => api.projects.generateLogo(projectId, customPrompt),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-logo'] });
      queryClient.invalidateQueries({
        queryKey: ['project-logo-history', projectId],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useGeneratedProjectLogos(projectId: string) {
  return useQuery({
    queryKey: ['project-logo-history', projectId],
    queryFn: () => api.projects.listGeneratedLogos(projectId),
    enabled: !!projectId,
  });
}

export function useSelectGeneratedProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      logoId,
    }: {
      projectId: string;
      logoId: string;
    }) => api.projects.selectGeneratedLogo(projectId, logoId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-logo'] });
      queryClient.invalidateQueries({
        queryKey: ['project-logo-history', projectId],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useDeleteGeneratedProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      logoId,
    }: {
      projectId: string;
      logoId: string;
    }) => api.projects.deleteGeneratedLogo(projectId, logoId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-logo'] });
      queryClient.invalidateQueries({
        queryKey: ['project-logo-history', projectId],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useRegenerateProjectSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.projects.regenerateSummary(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
    },
  });
}

export function useProjectFeatureMap(projectId: string | null) {
  return useQuery({
    queryKey: ['project-feature-map', projectId],
    queryFn: () => {
      if (!projectId) return null;
      return api.projects.getFeatureMap(projectId);
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectFeatureMapTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.projects.createFeatureMapTask(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
    },
  });
}

export function useRemoveProjectLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.projects.removeLogo(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-logo'] });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({
        queryKey: ['project-is-git-repository', id],
      });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}

export function useDeleteProjectWorktreesFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.projects.deleteWorktreesFolder(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
}

export function useReorderProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => api.projects.reorder(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });

      const previousProjects = queryClient.getQueryData<Project[]>([
        'projects',
      ]);

      if (previousProjects) {
        const projectMap = new Map(
          previousProjects.map((project) => [project.id, project]),
        );
        const reordered = orderedIds.flatMap((id) => {
          const project = projectMap.get(id);
          return project ? [project] : [];
        });

        if (reordered.length === previousProjects.length) {
          queryClient.setQueryData(['projects'], reordered);
        }
      }

      return { previousProjects };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProjectBranches(projectId: string | null) {
  return useQuery({
    queryKey: ['project-branches', projectId],
    queryFn: () => {
      if (!projectId) return [];
      return api.projects.getBranches(projectId);
    },
    enabled: !!projectId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useProjectCurrentBranch(projectId: string | null) {
  return useQuery({
    queryKey: ['project-current-branch', projectId],
    queryFn: () => {
      if (!projectId) return null;
      return api.projects.getCurrentBranch(projectId);
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 2000, // Consider stale after 2 seconds
  });
}

export function useProjectIsGitRepository(projectId: string | null) {
  return useQuery({
    queryKey: ['project-is-git-repository', projectId],
    queryFn: () => {
      if (!projectId) return false;
      return api.projects.isGitRepository(projectId);
    },
    enabled: !!projectId,
    staleTime: 30000,
  });
}
