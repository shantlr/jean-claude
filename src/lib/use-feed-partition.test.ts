import { describe, expect, it } from 'vitest';

import type { FeedItem } from '@shared/feed-types';

import { partitionFeedItems } from './feed-partition';

function prItem(overrides: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: 'pull-request',
    attention: 'review-requested',
    timestamp: '2026-05-30T00:00:00.000Z',
    projectId: 'project-1',
    projectName: 'Project',
    projectColor: '#fff',
    projectPriority: 'normal',
    title: overrides.id,
    pullRequestId: Number(overrides.id.replace(/\D/g, '')) || 1,
    ...overrides,
  };
}

function taskItem(overrides: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: 'task',
    attention: 'waiting',
    timestamp: '2026-05-30T00:00:00.000Z',
    projectId: 'project-1',
    projectName: 'Project',
    projectColor: '#fff',
    projectPriority: 'normal',
    title: overrides.id,
    taskId: overrides.id,
    ...overrides,
  };
}

describe('partitionFeedItems', () => {
  it('keeps manually low-priority PRs at the end of the carousel', async () => {
    const markedLow = prItem({ id: 'pr:project-1:1' });
    const projectLow = prItem({
      id: 'pr:project-1:2',
      projectPriority: 'low',
    });
    const normal = prItem({ id: 'pr:project-1:3' });

    const result = partitionFeedItems({
      visibleFeedItems: [markedLow, projectLow, normal],
      hiddenProjectIdSet: new Set(),
      pinned: [],
      pinnedIds: new Set(),
      dismissedIds: new Set(),
      lowPriorityIds: new Set([markedLow.id]),
      taskOwnedPrIds: new Set(),
    });

    expect(result.prReviewItems.map((item) => item.id)).toEqual([
      normal.id,
      projectLow.id,
      markedLow.id,
    ]);
    expect(result.lowPriorityItems.map((item) => item.id)).toEqual([]);
  });

  it('keeps draft PRs in the carousel', async () => {
    const draft = prItem({ id: 'pr:project-1:1', isDraft: true });
    const normal = prItem({ id: 'pr:project-1:2' });

    const result = partitionFeedItems({
      visibleFeedItems: [draft, normal],
      hiddenProjectIdSet: new Set(),
      pinned: [],
      pinnedIds: new Set(),
      dismissedIds: new Set(),
      lowPriorityIds: new Set(),
      taskOwnedPrIds: new Set(),
    });

    expect(result.prReviewItems.map((item) => item.id)).toEqual([
      draft.id,
      normal.id,
    ]);
    expect(result.normalItems.map((item) => item.id)).toEqual([]);
    expect(result.lowPriorityItems.map((item) => item.id)).toEqual([]);
  });

  it('orders PR reviews by custom project order', async () => {
    const firstProject = prItem({
      id: 'pr:project-1:1',
      projectId: 'project-1',
    });
    const secondProject = prItem({
      id: 'pr:project-2:2',
      projectId: 'project-2',
    });
    const unorderedProject = prItem({
      id: 'pr:project-3:3',
      projectId: 'project-3',
    });

    const result = partitionFeedItems({
      visibleFeedItems: [firstProject, unorderedProject, secondProject],
      hiddenProjectIdSet: new Set(),
      pinned: [],
      pinnedIds: new Set(),
      dismissedIds: new Set(),
      lowPriorityIds: new Set(),
      taskOwnedPrIds: new Set(),
      prProjectOrder: ['project-2', 'project-1'],
    });

    expect(result.prReviewItems.map((item) => item.id)).toEqual([
      secondProject.id,
      firstProject.id,
      unorderedProject.id,
    ]);
  });

  it('orders task parents by latest child task activity', async () => {
    const parentWithRecentChild = taskItem({
      id: 'task:parent-with-recent-child',
      timestamp: '2026-05-30T00:00:00.000Z',
      children: [
        taskItem({
          id: 'task:recent-child',
          timestamp: '2026-06-02T00:00:00.000Z',
          parentTaskId: 'parent-with-recent-child',
        }),
      ],
    });
    const newerParent = taskItem({
      id: 'task:newer-parent',
      timestamp: '2026-06-01T00:00:00.000Z',
    });

    const result = partitionFeedItems({
      visibleFeedItems: [newerParent, parentWithRecentChild],
      hiddenProjectIdSet: new Set(),
      pinned: [],
      pinnedIds: new Set(),
      dismissedIds: new Set(),
      lowPriorityIds: new Set(),
      taskOwnedPrIds: new Set(),
    });

    expect(result.highPriorityItems.map((item) => item.id)).toEqual([
      parentWithRecentChild.id,
      newerParent.id,
    ]);
  });
});
