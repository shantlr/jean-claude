import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useValue } from '@legendapp/state/react';


import {
  api,
  type AzureDevOpsComment,
  type AzureDevOpsCommentThread,
  type AzureDevOpsCommit,
  type AzureDevOpsFileChange,
  type AzureDevOpsPolicyEvaluation,
  type AzureDevOpsPullRequest,
  type AzureDevOpsPullRequestDetails,
  type AzureDevOpsWorkItem,
} from '@/lib/api';
import {
  ingestPullRequest,
  patchPullRequestSnapshot,
  pullRequestResourceKey,
  selectPullRequest,
} from '@/cache/domains/pull-requests';
import { cache$ } from '@/cache/cache-store';
import type { FeedItem } from '@shared/feed-types';
import { markDocumentStale } from '@/cache/cache-actions';
import type { NewWorkActivityEvent } from '@shared/work-activity-types';
import { parseAzureOrgId } from '@shared/work-activity-utils';
import type { Provider } from '@shared/types';
import type { ReviewerVoteStatus } from '@shared/azure-devops-types';
import { updateFeedDocument } from '@/cache/feed-cache';



import { useProject } from './use-projects';
import { useSetting } from './use-settings';

// Helper to get repo info from project
export type PullRequestRepoInfo = {
  projectName: string;
  providerId: string;
  projectId: string;
  repoId: string;
};

function useProjectRepoInfo(projectId: string): PullRequestRepoInfo | null {
  const { data: project } = useProject(projectId);

  if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId) {
    return null;
  }

  return {
    projectName: project.name,
    providerId: project.repoProviderId,
    projectId: project.repoProjectId,
    repoId: project.repoId,
  };
}

function useResolvedRepoInfo(
  projectId: string,
  repoInfo?: PullRequestRepoInfo,
) {
  const projectRepoInfo = useProjectRepoInfo(projectId);
  return repoInfo ?? projectRepoInfo;
}

function getPrQueryKey(
  projectId: string,
  prId: number,
  repoInfo: PullRequestRepoInfo | null,
) {
  return repoInfo
    ? [projectId, repoInfo.providerId, repoInfo.projectId, repoInfo.repoId, prId]
    : [projectId, prId];
}

function getCachedProviderBaseUrl(
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: string,
): string | null {
  const cachedProvider = queryClient.getQueryData<Provider>([
    'providers',
    providerId,
  ]);
  if (cachedProvider?.baseUrl) {
    return cachedProvider.baseUrl;
  }

  return (
    queryClient
      .getQueryData<Provider[]>(['providers'])
      ?.find((provider) => provider.id === providerId)?.baseUrl ?? null
  );
}

function buildPullRequestActivityEvent({
  queryClient,
  projectId,
  prId,
  repoInfo,
  type,
  azureOrgId,
  workItems,
  metadata = {},
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  projectId: string;
  prId: number;
  repoInfo: NonNullable<ReturnType<typeof useProjectRepoInfo>>;
  type: 'pr_comment_added' | 'pr_approved';
  azureOrgId: string | null;
  workItems: AzureDevOpsWorkItem[];
  metadata?: Record<string, unknown>;
}): NewWorkActivityEvent {
  const cachedPr = queryClient.getQueryData<AzureDevOpsPullRequestDetails>([
    'pull-request',
    projectId,
    prId,
  ]);
  const workItemIds = workItems.map((workItem) => String(workItem.id));

  return {
    occurredAt: new Date().toISOString(),
    type,
    projectId,
    projectName: repoInfo.projectName,
    providerId: repoInfo.providerId,
    azureOrgId,
    azureProjectId: repoInfo.projectId,
    repoId: repoInfo.repoId,
    taskId: null,
    taskTitle: null,
    stepId: null,
    promptSnippet: null,
    promptLength: null,
    workItemIds,
    workItems: workItems.map((workItem) => ({
      id: String(workItem.id),
      providerId: repoInfo.providerId,
      azureOrgId,
      azureProjectId: repoInfo.projectId,
    })),
    pullRequest: {
      providerId: repoInfo.providerId,
      azureOrgId,
      azureProjectId: repoInfo.projectId,
      repoId: repoInfo.repoId,
      pullRequestId: String(prId),
      title: cachedPr?.title ?? null,
      url: cachedPr?.url ?? null,
    },
    metadata,
  };
}

