import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { computeFeedScore } from '@/features/feed/utils-feed-scoring';
import { api } from '@/lib/api';
import { useFeedStore } from '@/stores/feed';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem } from '@shared/feed-types';

export function useFeed() {
  const pinned = useFeedStore((s) => s.pinned);
  const dismissed = useFeedStore((s) => s.dismissed);
  const lowPriority = useFeedStore((s) => s.lowPriority);
  const reconcile = useFeedStore((s) => s.reconcile);
  const lastAttention = useFeedStore((s) => s.lastAttention);
  const taskSteps = useTaskMessagesStore((s) => s.steps);

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const dismissedIds = useMemo(() => new Set(dismissed), [dismissed]);
  const lowPriorityIds = useMemo(() => new Set(lowPriority), [lowPriority]);

  const query = useQuery({
    queryKey: ['feed', 'items'],
    queryFn: async () => api.feed.getItems(),
    refetchInterval: 3 * 60 * 1000,
  });

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
  }, [lastAttention, query.data, reconcile]);

  // Refine waiting/permission attention from in-memory pending request state.
  const refinedItems = useMemo(() => {
    const raw = query.data ?? [];
    const steps = Object.values(taskSteps);

    const taskIdsWithQuestions = new Set<string>();
    const taskIdsWithPermissions = new Set<string>();
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

    return raw.map((item) => {
      if (
        !item.taskId ||
        (item.attention !== 'waiting' && item.attention !== 'needs-permission')
      ) {
        return item;
      }

      if (taskIdsWithQuestions.has(item.taskId)) {
        return { ...item, attention: 'has-question' as const };
      }

      if (taskIdsWithPermissions.has(item.taskId)) {
        return { ...item, attention: 'needs-permission' as const };
      }

      return item.attention === 'waiting'
        ? item
        : { ...item, attention: 'waiting' as const };
    });
  }, [query.data, taskSteps]);

  const {
    pinnedItems,
    runningItems,
    normalItems,
    lowPriorityItems,
    dismissedCount,
  } = useMemo(() => {
    const items = refinedItems;

    const itemsById = new Map<string, FeedItem>();
    for (const item of items) {
      itemsById.set(item.id, item);
    }

    const pinnedResult: FeedItem[] = [];
    for (const p of [...pinned].sort((a, b) => a.order - b.order)) {
      const item = itemsById.get(p.id);
      if (item) {
        pinnedResult.push(item);
      }
    }

    let dCount = 0;
    const running: FeedItem[] = [];
    const rest: FeedItem[] = [];
    const low: FeedItem[] = [];

    for (const item of items) {
      if (pinnedIds.has(item.id)) continue;
      if (dismissedIds.has(item.id)) {
        dCount++;
        continue;
      }
      if (lowPriorityIds.has(item.id)) {
        low.push(item);
      } else if (item.attention === 'running') {
        running.push(item);
      } else {
        rest.push(item);
      }
    }

    running.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    rest.sort((a, b) => {
      const scoreA = computeFeedScore({
        attention: a.attention,
        projectPriority: a.projectPriority,
        isLowPriority: false,
      });
      const scoreB = computeFeedScore({
        attention: b.attention,
        projectPriority: b.projectPriority,
        isLowPriority: false,
      });
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    low.sort((a, b) => {
      const scoreA = computeFeedScore({
        attention: a.attention,
        projectPriority: a.projectPriority,
        isLowPriority: true,
      });
      const scoreB = computeFeedScore({
        attention: b.attention,
        projectPriority: b.projectPriority,
        isLowPriority: true,
      });
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return {
      pinnedItems: pinnedResult,
      runningItems: running,
      normalItems: rest,
      lowPriorityItems: low,
      dismissedCount: dCount,
    };
  }, [refinedItems, pinned, pinnedIds, dismissedIds, lowPriorityIds]);

  const allVisibleItems = useMemo(
    () => [...pinnedItems, ...runningItems, ...normalItems],
    [pinnedItems, runningItems, normalItems],
  );

  return {
    ...query,
    pinnedItems,
    runningItems,
    normalItems,
    lowPriorityItems,
    dismissedCount,
    allVisibleItems,
  };
}
