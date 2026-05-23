import { useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  Loader2,
  Plus,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useFeed } from '@/hooks/use-feed';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useFeedStore } from '@/stores/feed';
import { useOverlaysStore } from '@/stores/overlays';
import type { FeedItem } from '@shared/feed-types';

import { FeedItemCard } from './feed-item-card';
import { FeedNoteCard } from './feed-note-card';

function FeedCard({
  item,
  ...props
}: {
  item: FeedItem;
  isSelected?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  if (item.source === 'note') {
    return <FeedNoteCard item={item} {...props} />;
  }
  return <FeedItemCard item={item} {...props} />;
}

function StackableZone({
  items,
  isItemSelected,
  onDragStart,
  onDragEnd,
  sticky,
  collapsedOverlap = 28,
}: {
  items: FeedItem[];
  isItemSelected: (item: FeedItem) => boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  sticky?: boolean;
  /** Pixel amount stacked cards overlap when collapsed (default 28 ≈ Tailwind mt-7). */
  collapsedOverlap?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = useCallback(() => {
    clearTimeout(collapseTimer.current);
    setExpanded(true);
  }, []);

  const handleLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => setExpanded(false), 300);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(collapseTimer.current);
    };
  }, []);

  return (
    <div
      className={clsx(
        'flex flex-col py-0.5',
        sticky && 'bg-bg-0/95 sticky top-0 z-30 backdrop-blur-sm',
      )}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className="bg-bg-0 relative transition-[margin] duration-200 ease-out"
          style={{
            zIndex: index + 1,
            marginTop:
              index > 0 ? (expanded ? 6 : -collapsedOverlap) : undefined,
          }}
        >
          <FeedCard
            item={item}
            isSelected={isItemSelected(item)}
            isDraggable
            onDragStart={() => onDragStart(item.id)}
            onDragEnd={onDragEnd}
          />
        </div>
      ))}
    </div>
  );
}

