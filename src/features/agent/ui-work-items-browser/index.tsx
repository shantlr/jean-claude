import { Bug, FileText, Loader2, Search, X } from 'lucide-react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useWorkItems } from '@/hooks/use-work-items';
import { useWorkItemsFiltersStore } from '@/stores/new-task-form';

import type { AzureDevOpsWorkItem } from '../../../lib/api';

const STATE_OPTIONS = ['Active', 'New', 'Resolved', 'Closed'] as const;
const TYPE_OPTIONS = ['User Story', 'Bug', 'Task', 'Feature'] as const;

export function WorkItemsBrowser({
  localProjectId,
  providerId,
  projectId,
  projectName,
  onSelect,
  onClose,
}: {
  localProjectId: string;
  providerId: string;
  projectId: string;
  projectName: string;
  onSelect: (workItem: AzureDevOpsWorkItem) => void;
  onClose: () => void;
}) {
  const { filters, setFilters } = useWorkItemsFiltersStore(localProjectId);
  const debouncedSearchText = useDebouncedValue(filters.searchText, 300);

  const {
    data: workItems,
    isLoading,
    error,
  } = useWorkItems({
    providerId,
    projectId,
    projectName,
    filters: {
      states: filters.states.length > 0 ? filters.states : undefined,
      workItemTypes: filters.types.length > 0 ? filters.types : undefined,
      excludeWorkItemTypes: ['Test Suite', 'Epic', 'Feature'],
      searchText: debouncedSearchText || undefined,
    },
  });

  function toggleState(state: string) {
    setFilters({
      states: filters.states.includes(state)
        ? filters.states.filter((s) => s !== state)
        : [...filters.states, state],
    });
  }

  function toggleType(type: string) {
    setFilters({
      types: filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type],
    });
  }

  return (
    <div className="border-glass-border bg-bg-1 rounded-lg border p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-ink-1 text-sm font-medium">Work Items</span>
        <IconButton
          onClick={onClose}
          icon={<X />}
          size="sm"
          variant="ghost"
          tooltip="Close"
        />
      </div>

      {/* Search input */}
      <div className="mb-3">
        <Input
          type="text"
          value={filters.searchText}
          onChange={(e) => setFilters({ searchText: e.target.value })}
          placeholder="Search by title or ID..."
          size="sm"
          icon={<Search />}
        />
      </div>

      {/* Filters */}
      <div className="mb-3 space-y-2">
        {/* State filter */}
        <div>
          <span className="text-ink-2 mb-1 block text-xs">State</span>
          <div className="flex flex-wrap gap-1">
            {STATE_OPTIONS.map((state) => (
              <Button
                key={state}
                onClick={() => toggleState(state)}
                size="sm"
                variant={
                  filters.states.includes(state) ? 'primary' : 'secondary'
                }
                className="px-2 py-0.5 text-xs"
              >
                {state}
              </Button>
            ))}
          </div>
        </div>

        {/* Type filter */}
        <div>
          <span className="text-ink-2 mb-1 block text-xs">Type</span>
          <div className="flex flex-wrap gap-1">
            {TYPE_OPTIONS.map((type) => (
              <Button
                key={type}
                onClick={() => toggleType(type)}
                size="sm"
                variant={filters.types.includes(type) ? 'primary' : 'secondary'}
                className="px-2 py-0.5 text-xs"
              >
                {type}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Work items list */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading && (
          <div className="text-ink-2 flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm">Loading work items...</span>
          </div>
        )}

        {error && (
          <div className="text-status-fail py-4 text-center text-sm">
            Failed to load work items
          </div>
        )}

        {!isLoading && !error && workItems?.length === 0 && (
          <div className="text-ink-2 py-4 text-center text-sm">
            No work items found
          </div>
        )}

        {workItems?.map((wi) => (
          <button
            key={wi.id}
            type="button"
            onClick={() => onSelect(wi)}
            className="hover:bg-glass-medium flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
          >
            <span className="text-ink-3 shrink-0 text-xs">{wi.id}</span>
            {wi.fields.workItemType === 'Bug' ? (
              <Bug className="text-status-fail h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="text-acc-ink h-3.5 w-3.5 shrink-0" />
            )}
            <span className="text-ink-1 min-w-0 flex-1 truncate text-sm">
              {wi.fields.title}
            </span>
            <span className="text-ink-3 shrink-0 text-xs">
              {wi.fields.state}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
