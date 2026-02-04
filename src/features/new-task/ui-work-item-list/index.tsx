import clsx from 'clsx';
import { Bug, BookOpen, CheckSquare, FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AzureDevOpsWorkItem } from '@/lib/api';

// Get icon component for work item type
function WorkItemTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'Bug':
      return <Bug className="h-3.5 w-3.5 shrink-0 text-red-400" />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />;
    case 'Task':
      return <CheckSquare className="h-3.5 w-3.5 shrink-0 text-green-400" />;
    default:
      return <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />;
  }
}

// Get initials from a display name (e.g., "John Smith" -> "JS")
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Owner avatar circle with initials
function OwnerAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-600 text-[9px] font-medium text-neutral-200"
      title={name}
    >
      {getInitials(name)}
    </div>
  );
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
  highlightedIndex,
  selectedWorkItemId,
  onSelect,
}: {
  workItems: AzureDevOpsWorkItem[];
  highlightedIndex: number;
  selectedWorkItemId: string | null;
  onSelect: (workItem: AzureDevOpsWorkItem) => void;
}) {
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && highlightedIndex < workItems.length) {
      const itemElement = itemRefs.current.get(highlightedIndex);
      itemElement?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [highlightedIndex, workItems.length]);

  // Empty state: no work items
  if (workItems.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center">
        <p className="text-sm text-neutral-400">No work items available</p>
      </div>
    );
  }

  return (
    <div role="listbox" aria-label="Work items" className="space-y-0.5">
      {workItems.map((workItem, index) => {
        const isHighlighted = index === highlightedIndex;
        const isSelected = selectedWorkItemId === workItem.id.toString();
        const itemId = `work-item-${workItem.id}`;

        return (
          <button
            key={workItem.id}
            id={itemId}
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
            onClick={() => onSelect(workItem)}
            className={clsx(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left',
              isSelected && 'border-l-2 border-blue-500 bg-blue-600/20',
              isHighlighted && !isSelected && 'bg-neutral-700/50',
              !isHighlighted && !isSelected && 'hover:bg-neutral-700/30',
            )}
          >
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
              <OwnerAvatar name={workItem.fields.assignedTo} />
            )}
          </button>
        );
      })}
    </div>
  );
}