export function FeedList() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;
  const currentPrId = params.prId as string | undefined;
  const currentProjectId = params.projectId as string | undefined;
  const currentWorkItemId = params.workItemId as string | undefined;

  const {
    pinnedItems,
    actionNeededItems,
    activeTaskItems,
    highPriorityItems,
    normalItems,
    lowPriorityItems,
    allVisibleItems,
    isLoading,
  } = useFeed();
  const reorderPinned = useFeedStore((s) => s.reorderPinned);
  const pinned = useFeedStore((s) => s.pinned);
  const openOverlay = useOverlaysStore((s) => s.open);
  const runningTaskCreationCount = useBackgroundJobsStore(
    (state) =>
      state.jobs.filter(
        (job) => job.type === 'task-creation' && job.status === 'running',
      ).length,
  );
  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);
  const dismiss = useFeedStore((s) => s.dismiss);
  const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
  const pinnedIdSet = useMemo(
    () => new Set(pinned.map((item) => item.id)),
    [pinned],
  );
  const hasUnpinnedItems =
    actionNeededItems.length > 0 ||
    activeTaskItems.length > 0 ||
    highPriorityItems.length > 0 ||
    normalItems.length > 0 ||
    lowPriorityItems.length > 0;

  const [lowPriorityExpanded, setLowPriorityExpanded] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [_dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPinZone, setDragOverPinZone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Drag handlers for pinned zone items ---
  const handlePinnedDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handlePinnedDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(targetId);
    },
    [],
  );

  const handlePinnedDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) {
        setDragOverId(null);
        setDraggedId(null);
        return;
      }

      const currentOrder = pinnedItems.map((item) => item.id);

      // If dragged item is not yet pinned, pin it first
      if (!currentOrder.includes(draggedId)) {
        pin(draggedId);
        const targetIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(targetIdx, 0, draggedId);
        reorderPinned(currentOrder);
      } else {
        // Reorder within pinned zone
        const fromIdx = currentOrder.indexOf(draggedId);
        const toIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(fromIdx, 1);
        currentOrder.splice(toIdx, 0, draggedId);
        reorderPinned(currentOrder);
      }

      setDragOverId(null);
      setDraggedId(null);
    },
    [draggedId, pinnedItems, pin, reorderPinned],
  );

  // --- Drag handlers for the pinned zone container ---
  const handlePinZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPinZone(true);
  }, []);

  const handlePinZoneDragLeave = useCallback(() => {
    setDragOverPinZone(false);
  }, []);

  const handlePinZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedId) {
        pin(draggedId);
      }
      setDragOverPinZone(false);
      setDraggedId(null);
    },
    [draggedId, pin],
  );

  // --- Shared drag end handler ---
  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPinZone(false);
  }, []);

  const currentNoteId = params.noteId as string | undefined;

  const isItemSelected = useCallback(
    (item: {
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
      noteId?: string;
      projectId: string;
    }) => {
      if (item.noteId && currentNoteId) {
        return item.noteId === currentNoteId;
      }
      if (item.taskId) {
        return item.taskId === currentTaskId;
      }
      if (item.workItemId && currentWorkItemId) {
        return (
          String(item.workItemId) === currentWorkItemId &&
          item.projectId === (currentProjectId ?? item.projectId)
        );
      }
      if (!item.pullRequestId || !currentPrId) {
        return false;
      }
      const prMatches = String(item.pullRequestId) === currentPrId;
      if (!prMatches) {
        return false;
      }
      if (!currentProjectId) {
        return true;
      }
      return item.projectId === currentProjectId;
    },
    [
      currentNoteId,
      currentPrId,
      currentProjectId,
      currentTaskId,
      currentWorkItemId,
    ],
  );

  const navigateToItem = useCallback(
    (index: number) => {
      const item = allVisibleItems[index];
      if (!item) return;
      if (item.source === 'note' && item.noteId) {
        navigate({
          to: '/all/notes/$noteId',
          params: { noteId: item.noteId },
        });
      } else if (item.source === 'work-item' && item.workItemId) {
        navigate({
          to: '/all/work-items/$projectId/$workItemId',
          params: {
            projectId: item.projectId,
            workItemId: String(item.workItemId),
          },
        });
      } else if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/all/prs/$projectId/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
      } else if (item.taskId) {
        navigate({
          to: '/all/$taskId',
          params: { taskId: item.taskId },
        });
      }
    },
    [allVisibleItems, navigate],
  );

  const openInProject = useCallback(
    (item: {
      source: FeedItem['source'];
      projectId: string;
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
    }) => {
      // Work items only exist in the cross-project (/all) context
      if (item.source === 'work-item') return;
      // Notes are global, not per-project
      if (item.source === 'note') return;
      if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/projects/$projectId/prs/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
        return;
      }

      if (item.taskId) {
        navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: {
            projectId: item.projectId,
            taskId: item.taskId,
          },
        });
      }
    },
    [navigate],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next') => {
      if (allVisibleItems.length === 0) return;
      const currentIndex = allVisibleItems.findIndex((item) =>
        isItemSelected(item),
      );
      let newIndex: number;
      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : allVisibleItems.length - 1;
      } else {
        newIndex =
          direction === 'next'
            ? (currentIndex + 1) % allVisibleItems.length
            : (currentIndex - 1 + allVisibleItems.length) %
              allVisibleItems.length;
      }
      navigateToItem(newIndex);
    },
    [allVisibleItems, isItemSelected, navigateToItem],
  );

  // Find the currently selected item for dismiss/low-priority shortcuts
  const currentItem = useMemo(
    () => allVisibleItems.find((item) => isItemSelected(item)),
    [allVisibleItems, isItemSelected],
  );

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    listRef.current
      ?.querySelector<HTMLElement>('[data-feed-selected="true"]')
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'auto',
      });
  }, [currentItem]);

  useCommands('feed-list-navigation', [
    {
      label: 'Go to Feed Item 1',
      shortcut: 'cmd+1',
      handler: () => navigateToItem(0),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 2',
      shortcut: 'cmd+2',
      handler: () => navigateToItem(1),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 3',
      shortcut: 'cmd+3',
      handler: () => navigateToItem(2),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 4',
      shortcut: 'cmd+4',
      handler: () => navigateToItem(3),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 5',
      shortcut: 'cmd+5',
      handler: () => navigateToItem(4),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 6',
      shortcut: 'cmd+6',
      handler: () => navigateToItem(5),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 7',
      shortcut: 'cmd+7',
      handler: () => navigateToItem(6),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 8',
      shortcut: 'cmd+8',
      handler: () => navigateToItem(7),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 9',
      shortcut: 'cmd+9',
      handler: () => navigateToItem(8),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Previous Feed Item',
      shortcut: 'cmd+up',
      handler: () => navigateRelative('prev'),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Next Feed Item',
      shortcut: 'cmd+down',
      handler: () => navigateRelative('next'),
      hideInCommandPalette: true,
    },
    {
      label: 'Dismiss Selected Feed Item',
      shortcut: 'cmd+shift+d',
      handler: () => {
        if (currentItem) dismiss(currentItem.id);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Toggle Low Priority on Selected Feed Item',
      shortcut: 'cmd+shift+l',
      handler: () => {
        if (currentItem) toggleLowPriority(currentItem.id);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Toggle Pin on Selected Feed Item',
      shortcut: 'cmd+shift+p',
      handler: () => {
        if (!currentItem) return;
        if (pinnedIdSet.has(currentItem.id)) {
          unpin(currentItem.id);
        } else {
          pin(currentItem.id);
        }
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Open Selected Feed Item in Project',
      shortcut: 'cmd+shift+o',
      handler: () => {
        if (currentItem) {
          openInProject(currentItem);
        }
      },
      hideInCommandPalette: true,
    },
  ]);

  const totalCount =
    pinnedItems.length +
    actionNeededItems.length +
    highPriorityItems.length +
    activeTaskItems.length +
    normalItems.length +
    lowPriorityItems.length;

  return (
    <div
      ref={listRef}
      className="flex h-full flex-col overflow-y-auto overscroll-contain"
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)',
      }}
    >
      {/* Initial loading state */}
      {isLoading && totalCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <Loader2 className="text-ink-2 h-6 w-6 animate-spin" />
          <span className="text-ink-3 text-sm">Loading feed...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && totalCount === 0 && runningTaskCreationCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <ListTodo className="text-ink-3 h-6 w-6" />
          <span className="text-ink-2 text-sm">No active tasks or notes</span>
        </div>
      )}

      {/* Section header with + button */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-ink-3 text-[10px] font-semibold tracking-wider uppercase">
            {pinnedItems.length > 0 ? 'Pinned' : 'Feed'}
          </span>
          <button
            type="button"
            onClick={() => openOverlay('new-task')}
            className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 flex h-5 w-5 items-center justify-center rounded transition-colors"
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Pinned zone - visible when items are pinned or when dragging */}
      {(pinnedItems.length > 0 || draggedId) && (
        <div
          onDragOver={handlePinZoneDragOver}
          onDragLeave={handlePinZoneDragLeave}
          onDrop={handlePinZoneDrop}
          className={clsx(
            'flex flex-col transition-colors',
            dragOverPinZone && 'bg-acc/10',
          )}
        >
          {pinnedItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              isSelected={isItemSelected(item)}
              isDraggable
              onDragStart={() => handlePinnedDragStart(item.id)}
              onDragOver={(e) => handlePinnedDragOver(e, item.id)}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => handlePinnedDrop(e, item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Slightly stronger divider between pinned and rest of feed */}
      {pinnedItems.length > 0 && hasUnpinnedItems && (
        <div className="border-acc/20 border-t-4" />
      )}

      {runningTaskCreationCount > 0 && (
        <div className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => openOverlay('activity-center')}
            className="bg-acc/[0.08] border-acc/20 text-acc-ink hover:bg-acc/[0.12] flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate font-medium">
              Creating {runningTaskCreationCount}{' '}
              {runningTaskCreationCount === 1 ? 'task' : 'tasks'} in the
              background
            </span>
          </button>
        </div>
      )}

      {/* Action needed zone - permissions, questions, errors (sticky + stacked) */}
      {actionNeededItems.length > 0 && (
        <StackableZone
          items={actionNeededItems}
          isItemSelected={isItemSelected}
          onDragStart={setDraggedId}
          onDragEnd={handleDragEnd}
          sticky
          collapsedOverlap={32}
        />
      )}

      {/* Active tasks zone - stacked, spreads on hover */}
      {activeTaskItems.length > 0 && (
        <StackableZone
          items={activeTaskItems}
          isItemSelected={isItemSelected}
          onDragStart={setDraggedId}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* High priority zone */}
      {highPriorityItems.length > 0 && (
        <div className="flex flex-col">
          {highPriorityItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              isSelected={isItemSelected(item)}
              isDraggable
              onDragStart={() => setDraggedId(item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Divider between active tasks/high-priority and auto-sorted */}
      {(activeTaskItems.length > 0 || highPriorityItems.length > 0) &&
        normalItems.length > 0 && (
          <div className="border-line-soft my-1 border-t border-dashed" />
        )}

      {/* Auto-sorted zone */}
      <div className="flex flex-col">
        {normalItems.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            isSelected={isItemSelected(item)}
            isDraggable
            onDragStart={() => setDraggedId(item.id)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Low priority collapsed section */}
      {lowPriorityItems.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setLowPriorityExpanded((prev) => !prev)}
            className="text-ink-3 hover:bg-glass-light/50 hover:text-ink-2 flex w-full items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
          >
            {lowPriorityExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            {lowPriorityItems.length} low priority
          </button>
          {lowPriorityExpanded && (
            <div className="flex flex-col pt-1 opacity-60">
              {lowPriorityItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  isSelected={isItemSelected(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