function recordPrActivity({
  queryClient,
  projectId,
  prId,
  repoInfo,
  type,
  metadata,
  workActivityEnabled,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  projectId: string;
  prId: number;
  repoInfo: NonNullable<ReturnType<typeof useProjectRepoInfo>>;
  type: 'pr_comment_added' | 'pr_approved';
  metadata?: Record<string, unknown>;
  workActivityEnabled: boolean;
}) {
  if (!workActivityEnabled) {
    return;
  }

  void (async () => {
    const workItemsQueryKey = ['pull-request-work-items', projectId, prId];
    let azureOrgId: string | null = null;
    let workItems: AzureDevOpsWorkItem[] = [];

    try {
      const provider = await api.providers.findById(repoInfo.providerId);
      azureOrgId = parseAzureOrgId(provider?.baseUrl ?? null);
    } catch (error) {
      console.error('Failed to fetch provider for PR activity log:', error);
      azureOrgId = parseAzureOrgId(
        getCachedProviderBaseUrl(queryClient, repoInfo.providerId),
      );
    }

    try {
      workItems = await api.azureDevOps.getPullRequestWorkItems({
        providerId: repoInfo.providerId,
        projectId: repoInfo.projectId,
        repoId: repoInfo.repoId,
        pullRequestId: prId,
      });
    } catch (error) {
      console.error('Failed to fetch PR work items for activity log:', error);
      workItems =
        queryClient.getQueryData<AzureDevOpsWorkItem[]>(workItemsQueryKey) ??
        [];
    }

    const event = buildPullRequestActivityEvent({
      queryClient,
      projectId,
      prId,
      repoInfo,
      type,
      azureOrgId,
      workItems,
      metadata,
    });

    try {
      await api.workActivity.record(event);
    } catch (error) {
      console.error('Failed to record PR activity:', error);
    }
  })().catch((error) => {
    console.error('Failed to prepare PR activity log:', error);
  });
}

function getReviewerVoteStatus(vote: number): ReviewerVoteStatus {
  if (vote >= 10) return 'approved';
  if (vote > 0) return 'approved-with-suggestions';
  if (vote <= -10) return 'rejected';
  if (vote < 0) return 'waiting';
  return 'none';
}

function updateReviewerVote<T extends AzureDevOpsPullRequest | undefined>(
  pullRequest: T,
  reviewerId: string,
  voteStatus: ReviewerVoteStatus,
): T {
  if (!pullRequest) return pullRequest;

  return {
    ...pullRequest,
    reviewers: pullRequest.reviewers.map((reviewer) =>
      reviewer.id === reviewerId ? { ...reviewer, voteStatus } : reviewer,
    ),
  };
}

export function updateFeedPullRequest(
  projectId: string,
  prId: number,
  patch: Partial<FeedItem>,
) {
  updateFeedDocument('pullRequests', (items) =>
    items.map((item) =>
      item.projectId === projectId && item.pullRequestId === prId
        ? { ...item, ...patch }
        : item,
    ),
  );
}

function markFeedPullRequestsStale() {
  markDocumentStale('feed:pullRequests');
}

function markFeedWorkItemsStale() {
  markDocumentStale('feed:workItems');
}

