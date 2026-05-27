import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { api } from '@/lib/api';
import { useFeedStore } from '@/stores/feed';
import { useNavigationStore } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
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
  return b.timestamp < a.timestamp ? -1 : b.timestamp > a.timestamp ? 1 : 0;
};

const PRIORITY_ORDER: Record<FeedItem['projectPriority'], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const byPriorityThenTimestamp = (a: FeedItem, b: FeedItem) => {
  const priority =
    PRIORITY_ORDER[a.projectPriority] - PRIORITY_ORDER[b.projectPriority];
  if (priority !== 0) return priority;
  return b.timestamp < a.timestamp ? -1 : b.timestamp > a.timestamp ? 1 : 0;
};

const ACTION_NEEDED_ATTENTIONS: Set<FeedItemAttention> = new Set([
  'needs-permission',
  'has-question',
  'errored',
]);

/** Task attentions that keep a task in the stacked (top) zone. */
const STACKED_TASK_ATTENTIONS: Set<FeedItemAttention> = new Set(['running']);

const PR_REVIEW_ATTENTIONS: Set<FeedItemAttention> = new Set([
  'review-requested',
  'pr-comments',
]);

export function useFeed() {
  const pinned = useFeedStore((s) => s.pinned);
  const dismissed = useFeedStore((s) => s.dismissed);
  const lowPriority = useFeedStore((s) => s.lowPriority);
  const hiddenProjectIds = useFeedStore((s) => s.hiddenProjectIds);
  const reconcile = useFeedStore((s) => s.reconcile);
  const lastAttention = useFeedStore((s) => s.lastAttention);
  const taskSteps = useTaskMessagesStore((s) => s.steps);
  const pendingRequestsByTaskId = useTaskMessagesStore(
    (s) => s.pendingRequestsByTaskId,
  );

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const dismissedIds = useMemo(() => new Set(dismissed), [dismissed]);
  const lowPriorityIds = useMemo(() => new Set(lowPriority), [lowPriority]);
  const hiddenProjectIdSet = useMemo(
    () => new Set(hiddenProjectIds),
    [hiddenProjectIds],
  );

  const query = useQuery({
    queryKey: ['feed', 'items'],
    queryFn: async () => api.feed.getItems(),
    refetchInterval: 3 * 60 * 1000,
  });

  const reconcilePrState = useNavigationStore((s) => s.reconcilePrState);

  useEffect(() => {
    const items = query.data;
    if (!items) {
      return;
    }

    const next = items.map((item) => ({
      id: item.id,
      attention: item.attention,
    }));
    const sameLength = Object.keys(lastAttention).length === next.length;
    const sameAttention =
      sameLength &&
      next.every((item) => lastAttention[item.id] === item.attention);

    if (!sameAttention) {
      reconcile(next);
    }

    // Reconcile persisted PR view state — prune entries for PRs that are
    // no longer active (completed, abandoned, or gone from feed).
    // Only reconcile on a successful fetch to avoid nuking state on errors.
    if (!query.isError) {
      const activePrKeys = new Set<string>();
      for (const item of items) {
        if (item.source === 'pull-request' && item.pullRequestId != null) {
          activePrKeys.add(`${item.projectId}:${item.pullRequestId}`);
        }
      }
      reconcilePrState(activePrKeys);
    }
  }, [lastAttention, query.data, query.isError, reconcile, reconcilePrState]);

  // Refine waiting/permission attention from in-memory pending request state.
  const refinedItems = useMemo(() => {
    const raw = query.data ?? [];
    const steps = Object.values(taskSteps);

    const taskIdsWithQuestions = new Set<string>();
    const taskIdsWithPermissions = new Set<string>();

    // Check loaded steps (for tasks whose panel has been opened)
    for (const step of steps) {
      const questionTaskId = step.pendingQuestion?.taskId;
      if (questionTaskId) {
        taskIdsWithQuestions.add(questionTaskId);
      }

      const permissionTaskId = step.pendingPermission?.taskId;
      if (permissionTaskId) {
        taskIdsWithPermissions.add(permissionTaskId);
      }
    }

    // Also check the lightweight task-level pending request map, which is
    // always populated regardless of whether the step is loaded.
    for (const [taskId, req] of Object.entries(pendingRequestsByTaskId)) {
      if (req.type === 'question') {
        taskIdsWithQuestions.add(taskId);
      } else if (req.type === 'permission') {
        taskIdsWithPermissions.add(taskId);
      }
    }

    return raw.map((item) => {
      if (!item.taskId) {
        return item;
      }

      // Refine attention for task items based on in-memory pending request
      // state. A running task can ask for permission or a question, so we
      // need to check running items too, not just waiting/needs-permission.
      const refinable =
        item.attention === 'waiting' ||
        item.attention === 'needs-permission' ||
        item.attention === 'running';

      if (!refinable) {
        return item;
      }

      if (taskIdsWithQuestions.has(item.taskId)) {
        return { ...item, attention: 'has-question' as const };
      }

      if (taskIdsWithPermissions.has(item.taskId)) {
        return { ...item, attention: 'needs-permission' as const };
      }

      // If neither in-memory source has a pending request, trust the
      // server-reported attention. Don't downgrade needs-permission to
      // waiting — the server may be correct and the IPC event just hasn't
      // arrived yet. When the permission is actually cleared, the status
      // event triggers a feed query refetch which updates the server state.
      return item;
    });
  }, [query.data, taskSteps, pendingRequestsByTaskId]);

  // Collect PR IDs already shown in a task's rail so we can hide the
  // standalone PR feed item (the rail already surfaces it).
  const taskOwnedPrIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of refinedItems) {
      if (item.source === 'task' && item.pullRequestId != null) {
        ids.add(item.pullRequestId);
      }
      // Also check children (subtasks) that own PRs
      if (item.children) {
        for (const child of item.children) {
          if (child.source === 'task' && child.pullRequestId != null) {
            ids.add(child.pullRequestId);
          }
        }
      }
    }
    return ids;
  }, [refinedItems]);

  const projectOptions = useMemo(() => {
    const byProjectId = new Map<
      string,
      { id: string; name: string; color: string; itemCount: number }
    >();

    for (const item of refinedItems) {
      const existing = byProjectId.get(item.projectId);
      if (existing) {
        existing.itemCount += 1;
        continue;
      }

      byProjectId.set(item.projectId, {
        id: item.projectId,
        name: item.source === 'note' ? 'Notes' : item.projectName,
        color:
          item.source === 'note' ? 'var(--color-ink-3)' : item.projectColor,
        itemCount: 1,
      });
    }

    return Array.from(byProjectId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [refinedItems]);

  const filteredOutCount = useMemo(
    () =>
      refinedItems.filter((item) => hiddenProjectIdSet.has(item.projectId))
        .length,
    [refinedItems, hiddenProjectIdSet],
  );

  const {
    pinnedItems,
    actionNeededItems,
    prReviewItems,
    activeTaskItems,
    highPriorityItems,
    normalItems,
    lowPriorityItems,
    dismissedCount,
  } = useMemo(() => {
    const items = refinedItems.filter(
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
      // Skip PR items already shown in a task's rail
      if (
        item.source === 'pull-request' &&
        item.pullRequestId != null &&
        taskOwnedPrIds.has(item.pullRequestId)
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
      // Hide standalone PR items when the PR is already shown in a task's rail.
      if (
        item.source === 'pull-request' &&
        item.pullRequestId != null &&
        taskOwnedPrIds.has(item.pullRequestId)
      ) {
        continue;
      }
      if (pinnedIds.has(item.id)) continue;
      if (dismissedIds.has(item.id)) {
        dCount++;
        continue;
      }
      if (
        item.source === 'pull-request' &&
        PR_REVIEW_ATTENTIONS.has(item.attention)
      ) {
        prReviews.push(item);
        continue;
      }
      if (ACTION_NEEDED_ATTENTIONS.has(item.attention)) {
        // Action-needed items always surface to the top, even if marked
        // low-priority — a permission request or error needs attention.
        actionNeeded.push(item);
      } else if (
        item.source === 'task' &&
        STACKED_TASK_ATTENTIONS.has(item.attention)
      ) {
        // Only actively running tasks get the stacked treatment.
        activeTasks.push(item);
      } else if (item.source === 'task') {
        // Non-running tasks (waiting, completed, interrupted) are still
        // highest priority compared to other feed items.
        high.push(item);
      } else if (item.source === 'note') {
        // Notes are high priority — below pinned and active tasks, but
        // above work-items and pull-requests.
        high.push(item);
      } else if (
        lowPriorityIds.has(item.id) ||
        item.projectPriority === 'low'
      ) {
        low.push(item);
      } else if (item.projectPriority === 'high') {
        high.push(item);
      } else {
        rest.push(item);
      }
    }

    actionNeeded.sort(bySourceThenTimestamp);
    prReviews.sort(byPriorityThenTimestamp);
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
  }, [
    refinedItems,
    pinned,
    pinnedIds,
    dismissedIds,
    hiddenProjectIdSet,
    lowPriorityIds,
    taskOwnedPrIds,
  ]);

  const allVisibleItems = useMemo(
    () => [
      ...pinnedItems,
      ...prReviewItems,
      ...actionNeededItems,
      ...activeTaskItems,
      ...highPriorityItems,
      ...normalItems,
    ],
    [
      pinnedItems,
      prReviewItems,
      actionNeededItems,
      activeTaskItems,
      highPriorityItems,
      normalItems,
    ],
  );

  return {
    ...query,
    pinnedItems,
    actionNeededItems,
    prReviewItems,
    activeTaskItems,
    highPriorityItems,
    normalItems,
    lowPriorityItems,
    dismissedCount,
    allVisibleItems,
    projectOptions,
    hiddenProjectIds,
    filteredOutCount,
  };
}
