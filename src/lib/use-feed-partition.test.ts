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
});