export function updateFeedItemsForPullRequest(
  projectId: string,
  pr: AzureDevOpsPullRequestDetails,
) {
  updateFeedDocument('pullRequests', (items) =>
    items
      .map((item) =>
        item.projectId === projectId && item.pullRequestId === pr.id
          ? {
              ...item,
              title: pr.title,
              isDraft: pr.isDraft,
              pullRequestUrl: pr.url,
              pullRequestMergeStatus: pr.mergeStatus,
            }
          : item,
      )
      .filter(
        (item) =>
          item.projectId !== projectId ||
          item.pullRequestId !== pr.id ||
          pr.status === 'active',
      ),
  );

  const updateTaskItem = (item: FeedItem): FeedItem => {
    const children = item.children?.map(updateTaskItem);
    const withChildren = children ? { ...item, children } : item;

    if (
      item.source !== 'task' ||
      item.projectId !== projectId ||
      item.pullRequestId !== pr.id
    ) {
      return withChildren;
    }

    return {
      ...withChildren,
      workItemPrStatus: pr.status,
      pullRequestUrl: pr.url,
      pullRequestMergeStatus: pr.mergeStatus,
    };
  };

  updateFeedDocument('tasks', (items) =>
    items.map(updateTaskItem),
  );

  updateFeedDocument('workItems', (items) =>
    items.map((item) =>
      item.projectId === projectId &&
      (item.workItemPrId === pr.id || item.workItemPrUrl === pr.url)
        ? {
            ...item,
            workItemPrId: pr.id,
            workItemPrStatus: pr.status,
            workItemPrUrl: pr.url,
          }
        : item,
    ),
  );
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

export function usePullRequest(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);
  const queryKey = ['pull-request', ...getPrQueryKey(projectId, prId, repoInfo)];

  const query = useQuery<AzureDevOpsPullRequestDetails>({
    queryKey,
    queryFn: async () => {
      const pr = await api.azureDevOps.getPullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      });

      ingestPullRequest({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequest: pr,
      });
      if (!repoInfoOverride) {
        updateFeedItemsForPullRequest(projectId, pr);
      }

      return pr;
    },
    enabled: !!repoInfo && prId > 0,
    staleTime: 30_000,
  });

  return query;
}

export function useCachedPullRequest(projectId: string, prId?: number) {
  const repoInfo = useProjectRepoInfo(projectId);
  const resourceKey =
    repoInfo && prId
      ? pullRequestResourceKey({
          providerId: repoInfo.providerId,
          repoId: repoInfo.repoId,
          pullRequestId: prId,
        })
      : null;
  const data = useValue(() => {
    if (!repoInfo || !prId) {
      return undefined;
    }

    return selectPullRequest({
      providerId: repoInfo.providerId,
      repoId: repoInfo.repoId,
      pullRequestId: prId,
    });
  });
  const meta = useValue(() =>
    resourceKey ? cache$.resources[resourceKey].get() : undefined,
  );

  return {
    data,
    isLoading: !!repoInfo && !!prId && !data && meta?.status === 'loading',
  };
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
      ingestPullRequest({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequest: updatedPr,
      });
      queryClient.setQueryData(['pull-request', projectId, prId], updatedPr);
      updateFeedItemsForPullRequest(projectId, updatedPr);
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
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);
  const queryKey = ['pull-request', ...getPrQueryKey(projectId, prId, repoInfo)];

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
      ingestPullRequest({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequest: updatedPr,
      });
      queryClient.setQueryData(queryKey, updatedPr);
      if (!repoInfoOverride) {
        queryClient.invalidateQueries({ queryKey: ['pull-requests', projectId] });
        queryClient.invalidateQueries({
          queryKey: ['all-projects-pull-requests'],
        });
      }
    },
  });
}

