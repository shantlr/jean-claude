import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

const SOURCE_ORDER: Record<FeedItem['source'], number> = {
  note: 0,
  task: 1,
  'work-item': 2,
  'pull-request': 2,
};

const bySourceThenTimestamp = (a: FeedItem, b: FeedItem) => {
  const so = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
  if (so !== 0) return so;
  const aTimestamp = getFeedItemActivityTimestamp(a);
  const bTimestamp = getFeedItemActivityTimestamp(b);
  return bTimestamp < aTimestamp ? -1 : bTimestamp > aTimestamp ? 1 : 0;
};

const PRIORITY_ORDER: Record<FeedItem['projectPriority'], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

function getFeedItemActivityTimestamp(item: FeedItem): string {
  if (item.source !== 'task' || !item.children?.length) {
    return item.timestamp;
  }

  return item.children.reduce(
    (latest, child) => (child.timestamp > latest ? child.timestamp : latest),
    item.timestamp,
  );
}

export function getFeedPullRequestIdentityKey(item: FeedItem) {
  if (item.pullRequestId == null) {
    return null;
  }

  if (item.pullRequestProviderId && item.pullRequestRepoId) {
    return `${item.pullRequestProviderId}:${item.pullRequestRepoId}:${item.pullRequestId}`;
  }

  return `${item.projectId}:${item.pullRequestId}`;
}

const byManualLowPriorityThenProjectPriority = ({
  lowPriorityIds,
  prProjectOrder,
  getProjectPriority,
}: {
  lowPriorityIds: Set<string>;
  prProjectOrder: Map<string, number>;
  getProjectPriority: (item: FeedItem) => FeedItem['projectPriority'];
}) => {
  return (a: FeedItem, b: FeedItem) => {
    const manualLow =
      Number(lowPriorityIds.has(a.id)) - Number(lowPriorityIds.has(b.id));
    if (manualLow !== 0) return manualLow;

    const aProjectOrder = prProjectOrder.get(a.projectId);
    const bProjectOrder = prProjectOrder.get(b.projectId);
    if (aProjectOrder !== undefined || bProjectOrder !== undefined) {
      const projectOrder =
        (aProjectOrder ?? Number.MAX_SAFE_INTEGER) -
        (bProjectOrder ?? Number.MAX_SAFE_INTEGER);
      if (projectOrder !== 0) return projectOrder;
    }

    const aPriority = getProjectPriority(a);
    const bPriority = getProjectPriority(b);
    const priority = PRIORITY_ORDER[aPriority] - PRIORITY_ORDER[bPriority];
    if (priority !== 0) return priority;

    const aTimestamp = getFeedItemActivityTimestamp(a);
    const bTimestamp = getFeedItemActivityTimestamp(b);
    return bTimestamp < aTimestamp ? -1 : bTimestamp > aTimestamp ? 1 : 0;
  };
};

const ACTION_NEEDED_ATTENTIONS: Set<FeedItemAttention> = new Set([
  'needs-permission',
  'has-question',
  'errored',
]);

const STACKED_TASK_ATTENTIONS: Set<FeedItemAttention> = new Set(['running']);

const PR_REVIEW_ATTENTIONS: Set<FeedItemAttention> = new Set([
  'review-requested',
  'pr-comments',
]);

export function partitionFeedItems({
  visibleFeedItems,
  hiddenProjectIdSet,
  pinned,
  pinnedIds,
  dismissedIds,
  lowPriorityIds,
  taskOwnedPrIds = new Set(),
  taskOwnedPrKeys = new Set(),
  prProjectOrder = [],
  getProjectPriority = (item) => item.projectPriority,
}: {
  visibleFeedItems: FeedItem[];
  hiddenProjectIdSet: Set<string>;
  pinned: { id: string; order: number }[];
  pinnedIds: Set<string>;
  dismissedIds: Set<string>;
  lowPriorityIds: Set<string>;
  taskOwnedPrIds?: Set<number>;
  taskOwnedPrKeys?: Set<string>;
  prProjectOrder?: string[];
  getProjectPriority?: (item: FeedItem) => FeedItem['projectPriority'];
}) {
  const items = visibleFeedItems.filter(
    (item) => !hiddenProjectIdSet.has(item.projectId),
  );

  const itemsById = new Map<string, FeedItem>();
  for (const item of items) {
    itemsById.set(item.id, item);
  }

  const pinnedResult: FeedItem[] = [];
  for (const p of [...pinned].sort((a, b) => a.order - b.order)) {
    const item = itemsById.get(p.id);
    if (!item) continue;
    if (
      item.source === 'pull-request' &&
      item.pullRequestId != null &&
      (taskOwnedPrIds.has(item.pullRequestId) ||
        taskOwnedPrKeys.has(getFeedPullRequestIdentityKey(item) ?? ''))
    ) {
      continue;
    }
    pinnedResult.push(item);
  }

  let dCount = 0;
  const actionNeeded: FeedItem[] = [];
  const prReviews: FeedItem[] = [];
  const activeTasks: FeedItem[] = [];
  const high: FeedItem[] = [];
  const rest: FeedItem[] = [];
  const low: FeedItem[] = [];

  for (const item of items) {
    if (
      item.source === 'pull-request' &&
      item.pullRequestId != null &&
      (taskOwnedPrIds.has(item.pullRequestId) ||
        taskOwnedPrKeys.has(getFeedPullRequestIdentityKey(item) ?? ''))
    ) {
      continue;
    }
    if (pinnedIds.has(item.id)) continue;
    if (dismissedIds.has(item.id)) {
      dCount++;
      continue;
    }
    if (ACTION_NEEDED_ATTENTIONS.has(item.attention)) {
      actionNeeded.push(item);
    } else if (
      item.source === 'task' &&
      STACKED_TASK_ATTENTIONS.has(item.attention)
    ) {
      activeTasks.push(item);
    } else if (item.source === 'task') {
      high.push(item);
    } else if (item.source === 'note') {
      high.push(item);
    } else if (
      item.source === 'pull-request' &&
      PR_REVIEW_ATTENTIONS.has(item.attention)
    ) {
      prReviews.push(item);
    } else if (lowPriorityIds.has(item.id)) {
      low.push(item);
    } else if (getProjectPriority(item) === 'low') {
      low.push(item);
    } else if (getProjectPriority(item) === 'high') {
      high.push(item);
    } else {
      rest.push(item);
    }
  }

  actionNeeded.sort(bySourceThenTimestamp);
  prReviews.sort(
    byManualLowPriorityThenProjectPriority({
      lowPriorityIds,
      prProjectOrder: new Map(
        prProjectOrder.map((projectId, index) => [projectId, index]),
      ),
      getProjectPriority,
    }),
  );
  activeTasks.sort(bySourceThenTimestamp);
  high.sort(bySourceThenTimestamp);
  rest.sort(bySourceThenTimestamp);
  low.sort(bySourceThenTimestamp);

  return {
    pinnedItems: pinnedResult,
    actionNeededItems: actionNeeded,
    prReviewItems: prReviews,
    activeTaskItems: activeTasks,
    highPriorityItems: high,
    normalItems: rest,
    lowPriorityItems: low,
    dismissedCount: dCount,
  };
}
