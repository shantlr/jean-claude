import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useWindowFocused } from '@/hooks/use-window-focused';
import { api } from '@/lib/api';
import { partitionFeedItems } from '@/lib/feed-partition';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { useFeedStore } from '@/stores/feed';
import { useNavigationStore } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useUIStore } from '@/stores/ui';
import type { FeedItem } from '@shared/feed-types';

function shouldHideReviewPr(item: FeedItem) {
  return (
    item.source === 'pull-request' &&
    (item.isOwnedByCurrentUser || item.isApprovedByMe)
  );
}

function mergeTaskPrInfo(taskItems: FeedItem[], prItems: FeedItem[]) {
  const prByKey = new Map(
    prItems
      .filter((item) => item.pullRequestId != null)
      .map((item) => [`${item.projectId}:${item.pullRequestId}`, item]),
  );

  const mergeItem = (item: FeedItem): FeedItem => {
    const children = item.children?.map(mergeItem);
    const withChildren = children ? { ...item, children } : item;

    if (item.source !== 'task' || item.pullRequestId == null)
      return withChildren;

    const pr = prByKey.get(`${item.projectId}:${item.pullRequestId}`);
    if (!pr) {
      return withChildren;
    }

    return {
      ...withChildren,
      isDraft: pr.isDraft,
      workItemPrStatus: 'active',
      pullRequestMergeStatus: pr.pullRequestMergeStatus,
      approvedBy: pr.approvedBy,
      activeThreadCount: pr.activeThreadCount,
      unresolvedCommentCount: pr.unresolvedCommentCount,
      workItemPrUrl: pr.pullRequestUrl,
    };
  };

  return taskItems.map(mergeItem);
}

export function useFeed() {
  const windowFocused = useWindowFocused();
  const pinned = useFeedStore((s) => s.pinned);
  const dismissed = useFeedStore((s) => s.dismissed);
  const lowPriority = useFeedStore((s) => s.lowPriority);
  const hiddenProjectIds = useFeedStore((s) => s.hiddenProjectIds);
  const prProjectOrder = useUIStore((s) => s.settings.prProjectOrder);
  const reconcile = useFeedStore((s) => s.reconcile);
  const lastAttention = useFeedStore((s) => s.lastAttention);
  const pendingRequestsByTaskId = useTaskMessagesStore(
    (s) => s.pendingRequestsByTaskId,
  );
  const feedRefetchInterval = windowFocused ? 3 * 60 * 1000 : false;

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const dismissedIds = useMemo(() => new Set(dismissed), [dismissed]);
  const lowPriorityIds = useMemo(() => new Set(lowPriority), [lowPriority]);
  const hiddenProjectIdSet = useMemo(
    () => new Set(hiddenProjectIds),
    [hiddenProjectIds],
  );

  const taskQuery = useQuery({
    queryKey: feedQueryKeys.tasks,
    queryFn: async () => api.feed.getTaskItems(),
    refetchInterval: feedRefetchInterval,
  });
  const prQuery = useQuery({
    queryKey: feedQueryKeys.pullRequests,
    queryFn: async () => api.feed.getPullRequestItems(),
    refetchInterval: feedRefetchInterval,
  });
  const noteQuery = useQuery({
    queryKey: feedQueryKeys.notes,
    queryFn: async () => api.feed.getNoteItems(),
    refetchInterval: feedRefetchInterval,
  });
  const workItemQuery = useQuery({
    queryKey: feedQueryKeys.workItems,
    queryFn: async () => api.feed.getWorkItemItems(),
    refetchInterval: feedRefetchInterval,
  });

  const queryData = useMemo(() => {
    const prItems = prQuery.data ?? [];
    const taskItems = mergeTaskPrInfo(taskQuery.data ?? [], prItems);
    const noteItems = (noteQuery.data ?? []).filter(
      (item) => !item.isCompleted,
    );
    const taskWorkItemIds = new Set(
      taskItems.flatMap((item) => (item.workItemIds ?? []).map(Number)),
    );
    const workItemItems = (workItemQuery.data ?? []).filter(
      (item) =>
        item.workItemId === undefined || !taskWorkItemIds.has(item.workItemId),
    );

    return [...taskItems, ...prItems, ...noteItems, ...workItemItems];
  }, [noteQuery.data, prQuery.data, taskQuery.data, workItemQuery.data]);

  const isLoading =
    taskQuery.isLoading ||
    prQuery.isLoading ||
    noteQuery.isLoading ||
    workItemQuery.isLoading;
  const isError =
    taskQuery.isError ||
    prQuery.isError ||
    noteQuery.isError ||
    workItemQuery.isError;
  const hasAnyFeedData =
    taskQuery.data !== undefined ||
    prQuery.data !== undefined ||
    noteQuery.data !== undefined ||
    workItemQuery.data !== undefined;

  const reconcilePrState = useNavigationStore((s) => s.reconcilePrState);

  useEffect(() => {
    const items = queryData;
    if (!hasAnyFeedData) {
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
    if (prQuery.data && !prQuery.isError) {
      const activePrKeys = new Set<string>();
      for (const item of prQuery.data) {
        if (item.source === 'pull-request' && item.pullRequestId != null) {
          activePrKeys.add(`${item.projectId}:${item.pullRequestId}`);
        }
      }
      reconcilePrState(activePrKeys);
    }
  }, [
    hasAnyFeedData,
    lastAttention,
    prQuery.data,
    prQuery.isError,
    queryData,
    reconcile,
    reconcilePrState,
  ]);

  // Refine waiting/permission attention from in-memory pending request state.
  const refinedItems = useMemo(() => {
    const raw = queryData;
    const taskIdsWithQuestions = new Set<string>();
    const taskIdsWithPermissions = new Set<string>();

    // Check the lightweight task-level pending request map instead of the full
    // loaded message cache; message streaming should not recompute the feed.
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
  }, [queryData, pendingRequestsByTaskId]);

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
      prProjectOrder,
    });
  }, [
    visibleFeedItems,
    pinned,
    pinnedIds,
    dismissedIds,
    hiddenProjectIdSet,
    lowPriorityIds,
    prProjectOrder,
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
    data: refinedItems,
    isLoading,
    isError,
    refetch: async () => {
      await Promise.all([
        taskQuery.refetch(),
        prQuery.refetch(),
        noteQuery.refetch(),
        workItemQuery.refetch(),
      ]);
    },
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
