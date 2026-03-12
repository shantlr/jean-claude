import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { computeFeedScore } from '@/features/feed/utils-feed-scoring';
import { api } from '@/lib/api';
import { useFeedStore } from '@/stores/feed';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

const ACTION_NEEDED_ATTENTIONS: Set<FeedItemAttention> = new Set([
  'needs-permission',
  'has-question',
  'errored',
]);

export function useFeed() {
  const pinned = useFeedStore((s) => s.pinned);
  const dismissed = useFeedStore((s) => s.dismissed);
  const lowPriority = useFeedStore((s) => s.lowPriority);
  const reconcile = useFeedStore((s) => s.reconcile);
  const lastAttention = useFeedStore((s) => s.lastAttention);
  const taskSteps = useTaskMessagesStore((s) => s.steps);
  const pendingRequestsByTaskId = useTaskMessagesStore(
    (s) => s.pendingRequestsByTaskId,
  );

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

  const {
    pinnedItems,
    actionNeededItems,
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
    const actionNeeded: FeedItem[] = [];
    const running: FeedItem[] = [];
    const rest: FeedItem[] = [];
    const low: FeedItem[] = [];

    for (const item of items) {
      if (pinnedIds.has(item.id)) continue;
      if (dismissedIds.has(item.id)) {
        dCount++;
        continue;
      }
      if (ACTION_NEEDED_ATTENTIONS.has(item.attention)) {
        // Action-needed items always surface to the top, even if marked
        // low-priority — a permission request or error needs attention.
        actionNeeded.push(item);
      } else if (lowPriorityIds.has(item.id)) {
        low.push(item);
      } else if (item.attention === 'running') {
        running.push(item);
      } else {
        rest.push(item);
      }
    }

    actionNeeded.sort((a, b) => {
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
      actionNeededItems: actionNeeded,
      runningItems: running,
      normalItems: rest,
      lowPriorityItems: low,
      dismissedCount: dCount,
    };
  }, [refinedItems, pinned, pinnedIds, dismissedIds, lowPriorityIds]);

  const allVisibleItems = useMemo(
    () => [
      ...pinnedItems,
      ...actionNeededItems,
      ...runningItems,
      ...normalItems,
    ],
    [pinnedItems, actionNeededItems, runningItems, normalItems],
  );

  return {
    ...query,
    pinnedItems,
    actionNeededItems,
    runningItems,
    normalItems,
    lowPriorityItems,
    dismissedCount,
    allVisibleItems,
  };
}
