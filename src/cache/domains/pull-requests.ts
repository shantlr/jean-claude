import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
} from '@shared/azure-devops-types';

import {
  markResourceStale,
  setIndexResource,
  setResourceSuccess,
} from '../cache-actions';
import { cache$ } from '../cache-store';
import type { CachedPullRequest } from '../cache-types';
import { applyEntityPatch, mergeEntitySnapshot } from '../entity-merge';

type PullRequestIdentity = {
  providerId: string;
  repoId: string;
  pullRequestId: string | number;
};

type PullRequestStatus = 'active' | 'completed' | 'abandoned' | 'all';

type ProjectPullRequestRelation = {
  id: string;
  name: string;
  color: string;
};

type ProjectPullRequestRepoIdentity = ProjectPullRequestRelation & {
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoId: string | null;
};

const PULL_REQUEST_LIST_STATUSES = [
  undefined,
  'active',
  'completed',
  'abandoned',
  'all',
] as const;

export function pullRequestResourceKey({
  providerId,
  repoId,
  pullRequestId,
}: PullRequestIdentity) {
  return `pullRequest:${providerId}:${repoId}:${pullRequestId}`;
}

export function pullRequestEntityKey(identity: PullRequestIdentity) {
  return pullRequestResourceKey(identity);
}

export function pullRequestThreadsResourceKey({
  providerId,
  repoId,
  pullRequestId,
}: PullRequestIdentity) {
  return `pullRequestThreads:${providerId}:${repoId}:${pullRequestId}`;
}

export function projectPullRequestsResourceKey(
  projectId: string,
  status?: PullRequestStatus,
) {
  return status
    ? `pullRequests:project:${projectId}:status:${status}`
    : `pullRequests:project:${projectId}`;
}

export function repoPullRequestsResourceKey({
  providerId,
  repoId,
  status,
}: {
  providerId: string;
  repoId: string;
  status?: PullRequestStatus;
}) {
  return status
    ? `pullRequests:repo:${providerId}:${repoId}:status:${status}`
    : `pullRequests:repo:${providerId}:${repoId}`;
}

export function allProjectsPullRequestsResourceKey({
  projects,
  status,
}: {
  projects: ProjectPullRequestRepoIdentity[];
  status?: PullRequestStatus;
}) {
  const projectKeys = projects
    .map(
      (project) =>
        `${project.id}:${project.repoProviderId ?? ''}:${project.repoProjectId ?? ''}:${project.repoId ?? ''}`,
    )
    .sort()
    .join('|');

  return status
    ? `pullRequests:allProjects:status:${status}:projects:${projectKeys}`
    : `pullRequests:allProjects:projects:${projectKeys}`;
}

export function isAllProjectsPullRequestsResourceKey(key: string) {
  return key.startsWith('pullRequests:allProjects:');
}

export function markPullRequestListsStale({
  projectId,
  providerId,
  repoId,
}: {
  projectId?: string;
  providerId: string;
  repoId: string;
}) {
  for (const status of PULL_REQUEST_LIST_STATUSES) {
    markResourceStale(
      repoPullRequestsResourceKey({ providerId, repoId, status }),
    );
    if (projectId) {
      markResourceStale(projectPullRequestsResourceKey(projectId, status));
    }
  }

  for (const key of Object.keys(cache$.resources.get())) {
    if (isAllProjectsPullRequestsResourceKey(key)) {
      markResourceStale(key);
    }
  }
}

export function markPullRequestDetailAndListsStale({
  projectId,
  providerId,
  repoId,
  pullRequestId,
}: {
  projectId?: string;
  providerId: string;
  repoId: string;
  pullRequestId: string | number;
}) {
  markResourceStale(
    pullRequestResourceKey({ providerId, repoId, pullRequestId }),
  );
  markPullRequestListsStale({ projectId, providerId, repoId });
}

function mergePullRequest({
  providerId,
  repoId,
  pullRequest,
}: {
  providerId: string;
  repoId: string;
  pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails;
}) {
  const key = pullRequestEntityKey({
    providerId,
    repoId,
    pullRequestId: pullRequest.id,
  });
  const current = cache$.pullRequests[key].get();

  cache$.pullRequests[key].set(
    mergeEntitySnapshot(current ?? ({} as CachedPullRequest), pullRequest),
  );

  return key;
}

