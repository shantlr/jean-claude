import { useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  Loader2,
  Pin,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useFeed } from '@/hooks/use-feed';
import { useFeedStore } from '@/stores/feed';
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

function RunningTasksZone({
  items,
  isItemSelected,
  onDragStart,
  onDragEnd,
}: {
  items: FeedItem[];
  isItemSelected: (item: FeedItem) => boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
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
      className="flex flex-col py-0.5"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className={clsx(
            'relative transition-[margin] duration-200 ease-out',
            index > 0 && (expanded ? 'mt-1.5' : '-mt-7'),
          )}
          style={{ zIndex: index + 1 }}
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

  const {
    pinnedItems,
    actionNeededItems,
    runningItems,
    normalItems,
    lowPriorityItems,
    allVisibleItems,
    isLoading,
  } = useFeed();
  const reorderPinned = useFeedStore((s) => s.reorderPinned);
  const pinned = useFeedStore((s) => s.pinned);
  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);
  const dismiss = useFeedStore((s) => s.dismiss);
  const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
  const pinnedIdSet = useMemo(
    () => new Set(pinned.map((item) => item.id)),
    [pinned],
  );

  const [lowPriorityExpanded, setLowPriorityExpanded] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [_dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPinZone, setDragOverPinZone] = useState(false);

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

  const isItemSelected = useCallback(
    (item: { taskId?: string; pullRequestId?: number; projectId: string }) => {
      if (item.taskId) {
        return item.taskId === currentTaskId;
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
    [currentPrId, currentProjectId, currentTaskId],
  );

  // Notes are not navigable routes, so exclude them from keyboard navigation.
  const navigableItems = useMemo(
    () => allVisibleItems.filter((item) => item.source !== 'note'),
    [allVisibleItems],
  );

  const navigateToItem = useCallback(
    (index: number) => {
      const item = navigableItems[index];
      if (!item) return;
      if (item.source === 'pull-request' && item.pullRequestId) {
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
    [navigableItems, navigate],
  );

  const openInProject = useCallback(
    (item: {
      source: FeedItem['source'];
      projectId: string;
      taskId?: string;
      pullRequestId?: number;
    }) => {
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
      if (allVisibleItems.length === 0 || navigableItems.length === 0) return;
      const currentIndex = navigableItems.findIndex((item) =>
        isItemSelected(item),
      );
      let newIndex: number;
      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : navigableItems.length - 1;
      } else {
        newIndex =
          direction === 'next'
            ? (currentIndex + 1) % navigableItems.length
            : (currentIndex - 1 + navigableItems.length) %
              navigableItems.length;
      }
      navigateToItem(newIndex);
    },
    [allVisibleItems.length, navigableItems, isItemSelected, navigateToItem],
  );

  // Find the currently selected item for dismiss/low-priority shortcuts
  const currentItem = useMemo(
    () => allVisibleItems.find((item) => isItemSelected(item)),
    [allVisibleItems, isItemSelected],
  );

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
    runningItems.length +
    normalItems.length +
    lowPriorityItems.length;

  return (
    <div
      className="flex h-full flex-col overflow-y-auto overscroll-contain px-2 py-2.5"
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)',
      }}
    >
      {/* Initial loading state */}
      {isLoading && totalCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
          <span className="text-sm text-neutral-500">Loading feed...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && totalCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <ListTodo className="h-6 w-6 text-neutral-700" />
          <span className="text-sm text-neutral-600">
            No active tasks or notes
          </span>
        </div>
      )}

      {/* Pinned zone - visible when items are pinned or when dragging */}
      {(pinnedItems.length > 0 || draggedId) && (
        <div
          onDragOver={handlePinZoneDragOver}
          onDragLeave={handlePinZoneDragLeave}
          onDrop={handlePinZoneDrop}
          className={clsx(
            'flex flex-col gap-1.5 rounded-md p-1 transition-colors',
            dragOverPinZone && 'bg-blue-500/10',
          )}
        >
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Pin size={12} className="text-neutral-500" />
            <span className="text-xs font-medium text-neutral-500">Pinned</span>
          </div>
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

      {/* Dashed divider between pinned and auto-sorted */}
      {pinnedItems.length > 0 &&
        (actionNeededItems.length > 0 ||
          normalItems.length > 0 ||
          runningItems.length > 0) && (
          <div className="mx-2 my-1 border-t border-dashed border-neutral-700/50" />
        )}

      {/* Action needed zone - permissions, questions, errors (above running) */}
      {actionNeededItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {actionNeededItems.map((item) => (
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

      {/* Running tasks zone - stacked, spreads on hover */}
      {runningItems.length > 0 && (
        <RunningTasksZone
          items={runningItems}
          isItemSelected={isItemSelected}
          onDragStart={setDraggedId}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* Divider between running and auto-sorted */}
      {runningItems.length > 0 && normalItems.length > 0 && (
        <div className="mx-2 my-1 border-t border-dashed border-neutral-700/50" />
      )}

      {/* Auto-sorted zone */}
      <div className="flex flex-col gap-1.5">
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
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-800/50 hover:text-neutral-400"
          >
            {lowPriorityExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            {lowPriorityItems.length} low priority
          </button>
          {lowPriorityExpanded && (
            <div className="flex flex-col gap-1.5 pt-1 opacity-60">
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