export function useUploadPullRequestAttachment(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

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

export function usePullRequestCommits(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsCommit[]>({
    queryKey: ['pull-request-commits', ...getPrQueryKey(projectId, prId, repoInfo)],
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

export function usePullRequestChanges(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsFileChange[]>({
    queryKey: ['pull-request-changes', ...getPrQueryKey(projectId, prId, repoInfo)],
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

export function useCommitChanges(
  projectId: string,
  commitId: string | null,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsFileChange[]>({
    queryKey: ['commit-changes', projectId, repoInfo, commitId],
    queryFn: () =>
      api.azureDevOps.getCommitChanges({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        commitId: commitId!,
      }),
    enabled: !!repoInfo && !!commitId,
    staleTime: 300_000, // 5 min — commit changes are immutable
  });
}

export function useCommitFileContent(
  projectId: string,
  commitId: string | null,
  filePath: string | null,
  version: 'current' | 'parent',
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<string>({
    queryKey: ['commit-file-content', projectId, repoInfo, commitId, filePath, version],
    queryFn: () =>
      api.azureDevOps.getFileContentAtCommit({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        commitId: commitId!,
        filePath: filePath!,
        version,
      }),
    enabled: !!repoInfo && !!commitId && !!filePath,
    staleTime: 300_000,
  });
}

export function usePullRequestFileContent(
  projectId: string,
  prId: number,
  filePath: string,
  version: 'base' | 'head',
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<string>({
    queryKey: [
      'pull-request-file-content',
      ...getPrQueryKey(projectId, prId, repoInfo),
      filePath,
      version,
    ],
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

export function usePullRequestThreads(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsCommentThread[]>({
    queryKey: ['pull-request-threads', ...getPrQueryKey(projectId, prId, repoInfo)],
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

export function usePullRequestWorkItems(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsWorkItem[]>({
    queryKey: ['pull-request-work-items', ...getPrQueryKey(projectId, prId, repoInfo)],
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

export function useLinkWorkItemToPr(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

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
        queryKey: ['pull-request-work-items', ...getPrQueryKey(projectId, prId, repoInfo)],
      });
      markFeedWorkItemsStale();
    },
  });
}

export function useUnlinkWorkItemFromPr(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

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
        queryKey: ['pull-request-work-items', ...getPrQueryKey(projectId, prId, repoInfo)],
      });
      markFeedWorkItemsStale();
    },
  });
}

export function useAddPullRequestComment(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);
  const { data: workActivitySetting } = useSetting('workActivity');

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
        queryKey: ['pull-request-threads', ...getPrQueryKey(projectId, prId, repoInfo)],
      });
      markFeedPullRequestsStale();
      if (!repoInfoOverride) {
        recordPrActivity({
          queryClient,
          projectId,
          prId,
          repoInfo: repoInfo!,
          type: 'pr_comment_added',
          metadata: { commentKind: 'top-level' },
          workActivityEnabled: workActivitySetting?.enabled !== false,
        });
      }
    },
  });
}

export function useAddPullRequestFileComment(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);
  const { data: workActivitySetting } = useSetting('workActivity');

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
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-threads', ...getPrQueryKey(projectId, prId, repoInfo)],
      });
      markFeedPullRequestsStale();
      if (!repoInfoOverride) {
        recordPrActivity({
          queryClient,
          projectId,
          prId,
          repoInfo: repoInfo!,
          type: 'pr_comment_added',
          metadata: { commentKind: 'file', filePath: params.filePath },
          workActivityEnabled: workActivitySetting?.enabled !== false,
        });
      }
    },
  });
}

export function useAddThreadReply(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);
  const { data: workActivitySetting } = useSetting('workActivity');

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
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({
        queryKey: ['pull-request-threads', projectId, prId],
      });
      markFeedPullRequestsStale();
      recordPrActivity({
        queryClient,
        projectId,
        prId,
        repoInfo: repoInfo!,
        type: 'pr_comment_added',
        metadata: { commentKind: 'reply', threadId: params.threadId },
        workActivityEnabled: workActivitySetting?.enabled !== false,
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
      markFeedPullRequestsStale();
    },
  });
}

