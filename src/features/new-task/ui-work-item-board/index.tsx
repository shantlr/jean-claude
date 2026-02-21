import clsx from 'clsx';
import { useCallback, useEffect, useMemo } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { UserAvatar } from '@/common/ui/user-avatar';
import { useCurrentAzureUser } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';

import { WorkItemTypeIcon, SelectionCheckbox } from '../ui-work-item-shared';

// Status workflow order for board column positioning (lower = further left in flow)
const STATUS_WORKFLOW_ORDER: Record<string, number> = {
  New: 1,
  'To Do': 1.5,
  Active: 2,
  'In Progress': 2.5,
  'In Design': 2.5,
  Resolved: 3,
  Deployed: 3.5,
  Closed: 4,
  Done: 4.5,
  Removed: 5,
};

function getStatusWorkflowOrder(status: string): number {
  return STATUS_WORKFLOW_ORDER[status] ?? 3;
}

// Column header color
function getColumnColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'new':
    case 'to do':
      return 'border-neutral-500';
    case 'active':
    case 'in progress':
    case 'in design':
      return 'border-blue-500';
    case 'resolved':
    case 'done':
    case 'closed':
    case 'deployed':
      return 'border-green-500';
    case 'removed':
      return 'border-red-500';
    default:
      return 'border-neutral-500';
  }
}

export function WorkItemBoard({
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
  const { data: currentUser } = useCurrentAzureUser(providerId ?? null);

  // Group work items by state
  const columns = useMemo(() => {
    const groups = new Map<string, AzureDevOpsWorkItem[]>();
    for (const item of workItems) {
      const state = item.fields.state;
      const group = groups.get(state) ?? [];
      group.push(item);
      groups.set(state, group);
    }

    // Sort columns by status priority
    return [...groups.entries()]
      .sort(([a], [b]) => getStatusWorkflowOrder(a) - getStatusWorkflowOrder(b))
      .map(([state, items]) => ({ state, items }));
  }, [workItems]);

  // Board navigation: up/down within column, left/right across columns
  const navigate = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right' | 'first' | 'last') => {
      if (columns.length === 0) return;

      // Find current position [col, row]
      let curCol = -1;
      let curRow = -1;
      if (highlightedWorkItemId) {
        for (let c = 0; c < columns.length; c++) {
          const r = columns[c].items.findIndex(
            (wi) => wi.id.toString() === highlightedWorkItemId,
          );
          if (r !== -1) {
            curCol = c;
            curRow = r;
            break;
          }
        }
      }

      // Find first/last non-empty column
      const firstCol = columns.findIndex((c) => c.items.length > 0);
      if (firstCol === -1) return; // all empty

      if (direction === 'first') {
        onHighlight(columns[firstCol].items[0]);
        return;
      }
      if (direction === 'last') {
        for (let c = columns.length - 1; c >= 0; c--) {
          if (columns[c].items.length > 0) {
            onHighlight(columns[c].items[columns[c].items.length - 1]);
            return;
          }
        }
        return;
      }

      // No current highlight — start at first item
      if (curCol === -1) {
        onHighlight(columns[firstCol].items[0]);
        return;
      }

      const col = columns[curCol].items;

      if (direction === 'up') {
        onHighlight(col[(curRow - 1 + col.length) % col.length]);
      } else if (direction === 'down') {
        onHighlight(col[(curRow + 1) % col.length]);
      } else {
        // left or right — find next non-empty column
        const step = direction === 'left' ? -1 : 1;
        let nextCol = curCol + step;
        while (
          nextCol >= 0 &&
          nextCol < columns.length &&
          columns[nextCol].items.length === 0
        ) {
          nextCol += step;
        }
        if (nextCol < 0 || nextCol >= columns.length) return; // stay put
        onHighlight(
          columns[nextCol].items[
            Math.min(curRow, columns[nextCol].items.length - 1)
          ],
        );
      }
    },
    [columns, highlightedWorkItemId, onHighlight],
  );

  // Register keyboard bindings for board navigation
  useCommands('work-item-board-nav', [
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
    {
      label: 'Navigate to First',
      shortcut: 'cmd+up',
      handler: () => navigate('first'),
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate to Last',
      shortcut: 'cmd+down',
      handler: () => navigate('last'),
      hideInCommandPalette: true,
    },
  ]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (!highlightedWorkItemId) return;
    const el = document.querySelector(
      `[data-work-item-list] [data-work-item-id="${highlightedWorkItemId}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [highlightedWorkItemId]);

  if (workItems.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center">
        <p className="text-sm text-neutral-400">No work items available</p>
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-auto pb-2" data-work-item-list>
      {columns.map(({ state, items }) => (
        <div
          key={state}
          className="flex w-56 shrink-0 flex-col rounded bg-neutral-800/50"
        >
          {/* Column header */}
          <div
            className={clsx('border-t-2 px-2 py-1.5', getColumnColor(state))}
          >
            <span className="text-xs font-medium text-neutral-300">
              {state}
            </span>
            <span className="ml-1.5 text-xs text-neutral-500">
              {items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-1 p-1.5">
            {items.map((workItem) => {
              const isHighlighted =
                workItem.id.toString() === highlightedWorkItemId;
              const isSelected = selectedWorkItemIds.includes(
                workItem.id.toString(),
              );

              return (
                <button
                  key={workItem.id}
                  type="button"
                  data-work-item-id={workItem.id}
                  onClick={() => {
                    onHighlight(workItem);
                    onToggleSelect(workItem);
                  }}
                  className={clsx(
                    'flex flex-col gap-1.5 rounded border p-2 text-left',
                    isHighlighted
                      ? 'border-blue-500 bg-neutral-700/70'
                      : 'border-neutral-700 hover:border-neutral-600',
                  )}
                >
                  {/* Top row: checkbox + type icon + id */}
                  <div className="flex items-center gap-1.5">
                    <SelectionCheckbox checked={isSelected} size="sm" />
                    <WorkItemTypeIcon
                      type={workItem.fields.workItemType}
                      size="sm"
                    />
                    <span className="text-[10px] text-neutral-500">
                      #{workItem.id}
                    </span>
                    {/* Assignee (far right) */}
                    <div className="ml-auto">
                      {workItem.fields.assignedTo && (
                        <UserAvatar
                          name={workItem.fields.assignedTo}
                          title={
                            currentUser?.displayName &&
                            workItem.fields.assignedTo ===
                              currentUser.displayName
                              ? `${workItem.fields.assignedTo} (you)`
                              : workItem.fields.assignedTo
                          }
                          highlight={
                            !!currentUser?.displayName &&
                            workItem.fields.assignedTo ===
                              currentUser.displayName
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* Title (2-line clamp) */}
                  <span className="line-clamp-2 text-xs text-neutral-200">
                    {workItem.fields.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
