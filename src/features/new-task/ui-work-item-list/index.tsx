import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { UserAvatar } from '@/common/ui/user-avatar';
import { useCurrentAzureUser } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';

import { WorkItemTypeIcon, SelectionCheckbox } from '../ui-work-item-shared';

// Group work items so children appear right after their parents
function groupWorkItemsByParent(
  workItems: AzureDevOpsWorkItem[],
): AzureDevOpsWorkItem[] {
  // Create a set of IDs in the current list for quick lookup
  const idsInList = new Set(workItems.map((wi) => wi.id));

  // Find work items that are parents (have children in the list)
  const childrenByParent = new Map<number, AzureDevOpsWorkItem[]>();
  const topLevelItems: AzureDevOpsWorkItem[] = [];

  for (const item of workItems) {
    if (item.parentId && idsInList.has(item.parentId)) {
      // This item has a parent in the list - group it under the parent
      const siblings = childrenByParent.get(item.parentId) ?? [];
      siblings.push(item);
      childrenByParent.set(item.parentId, siblings);
    } else {
      // This is a top-level item (no parent in the list)
      topLevelItems.push(item);
    }
  }

  // Build the final list: parent followed by its children
  const result: AzureDevOpsWorkItem[] = [];
  for (const item of topLevelItems) {
    result.push(item);
    const children = childrenByParent.get(item.id);
    if (children) {
      result.push(...children);
    }
  }

  return result;
}

// Status badge colors
function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'in progress':
    case 'active':
      return 'bg-blue-500/20 text-blue-400';
    case 'new':
    case 'to do':
      return 'bg-neutral-500/20 text-neutral-400';
    case 'resolved':
    case 'done':
    case 'closed':
      return 'bg-green-500/20 text-green-400';
    case 'removed':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-neutral-500/20 text-neutral-400';
  }
}

export function WorkItemList({
  workItems,
  highlightedWorkItemId,
  selectedWorkItemIds,
  providerId,
  onToggleSelect,
  onHighlight,
}: {
  workItems: AzureDevOpsWorkItem[];
  highlightedWorkItemId: string | null;
  selectedWorkItemIds: string[];
  providerId?: string;
  onToggleSelect: (workItem: AzureDevOpsWorkItem) => void;
  onHighlight: (workItem: AzureDevOpsWorkItem) => void;
}) {
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const { data: currentUser } = useCurrentAzureUser(providerId ?? null);

  // Group work items so children appear after their parents
  const { groupedItems, parentIdsInList } = useMemo(() => {
    const idsInList = new Set(workItems.map((wi) => wi.id));
    return {
      groupedItems: groupWorkItemsByParent(workItems),
      parentIdsInList: idsInList,
    };
  }, [workItems]);

  // Find the highlighted index in the grouped list
  const highlightedIndex = useMemo(() => {
    if (highlightedWorkItemId === null) return -1;
    return groupedItems.findIndex(
      (wi) => wi.id.toString() === highlightedWorkItemId,
    );
  }, [groupedItems, highlightedWorkItemId]);

  // Flat list navigation: all directions move linearly
  const navigate = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (groupedItems.length === 0) return;

      const cur = highlightedIndex;
      let next: number;

      if (cur === -1) {
        next =
          direction === 'up' || direction === 'left'
            ? groupedItems.length - 1
            : 0;
      } else if (direction === 'down' || direction === 'right') {
        next = (cur + 1) % groupedItems.length;
      } else {
        next = (cur - 1 + groupedItems.length) % groupedItems.length;
      }

      const item = groupedItems[next];
      if (item) onHighlight(item);
    },
    [groupedItems, highlightedIndex, onHighlight],
  );

  // Register keyboard bindings for list navigation
  useCommands('work-item-list-nav', [
    {
      label: 'Navigate Up',
      shortcut: 'up',
      handler: () => navigate('up'),
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Down',
      shortcut: 'down',
      handler: () => navigate('down'),
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Left',
      shortcut: 'left',
      handler: () => navigate('left'),
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Right',
      shortcut: 'right',
      handler: () => navigate('right'),
      hideInCommandPalette: true,
    },
  ]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && highlightedIndex < groupedItems.length) {
      const itemElement = itemRefs.current.get(highlightedIndex);
      itemElement?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [highlightedIndex, groupedItems.length]);

  // Empty state: no work items
  if (workItems.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center">
        <p className="text-sm text-neutral-400">No work items available</p>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Work items"
      className="space-y-0.5"
      data-work-item-list
    >
      {groupedItems.map((workItem, index) => {
        const isHighlighted = index === highlightedIndex;
        const isSelected = selectedWorkItemIds.includes(workItem.id.toString());
        const itemId = `work-item-${workItem.id}`;
        // Check if this item has a parent that is in the current list
        const hasParentInList =
          workItem.parentId && parentIdsInList.has(workItem.parentId);

        return (
          <button
            key={workItem.id}
            id={itemId}
            data-work-item-id={workItem.id}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(index, el);
              } else {
                itemRefs.current.delete(index);
              }
            }}
            type="button"
            role="option"
            aria-selected={isHighlighted || isSelected}
            onClick={() => {
              onHighlight(workItem);
              onToggleSelect(workItem);
            }}
            className={clsx(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left',
              isHighlighted && 'bg-neutral-700/50',
              !isHighlighted && 'hover:bg-neutral-700/30',
              hasParentInList && 'pl-6', // Add left indent for child items
            )}
          >
            {/* Selection checkbox */}
            <SelectionCheckbox checked={isSelected} />

            {/* Type icon */}
            <WorkItemTypeIcon type={workItem.fields.workItemType} />

            {/* Work item ID */}
            <span className="shrink-0 text-xs text-neutral-500">
              #{workItem.id}
            </span>

            {/* Title (truncated) */}
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
              {workItem.fields.title}
            </span>

            {/* Status badge */}
            <span
              className={clsx(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                getStatusColor(workItem.fields.state),
              )}
            >
              {workItem.fields.state}
            </span>

            {/* Owner avatar */}
            {workItem.fields.assignedTo && (
              <UserAvatar
                name={workItem.fields.assignedTo}
                title={
                  currentUser?.displayName &&
                  workItem.fields.assignedTo === currentUser.displayName
                    ? `${workItem.fields.assignedTo} (you)`
                    : workItem.fields.assignedTo
                }
                highlight={
                  !!currentUser?.displayName &&
                  workItem.fields.assignedTo === currentUser.displayName
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
