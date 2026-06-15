import { beforeEach, describe, expect, it, vi } from 'vitest';

import { feedQueryKeys } from '@/lib/feed-query-keys';

import { retainResource } from './cache-actions';
import {
  getFeedQueryKeyForCacheEvent,
  getReactQueryKeysForCacheEvent,
  handleCacheEvent,
} from './cache-listener';
import { cache$, resetCache } from './cache-store';
import { resetCacheResourceSubscriptionsForTests } from './cache-subscriptions';

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

  it('maps task events to task feed and completed-task keys', () => {
    expect(
      getReactQueryKeysForCacheEvent({
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
      }),
    ).toEqual([feedQueryKeys.tasks, ['tasks', 'allCompleted']]);
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