export function useDeleteThreadComment(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<void, Error, { threadId: number; commentId: number }>({
    mutationFn: (params) =>
      api.azureDevOps.deleteThreadComment({
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
      markFeedPullRequestsStale();
    },
  });
}

export function useSetThreadCommentLike(projectId: string, prId: number) {
  const queryClient = useQueryClient();
  const repoInfo = useProjectRepoInfo(projectId);

  return useMutation<
    void,
    Error,
    { threadId: number; commentId: number; liked: boolean }
  >({
    mutationFn: (params) =>
      api.azureDevOps.setThreadCommentLike({
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
      markFeedPullRequestsStale();
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
      markFeedPullRequestsStale();
    },
  });
}

export function usePullRequestPolicyEvaluations(
  projectId: string,
  prId: number,
  options?: { refetchInterval?: number | false; enabled?: boolean },
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useQuery<AzureDevOpsPolicyEvaluation[]>({
    queryKey: [
      'pull-request-policy-evaluations',
      ...getPrQueryKey(projectId, prId, repoInfo),
    ],
    queryFn: () =>
      api.azureDevOps.getPullRequestPolicyEvaluations({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        pullRequestId: prId,
      }),
    enabled: !!repoInfo && prId > 0 && (options?.enabled ?? true),
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRequeuePolicyEvaluation(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

  return useMutation<void, Error, { evaluationId: string }>({
    mutationFn: (params) =>
      api.azureDevOps.requeuePolicyEvaluation({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        ...params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'pull-request-policy-evaluations',
          ...getPrQueryKey(projectId, prId, repoInfo),
        ],
      });
    },
  });
}

export function useCurrentAzureUser(
  projectId: string,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);

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
  const { data: workActivitySetting } = useSetting('workActivity');

  return useMutation({
    mutationFn: (params: { reviewerId: string; vote: number }) =>
      api.azureDevOps.votePullRequest({
        providerId: repoInfo!.providerId,
        projectId: repoInfo!.projectId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        ...params,
      }),
    onSuccess: (_result, params) => {
      const voteStatus = getReviewerVoteStatus(params.vote);
      const cachedPr = selectPullRequest({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
      });
      const updatedCachedPr = updateReviewerVote(
        cachedPr,
        params.reviewerId,
        voteStatus,
      );

      if (updatedCachedPr) {
        patchPullRequestSnapshot({
          providerId: repoInfo!.providerId,
          repoId: repoInfo!.repoId,
          pullRequestId: prId,
          patch: { reviewers: updatedCachedPr.reviewers },
        });
      }

      const isApprovedByMe =
        voteStatus === 'approved' || voteStatus === 'approved-with-suggestions';
      updateFeedPullRequest(projectId, prId, {
        isApprovedByMe,
        attention: isApprovedByMe ? 'pr-approved-by-me' : 'review-requested',
      });
      if (isApprovedByMe) {
        recordPrActivity({
          queryClient,
          projectId,
          prId,
          repoInfo: repoInfo!,
          type: 'pr_approved',
          metadata: { voteStatus },
          workActivityEnabled: workActivitySetting?.enabled !== false,
        });
      }

      queryClient.setQueryData<AzureDevOpsPullRequestDetails | undefined>(
        ['pull-request', projectId, prId],
        (old) => updateReviewerVote(old, params.reviewerId, voteStatus),
      );
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
    },
  });
}

export function useSetAutoComplete(
  projectId: string,
  prId: number,
  repoInfoOverride?: PullRequestRepoInfo,
) {
  const queryClient = useQueryClient();
  const repoInfo = useResolvedRepoInfo(projectId, repoInfoOverride);
  const queryKey = ['pull-request', ...getPrQueryKey(projectId, prId, repoInfo)];

  return useMutation({
    mutationFn: (params: {
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
        autoCompleteIgnoreConfigIds?: number[];
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
      ingestPullRequest({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequest: updatedPr,
      });
      queryClient.setQueryData(queryKey, updatedPr);
      if (!repoInfoOverride) {
        queryClient.invalidateQueries({ queryKey: ['pull-requests', projectId] });
        queryClient.invalidateQueries({
          queryKey: ['all-projects-pull-requests'],
        });
      }
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
      patchPullRequestSnapshot({
        providerId: repoInfo!.providerId,
        repoId: repoInfo!.repoId,
        pullRequestId: prId,
        patch: { isDraft: false },
      });
      queryClient.setQueryData<AzureDevOpsPullRequestDetails | undefined>(
        ['pull-request', projectId, prId],
        (old) => (old ? { ...old, isDraft: false } : old),
      );
      updateFeedPullRequest(projectId, prId, { isDraft: false });
      queryClient.invalidateQueries({
        queryKey: ['pull-request', projectId, prId],
      });
      queryClient.invalidateQueries({
        queryKey: ['pull-requests', projectId],
      });
      markFeedPullRequestsStale();
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
