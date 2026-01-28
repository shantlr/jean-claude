import { Bug, FileText, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useWorkItems } from '@/hooks/use-work-items';

import type { AzureDevOpsWorkItem } from '../../../lib/api';

const STATE_OPTIONS = ['Active', 'New', 'Resolved', 'Closed'] as const;
const TYPE_OPTIONS = ['User Story', 'Bug', 'Task', 'Feature'] as const;

export function WorkItemsBrowser({
  providerId,
  projectId,
  onSelect,
  onClose,
}: {
  providerId: string;
  projectId: string;
  onSelect: (workItem: AzureDevOpsWorkItem) => void;
  onClose: () => void;
}) {
  const [selectedStates, setSelectedStates] = useState<string[]>(['Active']);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const { data: workItems, isLoading, error } = useWorkItems({
    providerId,
    projectId,
    filters: {
      states: selectedStates.length > 0 ? selectedStates : undefined,
      workItemTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
    },
  });

  function toggleState(state: string) {
    setSelectedStates((prev) =>
      prev.includes(state)
        ? prev.filter((s) => s !== state)
        : [...prev, state],
    );
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type],
    );
  }

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-200">
          Work Items
        </span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-neutral-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="mb-3 space-y-2">
        {/* State filter */}
        <div>
          <span className="mb-1 block text-xs text-neutral-400">State</span>
          <div className="flex flex-wrap gap-1">
            {STATE_OPTIONS.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => toggleState(state)}
                className={`cursor-pointer rounded px-2 py-0.5 text-xs transition-colors ${
                  selectedStates.includes(state)
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter */}
        <div>
          <span className="mb-1 block text-xs text-neutral-400">Type</span>
          <div className="flex flex-wrap gap-1">
            {TYPE_OPTIONS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`cursor-pointer rounded px-2 py-0.5 text-xs transition-colors ${
                  selectedTypes.includes(type)
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Work items list */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm">Loading work items...</span>
          </div>
        )}

        {error && (
          <div className="py-4 text-center text-sm text-red-400">
            Failed to load work items
          </div>
        )}

        {!isLoading && !error && workItems?.length === 0 && (
          <div className="py-4 text-center text-sm text-neutral-400">
            No work items found
          </div>
        )}

        {workItems?.map((wi) => (
          <button
            key={wi.id}
            type="button"
            onClick={() => onSelect(wi)}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-700"
          >
            <span className="shrink-0 text-xs text-neutral-500">
              {wi.id}
            </span>
            {wi.fields.workItemType === 'Bug' ? (
              <Bug className="h-3.5 w-3.5 shrink-0 text-red-400" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
              {wi.fields.title}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">
              {wi.fields.state}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
