import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FeedItem, ProjectPriority } from '@shared/feed-types';
import {
  getProjectIndexIds,
  ingestProject,
  ingestProjects,
  projectResourceKey,
  PROJECTS_INDEX_KEY,
  selectProject,
  selectProjectColor,
  selectProjectLogoPath,
  selectProjectName,
  selectProjectPrPriority,
  selectProjects,
  selectProjectWorkItemPriority,
  setProjectIndexIds,
} from '@/cache/domains/projects';
import {
  invalidateFeedResource,
  invalidateFeedResources,
} from '@/cache/feed-cache';
import { NewProject, Project, UpdateProject } from '@shared/types';
import { api } from '@/lib/api';
import { useCacheResource } from '@/cache/use-cache-resource';



const EMPTY_PROJECT_LOGO_FIELDS: {
  name: string | undefined;
  color: string | undefined;
  logoPath: string | null | undefined;
} = {
  name: undefined,
  color: undefined,
  logoPath: undefined,
};

export function useProjects() {
  return useCacheResource({
    key: PROJECTS_INDEX_KEY,
    load: api.projects.findAll,
    ingest: ingestProjects,
    select: selectProjects,
    staleTime: Infinity,
  });
}

export function useProject(id: string) {
  return useCacheResource({
    key: projectResourceKey(id),
    load: () => api.projects.findById(id),
    ingest: (project) => {
      if (project) {
        ingestProject(project);
      }
    },
    enabled: !!id,
    select: () => selectProject(id),
  });
}

export function useProjectLogoFields(projectId: string) {
  const { data } = useCacheResource<
    Project | undefined,
    typeof EMPTY_PROJECT_LOGO_FIELDS
  >({
    key: projectResourceKey(projectId),
    load: () => api.projects.findById(projectId),
    ingest: (project) => {
      if (project) {
        ingestProject(project);
      }
    },
    enabled: !!projectId,
    select: () => {
      if (!projectId || !selectProject(projectId)) {
        return EMPTY_PROJECT_LOGO_FIELDS;
      }

      return {
        name: selectProjectName(projectId),
        color: selectProjectColor(projectId),
        logoPath: selectProjectLogoPath(projectId),
      };
    },
  });

  return data ?? EMPTY_PROJECT_LOGO_FIELDS;
}

export function useProjectFeedPriority(
  projectId: string,
  source: FeedItem['source'],
) {
  const { data } = useCacheResource<
    Project | undefined,
    ProjectPriority | undefined
  >({
    key: projectResourceKey(projectId),
    load: () => api.projects.findById(projectId),
    ingest: (project) => {
      if (project) {
        ingestProject(project);
      }
    },
    enabled: !!projectId,
    select: () => {
      if (!projectId || !selectProject(projectId)) {
        return undefined;
      }

      if (source === 'pull-request') {
        return selectProjectPrPriority(projectId);
      }

      if (source === 'work-item') {
        return selectProjectWorkItemPriority(projectId);
      }

      return undefined;
    },
  });

  return data;
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
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({
        queryKey: ['project-is-git-repository', id],
      });
      queryClient.invalidateQueries({ queryKey: ['project-branches', id] });
      queryClient.invalidateQueries({
        queryKey: ['project-current-branch', id],
      });
      if (
        data.showPrsInFeed !== undefined ||
        data.repoProviderId !== undefined ||
        data.repoProjectId !== undefined ||
        data.repoId !== undefined
      ) {
        invalidateFeedResource(queryClient, 'pullRequests');
      }
      if (
        data.showWorkItemsInFeed !== undefined ||
        data.workItemProviderId !== undefined ||
        data.workItemProjectId !== undefined ||
        data.workItemProjectName !== undefined
      ) {
        invalidateFeedResource(queryClient, 'workItems');
      }
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
      invalidateFeedResources(queryClient, [
        'tasks',
        'pullRequests',
        'workItems',
      ]);
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

      const previousProjectIds = getProjectIndexIds();

      if (previousProjectIds) {
        const orderedIdSet = new Set(orderedIds);
        if (
          orderedIds.length === previousProjectIds.length &&
          previousProjectIds.every((id) => orderedIdSet.has(id))
        ) {
          setProjectIndexIds(orderedIds);
        }
      }

      return { previousProjects, previousProjectIds };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
      if (context?.previousProjectIds) {
        setProjectIndexIds(context.previousProjectIds);
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
