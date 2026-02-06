import { Bug, BookOpen, CheckSquare, FileText } from 'lucide-react';

import { Kbd } from '@/common/ui/kbd';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import type { AzureDevOpsWorkItem } from '@/lib/api';

// Get icon component for work item type
function WorkItemTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'Bug':
      return <Bug className="h-4 w-4 shrink-0 text-red-400" />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className="h-4 w-4 shrink-0 text-blue-400" />;
    case 'Task':
      return <CheckSquare className="h-4 w-4 shrink-0 text-green-400" />;
    default:
      return <FileText className="h-4 w-4 shrink-0 text-neutral-400" />;
  }
}

export function WorkItemDetails({
  workItem,
  providerId,
}: {
  workItem: AzureDevOpsWorkItem | null;
  providerId?: string;
}) {
  // Empty state when no work item is selected
  if (!workItem) {
    return (
      <div className="flex h-full min-h-37.5 items-center justify-center">
        <p className="text-sm text-neutral-500">
          Select a work item to see details
        </p>
      </div>
    );
  }

  const { id, fields } = workItem;
  const { title, workItemType, state, assignedTo } = fields;

  return (
    <div className="flex h-full flex-col">
      {/* Header: Type icon + ID + open hint */}
      <div className="flex items-center gap-2">
        <WorkItemTypeIcon type={workItemType} />
        <span className="text-sm font-medium text-neutral-400">#{id}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-neutral-500">
          <Kbd shortcut="cmd+o" /> open
        </span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-sm font-medium text-neutral-100">{title}</h3>

      {/* Metadata row */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {/* Assigned To */}
        <div className="flex items-center gap-1">
          <span className="text-neutral-500">Assigned:</span>
          <span className="text-neutral-300">{assignedTo ?? 'Unassigned'}</span>
        </div>

        {/* State */}
        <div className="flex items-center gap-1">
          <span className="text-neutral-500">State:</span>
          <span className="text-neutral-300">{state}</span>
        </div>
      </div>

      {/* Divider */}
      {fields.description && (
        <div className="my-3 border-t border-neutral-700" />
      )}

      {/* Description (scrollable) */}
      {fields.description && (
        <AzureHtmlContent
          html={fields.description}
          providerId={providerId}
          className="min-h-0 flex-1 overflow-y-auto text-xs text-neutral-400"
        />
      )}
    </div>
  );
}
