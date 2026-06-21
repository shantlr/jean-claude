import { Columns3, List } from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import Fuse from 'fuse.js';
import type React from 'react';


import { useIterations, useWorkItems } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { Select } from '@/common/ui/select';
import type { SelectOption } from '@/common/ui/select';
import { WorkItemBoard } from '@/features/work-item/ui-work-item-board';
import { WorkItemList } from '@/features/work-item/ui-work-item-list';
import { WorkItemPreview } from '@/features/work-item/ui-work-item-preview';
import type { WorkItemsViewMode } from '@/stores/new-task-draft';



export type { WorkItemsViewMode };

const STATUS_URGENCY: Record<string, number> = {
  Active: 1,
  'In Progress': 2,
  'In Design': 2.1,
  'To Do': 2.1,
  New: 3,
  Resolved: 4,
  Deployed: 4.5,
  Closed: 5,
  Done: 6,
  Removed: 7,
};

function getStatusUrgency(status: string): number {
  return STATUS_URGENCY[status] ?? 3;
}

const DEFAULT_EXCLUDE_TYPES = ['Test Suite', 'Test Case', 'Epic', 'Feature'];

export function WorkItemPicker({
  providerId,
  projectId,
  projectName,
  selectedWorkItemIds,
  onToggleSelect,
  onClearSelection,
  onHighlightChange,
  filter,
  viewMode: controlledViewMode,
  onViewModeChange,
  iterationFilter: controlledIterationFilter,
  onIterationFilterChange,
  panelWidth: controlledPanelWidth,
  onPanelWidthChange,
  excludeWorkItemTypes = DEFAULT_EXCLUDE_TYPES,
  headerRight,
}: {
  providerId: string;
  projectId: string;
  projectName: string;
  selectedWorkItemIds: string[];
  onToggleSelect: (workItem: AzureDevOpsWorkItem) => void;
  onClearSelection?: () => void;
  /** Called when the highlighted work item changes (for external keyboard shortcuts). */
  onHighlightChange?: (workItemId: string | null) => void;
  filter?: string;
  viewMode?: WorkItemsViewMode;
  onViewModeChange?: (mode: WorkItemsViewMode) => void;
  iterationFilter?: string;
  onIterationFilterChange?: (iterationFilter: string) => void;
  /** Controlled panel width percentage. If omitted, internal state is used. */
  panelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
  excludeWorkItemTypes?: string[];
  headerRight?: React.ReactNode;
}) {
  // View mode: controlled or uncontrolled
  const [internalViewMode, setInternalViewMode] =
    useState<WorkItemsViewMode>('board');
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = useCallback(
    (mode: WorkItemsViewMode) => {
      if (onViewModeChange) {
        onViewModeChange(mode);
      } else {
        setInternalViewMode(mode);
      }
    },
    [onViewModeChange],
  );

  // Iteration state
  const [internalIterationFilter, setInternalIterationFilter] =
    useState<string>('__current__');
  const selectedIteration =
    controlledIterationFilter ?? internalIterationFilter;
  const setSelectedIteration = useCallback(
    (iterationFilter: string) => {
      if (onIterationFilterChange) {
        onIterationFilterChange(iterationFilter);
      } else {
        setInternalIterationFilter(iterationFilter);
      }
    },
    [onIterationFilterChange],
  );

  // Reset iteration when project changes
  useEffect(() => {
    if (controlledIterationFilter === undefined) {
      startTransition(() => setInternalIterationFilter('__current__'));
    }
  }, [projectId, controlledIterationFilter]);

  // Fetch iterations
  const { data: iterations } = useIterations({ providerId, projectName });

  // Resolve iteration path
  const currentIteration = useMemo(
    () => iterations?.find((i) => i.isCurrent),
    [iterations],
  );

  const resolvedIterationPath = useMemo(() => {
    if (selectedIteration === '__current__') {
      return currentIteration?.path;
    }
    if (selectedIteration === '__all__') {
      return undefined;
    }
    return selectedIteration;
  }, [selectedIteration, currentIteration]);

  // Iteration dropdown options
  const iterationOptions = useMemo<SelectOption<string>[]>(() => {
    if (!iterations) return [];
    const options: SelectOption<string>[] = [
      {
        value: '__current__',
        label: `Current: ${currentIteration?.name ?? 'Unknown'}`,
      },
      { value: '__all__', label: 'All Iterations' },
    ];
    const reversed = [...iterations].reverse();
    for (const iter of reversed) {
      if (iter.isCurrent) continue;
      options.push({ value: iter.path, label: iter.name });
    }
    return options;
  }, [iterations, currentIteration]);

  useEffect(() => {
    if (!iterations || iterationOptions.length === 0) return;
    if (iterationOptions.some((option) => option.value === selectedIteration)) {
      return;
    }

    startTransition(() => setSelectedIteration('__current__'));
  }, [iterations, iterationOptions, selectedIteration, setSelectedIteration]);

  // Fetch work items
  const { data: workItems, isLoading } = useWorkItems({
    providerId,
    projectId,
    projectName,
    filters: {
      excludeWorkItemTypes,
      iterationPath: resolvedIterationPath,
    },
  });

  // Fuse.js filtering
  const fuse = useMemo(() => {
    if (!workItems) return null;
    return new Fuse(workItems, {
      keys: ['fields.title', 'id'],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [workItems]);

  const filteredWorkItems = useMemo(() => {
    if (!workItems) return [];
    if (!filter || !fuse) {
      // Sort by status urgency
      return [...workItems].sort(
        (a, b) =>
          getStatusUrgency(a.fields.state) - getStatusUrgency(b.fields.state),
      );
    }
    return fuse.search(filter).map((r) => r.item);
  }, [workItems, filter, fuse]);

  // Highlight state
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const highlightedWorkItem = useMemo(() => {
    if (highlightedId) {
      const item = filteredWorkItems.find(
        (wi) => wi.id.toString() === highlightedId,
      );
      if (item) return item;
    }
    // Fall back to first selected
    if (selectedWorkItemIds.length > 0) {
      const item = filteredWorkItems.find(
        (wi) => wi.id.toString() === selectedWorkItemIds[0],
      );
      if (item) return item;
    }
    return null;
  }, [highlightedId, filteredWorkItems, selectedWorkItemIds]);

  const handleHighlight = useCallback(
    (workItem: AzureDevOpsWorkItem) => {
      const id = workItem.id.toString();
      startTransition(() => {
        setHighlightedId(id);
      });
      onHighlightChange?.(id);
    },
    [onHighlightChange],
  );

  // Resizable panel (controlled or uncontrolled)
  const [internalPanelWidth, setInternalPanelWidth] = useState(65);
  const panelWidth = controlledPanelWidth ?? internalPanelWidth;
  const setPanelWidth = useCallback(
    (width: number) => {
      if (onPanelWidthChange) {
        onPanelWidthChange(width);
      } else {
        setInternalPanelWidth(width);
      }
    },
    [onPanelWidthChange],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
      isDragging.current = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current || !isDragging.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        setPanelWidth(Math.min(80, Math.max(30, pct)));
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-ink-2 text-sm">Loading work items...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left panel */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: `${panelWidth}%` }}
      >
        {/* Header toolbar */}
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
        >
          {/* Count */}
          <span className="text-ink-2 text-xs">
            {filteredWorkItems.length} items
          </span>

          {/* Selected count badge */}
          {selectedWorkItemIds.length > 0 && (
            <span className="bg-acc/20 text-acc-ink rounded-full px-2 py-0.5 text-xs font-medium">
              {selectedWorkItemIds.length} selected
            </span>
          )}

          {/* Clear selected button */}
          {viewMode === 'board' &&
            selectedWorkItemIds.length > 0 &&
            onClearSelection && (
              <button
                type="button"
                className="text-ink-2 hover:text-ink-1 text-xs underline"
                onClick={onClearSelection}
              >
                Clear selected
              </button>
            )}

          <div className="flex-1" />

          {/* Iteration dropdown */}
          {iterations && iterations.length > 0 && (
            <Select
              value={selectedIteration}
              options={iterationOptions}
              onChange={setSelectedIteration}
            />
          )}

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className={clsx(
                'rounded p-1',
                viewMode === 'list'
                  ? 'bg-bg-2 text-ink-1'
                  : 'text-ink-3 hover:text-ink-2',
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={clsx(
                'rounded p-1',
                viewMode === 'board'
                  ? 'bg-bg-2 text-ink-1'
                  : 'text-ink-3 hover:text-ink-2',
              )}
              onClick={() => setViewMode('board')}
            >
              <Columns3 className="h-4 w-4" />
            </button>
          </div>

          {/* Header right slot */}
          {headerRight}
        </div>

        {/* Items */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {viewMode === 'list' ? (
            <WorkItemList
              workItems={filteredWorkItems}
              highlightedWorkItemId={highlightedId}
              selectedWorkItemIds={selectedWorkItemIds}
              providerId={providerId}
              search={filter ?? ''}
              onToggleSelect={onToggleSelect}
              onHighlight={handleHighlight}
            />
          ) : (
            <WorkItemBoard
              workItems={filteredWorkItems}
              highlightedWorkItemId={highlightedId}
              selectedWorkItemIds={selectedWorkItemIds}
              providerId={providerId}
              search={filter ?? ''}
              onToggleSelect={onToggleSelect}
              onHighlight={handleHighlight}
            />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="hover:bg-bg-3 active:bg-bg-2 w-1 shrink-0 cursor-col-resize"
        onMouseDown={handleDragStart}
      />

      {/* Right panel: details */}
      <div
        className="min-w-0 flex-1 overflow-y-auto border-l p-3"
        style={{
          borderColor: 'oklch(1 0 0 / 0.04)',
          background: 'oklch(0 0 0 / 0.22)',
        }}
      >
        <WorkItemPreview
          workItem={highlightedWorkItem}
          providerId={providerId}
          projectName={projectName}
        />
      </div>
    </div>
  );
}
