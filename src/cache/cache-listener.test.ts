import { beforeEach, describe, expect, it, vi } from 'vitest';

import { feedQueryKeys } from '@/lib/feed-query-keys';

import { cache$, resetCache } from './cache-store';
import {
  getFeedQueryKeyForCacheEvent,
  getReactQueryKeysForCacheEvent,
  handleCacheEvent,
} from './cache-listener';
import { resetCacheResourceSubscriptionsForTests } from './cache-subscriptions';
import { retainResource } from './cache-actions';


beforeEach(() => {
  resetCache();
  resetCacheResourceSubscriptionsForTests();
});

describe('getFeedQueryKeyForCacheEvent', () => {
  it('maps feed cache events to active React Query feed keys', () => {
    expect(
      getFeedQueryKeyForCacheEvent({
        type: 'feed.sourceChanged',
        source: 'pullRequests',
      }),
    ).toBe(feedQueryKeys.pullRequests);

    expect(
      getFeedQueryKeyForCacheEvent({
        type: 'feed.sourceChanged',
        source: 'workItems',
      }),
    ).toBe(feedQueryKeys.workItems);
  });

  it('ignores non-feed cache events', () => {
    expect(
      getFeedQueryKeyForCacheEvent({
        type: 'resource.invalidate',
        resourceKey: 'projects',
        reason: 'test',
      }),
    ).toBeNull();
  });

  it('maps pull request thread cache events to React Query thread keys', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'pullRequest.threadsChanged',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toEqual([
      feedQueryKeys.pullRequests,
      ['pull-request-threads', 'github', 'repo-1', 42],
    ]);
  });

  it('maps pull request cache events to pull request feed keys', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'pullRequest.patch',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
        patch: { title: 'Updated' },
      }),
    ).toEqual([feedQueryKeys.pullRequests]);
  });

  it('does not map feed snapshot pull request upserts to feed query invalidations', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'pullRequest.upsert',
        providerId: 'github',
        repoId: 'repo-1',
        projectId: 'project-1',
        invalidateFeed: false,
        pullRequest: {
          id: 42,
          title: 'PR title',
          status: 'active',
          isDraft: false,
          createdBy: { id: 'user-1', displayName: 'User', uniqueName: 'u' },
          creationDate: '2026-01-01T00:00:00.000Z',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          url: 'https://example.com/pr/42',
          reviewers: [],
        },
      }),
    ).toEqual([]);
  });

  it('maps task events to task feed and completed-task keys', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
      }),
    ).toEqual([feedQueryKeys.tasks, ['tasks', 'allCompleted']]);
  });

  it('maps project deletes to all project-backed feed keys', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'project.delete',
        projectId: 'project-1',
      }),
    ).toEqual([
      feedQueryKeys.tasks,
      feedQueryKeys.pullRequests,
      feedQueryKeys.workItems,
      ['tasks', 'allCompleted'],
    ]);
  });

  it('maps step cache events to the task feed key', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'step.delete',
        stepId: 'step-1',
        taskId: 'task-1',
      }),
    ).toEqual([feedQueryKeys.tasks]);
  });
});

describe('handleCacheEvent', () => {
  it('ignores unrelated events without an active matching resource', () => {
    const queryClient = { invalidateQueries: vi.fn() };

    handleCacheEvent(
      {
        type: 'resource.invalidate',
        resourceKey: 'projects',
        reason: 'test',
      },
      queryClient,
    );

    expect(cache$.resources.projects.get()).toBeUndefined();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('invalidates React Query thread data for active thread subscriptions', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    retainResource('pullRequestThreads:github:repo-1:42');

    handleCacheEvent(
      {
        type: 'pullRequest.threadsChanged',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      },
      queryClient,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.pullRequests,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['pull-request-threads', 'github', 'repo-1', 42],
    });
  });

  it('applies pull request events for active feed subscriptions', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    retainResource('feed:pullRequests');

    handleCacheEvent(
      {
        type: 'pullRequest.patch',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
        patch: { title: 'Updated' },
      },
      queryClient,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.pullRequests,
    });
  });

  it('hydrates pull request snapshots without invalidating the producing feed query', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    retainResource('feed:pullRequests');

    handleCacheEvent(
      {
        type: 'pullRequest.upsert',
        providerId: 'github',
        repoId: 'repo-1',
        projectId: 'project-1',
        invalidateFeed: false,
        pullRequest: {
          id: 42,
          title: 'PR title',
          status: 'active',
          isDraft: false,
          createdBy: { id: 'user-1', displayName: 'User', uniqueName: 'u' },
          creationDate: '2026-01-01T00:00:00.000Z',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          url: 'https://example.com/pr/42',
          reviewers: [],
        },
      },
      queryClient,
    );

    expect(
      cache$.pullRequests['pullRequest:github:repo-1:42'].get()?.title,
    ).toBe('PR title');
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('invalidates task feed data for active feed subscriptions on task events', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    retainResource('feed:tasks');

    handleCacheEvent(
      {
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
      },
      queryClient,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.tasks,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'allCompleted'],
    });
  });
});
