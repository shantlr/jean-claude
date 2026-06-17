import { describe, expect, it } from 'vitest';

import {
  getFeedPullRequestIdentityKey,
  partitionFeedItems,
} from '@/lib/feed-partition';
import type { FeedItem } from '@shared/feed-types';
import type { Project } from '@shared/types';

import {
  FEED_CACHE_SUBSCRIPTIONS,
  getFeedItemProjectPriority,
  mergeTaskPrInfo,
} from './use-feed';

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Project 1',
    path: '/project-1',
    providerId: null,
    remoteUrl: null,
    color: '#123456',
    type: 'local',
    logoPath: '/logo.png',
    logoSource: 'uploaded',
    sortOrder: 0,
    worktreesPath: null,
    defaultBranch: null,
    repoProviderId: null,
    repoProjectId: null,
    repoProjectName: null,
    repoId: null,
    repoName: null,
    workItemProviderId: null,
    workItemProjectId: null,
    workItemProjectName: null,
    showWorkItemsInFeed: true,
    showPrsInFeed: true,
    defaultAgentBackend: null,
    defaultAgentModelPreference: null,
    completionContext: null,
    summary: null,
    aiSkillSlots: null,
    protectedBranches: [],
    favoriteBranches: [],
    prPriority: 'high',
    workItemPriority: 'low',
    autoPullSourceBranch: false,
    commitWithNoVerify: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'item-1',
    source: 'pull-request',
    attention: 'review-requested',
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'project-1',
    projectName: 'Copied project',
    projectColor: '#000000',
    projectLogoPath: null,
    projectPriority: 'normal',
    title: 'Feed item',
    ...overrides,
  };
}

describe('getFeedItemProjectPriority', () => {
  it('uses work item priority only for work item feed items', () => {
    const priority = getFeedItemProjectPriority(
      createFeedItem({ source: 'work-item', attention: 'assigned-work-item' }),
      new Map([['project-1', createProject()]]),
    );

    expect(priority).toBe('low');
  });

  it('uses pull request priority for pull request feed items', () => {
    const priority = getFeedItemProjectPriority(
      createFeedItem({ source: 'pull-request' }),
      new Map([['project-1', createProject()]]),
    );

    expect(priority).toBe('high');
  });

  it('preserves task priority', () => {
    const priority = getFeedItemProjectPriority(
      createFeedItem({
        source: 'task',
        attention: 'running',
        projectPriority: 'normal',
      }),
      new Map([['project-1', createProject()]]),
    );

    expect(priority).toBe('normal');
  });
});

describe('FEED_CACHE_SUBSCRIPTIONS', () => {
  it('subscribes to feed resource events while feed is mounted', () => {
    expect(FEED_CACHE_SUBSCRIPTIONS.map((item) => item.resourceKey)).toEqual([
      'feed:tasks',
      'feed:pullRequests',
      'feed:notes',
      'feed:workItems',
    ]);
  });
});

describe('pull request feed identity', () => {
  it('builds canonical feed PR keys from provider, repo, and PR ID', () => {
    expect(
      getFeedPullRequestIdentityKey(
        createFeedItem({
          pullRequestProviderId: 'github',
          pullRequestRepoId: 'repo-1',
          pullRequestId: 42,
        }),
      ),
    ).toBe('github:repo-1:42');
  });

  it('merges task PR fields from matching repo identity only', () => {
    const [merged] = mergeTaskPrInfo(
      [
        createFeedItem({
          id: 'task:1',
          source: 'task',
          attention: 'running',
          pullRequestProviderId: 'github',
          pullRequestRepoId: 'repo-a',
          pullRequestId: 42,
        }),
      ],
      [
        createFeedItem({
          id: 'pr:correct',
          pullRequestProviderId: 'github',
          pullRequestRepoId: 'repo-a',
          pullRequestId: 42,
          activeThreadCount: 2,
          pullRequestUrl: 'https://example.com/repo-a/pull/42',
        }),
        createFeedItem({
          id: 'pr:wrong',
          pullRequestProviderId: 'github',
          pullRequestRepoId: 'repo-b',
          pullRequestId: 42,
          activeThreadCount: 9,
          pullRequestUrl: 'https://example.com/repo-b/pull/42',
        }),
      ],
    );

    expect(merged.activeThreadCount).toBe(2);
    expect(merged.workItemPrStatus).toBe('active');
    expect(merged.workItemPrUrl).toBeUndefined();
  });

  it('hides only standalone PR with same canonical identity as a task PR', () => {
    const task = createFeedItem({
      id: 'task:1',
      source: 'task',
      attention: 'running',
      pullRequestProviderId: 'github',
      pullRequestRepoId: 'repo-a',
      pullRequestId: 42,
    });
    const ownedPr = createFeedItem({
      id: 'pr:owned',
      pullRequestProviderId: 'github',
      pullRequestRepoId: 'repo-a',
      pullRequestId: 42,
    });
    const unrelatedPr = createFeedItem({
      id: 'pr:unrelated',
      projectId: 'project-2',
      pullRequestProviderId: 'github',
      pullRequestRepoId: 'repo-b',
      pullRequestId: 42,
    });

    const result = partitionFeedItems({
      visibleFeedItems: [task, ownedPr, unrelatedPr],
      hiddenProjectIdSet: new Set(),
      pinned: [],
      pinnedIds: new Set(),
      dismissedIds: new Set(),
      lowPriorityIds: new Set(),
      taskOwnedPrKeys: new Set([getFeedPullRequestIdentityKey(task)!]),
    });

    const visibleIds = [
      ...result.highPriorityItems,
      ...result.prReviewItems,
      ...result.normalItems,
      ...result.lowPriorityItems,
    ].map((item) => item.id);

    expect(visibleIds).not.toContain('pr:owned');
    expect(visibleIds).toContain('pr:unrelated');
  });
});