export function mergePullRequestSnapshot(params: {
  providerId: string;
  repoId: string;
  pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails;
}) {
  return mergePullRequest(params);
}

export function patchPullRequestSnapshot({
  providerId,
  repoId,
  pullRequestId,
  patch,
}: {
  providerId: string;
  repoId: string;
  pullRequestId: string | number;
  patch: Partial<AzureDevOpsPullRequestDetails>;
}) {
  const key = pullRequestEntityKey({ providerId, repoId, pullRequestId });
  const current = cache$.pullRequests[key].get();
  if (!current) {
    return false;
  }

  cache$.pullRequests[key].set(
    applyEntityPatch(current, patch as Partial<CachedPullRequest>),
  );

  return true;
}

export function ingestPullRequest({
  providerId,
  repoId,
  pullRequest,
}: {
  providerId: string;
  repoId: string;
  pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails;
}) {
  const key = mergePullRequest({ providerId, repoId, pullRequest });
  setResourceSuccess(key);
}

export function ingestPullRequestList({
  providerId,
  repoId,
  projectId,
  status,
  pullRequests,
}: {
  providerId: string;
  repoId: string;
  projectId?: string;
  status?: PullRequestStatus;
  pullRequests: AzureDevOpsPullRequest[];
}) {
  for (const pullRequest of pullRequests) {
    mergePullRequest({ providerId, repoId, pullRequest });
  }

  const ids = pullRequests.map((pullRequest) =>
    pullRequestEntityKey({ providerId, repoId, pullRequestId: pullRequest.id }),
  );
  setIndexResource(
    repoPullRequestsResourceKey({ providerId, repoId, status }),
    ids,
  );

  if (projectId) {
    setIndexResource(projectPullRequestsResourceKey(projectId, status), ids);
  }
}

export function ingestAllProjectsPullRequestLists({
  projects,
  status,
  pullRequestLists,
}: {
  projects: ProjectPullRequestRepoIdentity[];
  status?: PullRequestStatus;
  pullRequestLists: Array<AzureDevOpsPullRequest[] | null>;
}) {
  pullRequestLists.forEach((pullRequests, index) => {
    if (pullRequests === null) {
      return;
    }

    const project = projects[index];
    if (!project?.repoProviderId || !project.repoId) {
      return;
    }

    ingestPullRequestList({
      providerId: project.repoProviderId,
      repoId: project.repoId,
      projectId: project.id,
      status,
      pullRequests,
    });
  });
}

export function selectPullRequest(
  identity: PullRequestIdentity,
): CachedPullRequest | undefined {
  return cache$.pullRequests[pullRequestEntityKey(identity)].get();
}

export function selectPullRequestDetails(
  identity: PullRequestIdentity,
): AzureDevOpsPullRequestDetails | undefined {
  const key = pullRequestEntityKey(identity);
  const meta = cache$.resources[key].get();
  if (meta?.lastFetchedAt === null || meta?.lastFetchedAt === undefined) {
    return undefined;
  }

  return cache$.pullRequests[key].get() as
    | AzureDevOpsPullRequestDetails
    | undefined;
}

export function selectRepoPullRequests({
  providerId,
  repoId,
  status,
}: {
  providerId: string;
  repoId: string;
  status?: PullRequestStatus;
}) {
  const ids =
    cache$.indexes[
      repoPullRequestsResourceKey({ providerId, repoId, status })
    ].ids.get() ?? [];
  return ids.flatMap((id) => {
    const pullRequest = cache$.pullRequests[id].get();
    return pullRequest ? [pullRequest] : [];
  });
}

export function selectProjectPullRequests(
  projectId: string,
  status?: PullRequestStatus,
) {
  const ids =
    cache$.indexes[
      projectPullRequestsResourceKey(projectId, status)
    ].ids.get() ?? [];
  return ids.flatMap((id) => {
    const pullRequest = cache$.pullRequests[id].get();
    return pullRequest ? [pullRequest] : [];
  });
}

export function selectAllProjectsPullRequests(
  projects: ProjectPullRequestRelation[],
  status?: PullRequestStatus,
) {
  return projects
    .flatMap((project) =>
      selectProjectPullRequests(project.id, status).map((pullRequest) => ({
        ...pullRequest,
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
      })),
    )
    .sort(
      (left, right) =>
        new Date(right.creationDate).getTime() -
        new Date(left.creationDate).getTime(),
    );
}
