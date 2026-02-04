import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  api,
  type AzureDevOpsPullRequest,
  type AzureDevOpsPullRequestDetails,
  type AzureDevOpsCommit,
  type AzureDevOpsFileChange,
  type AzureDevOpsCommentThread,
} from '@/lib/api';

import { useProject } from './use-projects';

// Helper to get repo info from project
function useProjectRepoInfo(projectId: string) {
  const { data: project } = useProject(projectId);

  if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId) {
    return null;
  }

  return {
    providerId: project.repoProviderId,
    projectId: project.repoProjectId,
    repoId: project.repoId,
  };
}

export function usePullRequests(
  projectId: string,
  status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsPullRequest[]>({
    queryKey: ['pull-requests', projectId, status],
    queryFn: () =>
      api.azureDevOps.listPullRequests({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        status,
      }),
    enabled: !!repoInfo,
    staleTime: 60_000,
  });
}

// Extended PR type with project info for "all projects" view
export type PullRequestWithProject = AzureDevOpsPullRequest & {
  projectId: string;
  projectName: string;
  projectColor: string;
};

export function useAllProjectsPullRequests(
  projects: Array<{
    id: string;
    name: string;
    color: string;
    repoProviderId: string | null;
    repoProjectId: string | null;
    repoId: string | null;
  }>,
  status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
) {
  // Filter to only projects with repo configured
  const projectsWithRepo = projects.filter(
    (p) => p.repoProviderId && p.repoProjectId && p.repoId,
  );

  return useQuery<PullRequestWithProject[]>({
    queryKey: [
      'all-projects-pull-requests',
      status,
      projectsWithRepo.map((p) => p.id),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        projectsWithRepo.map(async (project) => {
          try {
            const prs = await api.azureDevOps.listPullRequests({
              providerId: project.repoProviderId!,
              projectId: project.repoProjectId!,
              repoId: project.repoId!,
              status,
            });
            return prs.map((pr) => ({
              ...pr,
              projectId: project.id,
              projectName: project.name,
              projectColor: project.color,
            }));
          } catch {
            // If one project fails, don't fail the entire query
            return [];
          }
        }),
      );
      // Flatten and sort by creation date (newest first)
      return results
        .flat()
        .sort(
          (a, b) =>
            new Date(b.creationDate).getTime() -
            new Date(a.creationDate).getTime(),
        );
    },
    enabled: projectsWithRepo.length > 0,
    staleTime: 60_000,
  });
}

export function usePullRequest(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsPullRequestDetails>({
    queryKey: ['pull-request', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 30_000,
  });
}

export function usePullRequestCommits(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsCommit[]>({
    queryKey: ['pull-request-commits', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestCommits({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 60_000,
  });
}

export function usePullRequestChanges(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsFileChange[]>({
    queryKey: ['pull-request-changes', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestChanges({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 60_000,
  });
}

export function usePullRequestFileContent(
  projectId: string,
  prId: number,
  filePath: string,
  version: 'base' | 'head',
) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<string>({
    queryKey: ['pull-request-file-content', projectId, prId, filePath, version],
    queryFn: () =>
      api.azureDevOps.getPullRequestFileContent({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        filePath,
        version,
      }),
    enabled: !!repoInfo && prId > 0 && !!filePath,
    staleTime: 300_000, // 5 minutes - file content doesn't change often
  });
}

export function usePullRequestThreads(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsCommentThread[]>({
    queryKey: ['pull-request-threads', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestThreads({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 30_000,
  });
}

export function useAddPullRequestComment(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (content: string) =>
      api.azureDevOps.addPullRequestComment({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-threads', projectId, prId],
      });
    },
  });
}

export function useAddPullRequestFileComment(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: {
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) =>
      api.azureDevOps.addPullRequestFileComment({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-threads', projectId, prId],
      });
    },
  });
}
