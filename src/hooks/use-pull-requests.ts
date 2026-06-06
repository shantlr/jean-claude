import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  api,
  type AzureDevOpsPullRequest,
  type AzureDevOpsPullRequestDetails,
  type AzureDevOpsCommit,
  type AzureDevOpsFileChange,
  type AzureDevOpsCommentThread,
  type AzureDevOpsComment,
  type AzureDevOpsPolicyEvaluation,
  type AzureDevOpsWorkItem,
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

export function useUpdatePullRequestTitle(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (title: string) =>
      api.azureDevOps.updatePullRequestTitle({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        title,
      }),
    onSuccess: (updatedPr) => {
      queryClient.setQueryData(['pull-request', projectId, prId], updatedPr);
      queryClient.invalidateQueries({ queryKey: ['pull-requests', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['all-projects-pull-requests'],
      });
    },
  });
}

export function useUpdatePullRequestDescription(
  projectId: string,
  prId: number,
) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (description: string) =>
      api.azureDevOps.updatePullRequestDescription({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        description,
      }),
    onSuccess: (updatedPr) => {
      queryClient.setQueryData(['pull-request', projectId, prId], updatedPr);
      queryClient.invalidateQueries({ queryKey: ['pull-requests', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['all-projects-pull-requests'],
      });
    },
  });
}

export function useUploadPullRequestAttachment(
  projectId: string,
  prId: number,
) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: {
      fileName: string;
      mimeType: string;
      dataBase64: string;
    }) =>
      api.azureDevOps.uploadPullRequestAttachment({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
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

export function usePullRequestWorkItems(projectId: string, prId: number) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: ['pull-request-work-items', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestWorkItems({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 60_000,
  });
}

export function useLinkWorkItemToPr(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (workItemId: number) =>
      api.azureDevOps.linkWorkItemToPr({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        workItemId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-work-items', projectId, prId],
      });
    },
  });
}

export function useUnlinkWorkItemFromPr(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (workItemId: number) =>
      api.azureDevOps.unlinkWorkItemFromPr({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        workItemId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-work-items', projectId, prId],
      });
    },
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

export function useAddThreadReply(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<
    AzureDevOpsComment,
    Error,
    { threadId: number; content: string }
  >({
    mutationFn: (params) =>
      api.azureDevOps.addThreadReply({
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

export function useUpdateThreadComment(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<
    AzureDevOpsComment,
    Error,
    { threadId: number; commentId: number; content: string }
  >({
    mutationFn: (params) =>
      api.azureDevOps.updateThreadComment({
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

export function useUpdateThreadStatus(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<void, Error, { threadId: number; status: string }>({
    mutationFn: (params) =>
      api.azureDevOps.updateThreadStatus({
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

export function usePullRequestPolicyEvaluations(
  projectId: string,
  prId: number,
  options?: { refetchInterval?: number | false },
) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery<AzureDevOpsPolicyEvaluation[]>({
    queryKey: ['pull-request-policy-evaluations', projectId, prId],
    queryFn: () =>
      api.azureDevOps.getPullRequestPolicyEvaluations({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0,
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRequeuePolicyEvaluation(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<void, Error, { evaluationId: string }>({
    mutationFn: (params) =>
      api.azureDevOps.requeuePolicyEvaluation({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-policy-evaluations', projectId, prId],
      });
    },
  });
}

export function useCurrentAzureUser(projectId: string) {
  const repoInfo = useProjectRepoInfo(projectId);

  return useQuery({
    queryKey: ['azure-current-user', repoInfo?.providerId],
    queryFn: () => api.azureDevOps.getCurrentUser(repoInfo!.providerId),
    enabled: !!repoInfo,
    staleTime: Infinity,
  });
}

export function useVotePullRequest(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: { reviewerId: string; vote: number }) =>
      api.azureDevOps.votePullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
    },
  });
}

export function useSetAutoComplete(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: (params: {
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
      };
    }) =>
      api.azureDevOps.setPullRequestAutoComplete({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: (updatedPr) => {
      queryClient.setQueryData(['pull-request', projectId, prId], updatedPr);
      queryClient.invalidateQueries({ queryKey: ['pull-requests', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['all-projects-pull-requests'],
      });
    },
  });
}

export function usePublishPullRequest(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation({
    mutationFn: () =>
      api.azureDevOps.publishPullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pull-requests', projectId],
      });
    },
  });
}

// Policy type ID for "Limit merge types"
const MERGE_TYPE_POLICY_ID = 'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab';

export type MergeStrategy =
  | 'noFastForward'
  | 'squash'
  | 'rebase'
  | 'rebaseMerge';

const ALL_MERGE_STRATEGIES: MergeStrategy[] = [
  'noFastForward',
  'squash',
  'rebase',
  'rebaseMerge',
];

export function getAllowedMergeStrategies(
  evaluations: AzureDevOpsPolicyEvaluation[],
): MergeStrategy[] {
  const mergePolicy = evaluations.find(
    (e) => e.configuration.type.id === MERGE_TYPE_POLICY_ID,
  );

  if (!mergePolicy) {
    return ALL_MERGE_STRATEGIES;
  }

  const settings = mergePolicy.configuration.settings;
  const allowed: MergeStrategy[] = [];
  if (settings.allowNoFastForward) allowed.push('noFastForward');
  if (settings.allowSquash) allowed.push('squash');
  if (settings.allowRebase) allowed.push('rebase');
  if (settings.allowRebaseMerge) allowed.push('rebaseMerge');

  return allowed.length > 0 ? allowed : ALL_MERGE_STRATEGIES;
}

export const MERGE_STRATEGY_LABELS: Record<MergeStrategy, string> = {
  noFastForward: 'Merge (no fast-forward)',
  squash: 'Squash commit',
  rebase: 'Rebase',
  rebaseMerge: 'Rebase and merge',
};
