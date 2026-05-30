import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { api } from '@/lib/api';
import { partitionFeedItems } from '@/lib/feed-partition';
import { useFeedStore } from '@/stores/feed';
import { useNavigationStore } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem } from '@shared/feed-types';

function shouldHideReviewPr(item: FeedItem) {
  return (
    item.source === 'pull-request' &&
    (item.isOwnedByCurrentUser || item.isApprovedByMe)
  );
}

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

  const visibleFeedItems = useMemo(
    () => refinedItems.filter((item) => !shouldHideReviewPr(item)),
    [refinedItems],
  );

  // Collect PR IDs already shown in a task's rail so we can hide the
  // standalone PR feed item (the rail already surfaces it).
  const taskOwnedPrIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of visibleFeedItems) {
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
  }, [visibleFeedItems]);

  const projectOptions = useMemo(() => {
    const byProjectId = new Map<
      string,
      { id: string; name: string; color: string; itemCount: number }
    >();

    for (const item of visibleFeedItems) {
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
  }, [visibleFeedItems]);

  const filteredOutCount = useMemo(
    () =>
      visibleFeedItems.filter((item) => hiddenProjectIdSet.has(item.projectId))
        .length,
    [visibleFeedItems, hiddenProjectIdSet],
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
    return partitionFeedItems({
      visibleFeedItems,
      hiddenProjectIdSet,
      pinned,
      pinnedIds,
      dismissedIds,
      lowPriorityIds,
      taskOwnedPrIds,
    });
  }, [
    visibleFeedItems,
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
