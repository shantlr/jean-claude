import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AzureDevOpsPullRequest } from '@shared/azure-devops-types';

import { ProjectRepository } from '../database/repositories';
import { PrViewSnapshotRepository } from '../database/repositories/pr-view-snapshots';

import {
  getCurrentUser,
  getPullRequestActivityMetadata,
  listPullRequests,
} from './azure-devops-service';
import { getPrFeedItems, invalidatePrCache } from './feed-service';
import { emitCacheEvent } from './cache-event-service';



vi.mock('../database/repositories', () => ({
  FeedNoteRepository: {},
  ProjectRepository: {
    findAll: vi.fn(),
  },
  TaskRepository: {},
}));

vi.mock('../database/repositories/pr-view-snapshots', () => ({
  PrViewSnapshotRepository: {
    findByProject: vi.fn(),
  },
}));

vi.mock('../database/repositories/task-steps', () => ({
  TaskStepRepository: {},
}));

vi.mock('./azure-devops-service', () => ({
  getCurrentUser: vi.fn(),
  getPullRequestActivityMetadata: vi.fn(),
  getPullRequestStatuses: vi.fn(),
  getWorkItemById: vi.fn(),
  listPullRequests: vi.fn(),
  queryAssignedWorkItems: vi.fn(),
}));

vi.mock('./cache-event-service', () => ({
  emitCacheEvent: vi.fn(),
}));

vi.mock('./step-service', () => ({
  getMostRecentlyUpdatedStep: vi.fn(),
}));

function createPullRequest(
  overrides: Partial<AzureDevOpsPullRequest> = {},
): AzureDevOpsPullRequest {
  return {
    id: 9886,
    title: 'Smartbar POC',
    status: 'active',
    isDraft: true,
    createdBy: {
      id: 'user-1',
      displayName: 'Jose Daniel Canizares Proano',
      uniqueName: 'jose@example.com',
    },
    creationDate: '2026-06-19T00:00:00.000Z',
    sourceRefName: 'refs/heads/feature/smartbar',
    targetRefName: 'refs/heads/main',
    url: 'https://example.com/pr/9886',
    reviewers: [],
    ...overrides,
  };
}

describe('getPrFeedItems', () => {
  beforeEach(() => {
    invalidatePrCache();
    vi.mocked(ProjectRepository.findAll).mockResolvedValue([
      {
        id: 'project-1',
        name: 'oes-v2',
        color: '#ff6b6b',
        logoPath: null,
        repoProviderId: 'provider-1',
        repoProjectId: 'ado-project-1',
        repoId: 'repo-1',
        showPrsInFeed: true,
        prPriority: 'normal',
      } as never,
    ]);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'current-user',
      displayName: 'Current User',
      emailAddress: 'current@example.com',
    });
    vi.mocked(listPullRequests).mockResolvedValue([createPullRequest()]);
    vi.mocked(getPullRequestActivityMetadata).mockResolvedValue({
      lastCommitDate: null,
      lastThreadActivityDate: null,
      activeThreadCount: 0,
      unresolvedCommentCount: 0,
    });
    vi.mocked(PrViewSnapshotRepository.findByProject).mockResolvedValue([]);
    vi.mocked(emitCacheEvent).mockClear();
  });

  it('includes PR title and draft state in pull request feed items', async () => {
    const items = await getPrFeedItems();

    expect(items[0]).toMatchObject({
      source: 'pull-request',
      pullRequestId: 9886,
      title: 'Smartbar POC',
      isDraft: true,
    });
  });

  it('emits fetched PR snapshots for shared cache ingestion', async () => {
    await getPrFeedItems();

    expect(emitCacheEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pullRequest.upsert',
        providerId: 'provider-1',
        repoId: 'repo-1',
        projectId: 'project-1',
        pullRequest: expect.objectContaining({
          id: 9886,
          title: 'Smartbar POC',
          isDraft: true,
        }),
      }),
    );
  });
});
