import { Bug, BookOpen, CheckSquare, FileText } from 'lucide-react';

import { Kbd } from '@/common/ui/kbd';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import type { AzureDevOpsWorkItem } from '@/lib/api';

// Get icon component for work item type
function WorkItemTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'Bug':
      return <Bug className="text-status-fail h-4 w-4 shrink-0" />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className="text-acc-ink h-4 w-4 shrink-0" />;
    case 'Task':
      return <CheckSquare className="text-status-done h-4 w-4 shrink-0" />;
    default:
      return <FileText className="text-ink-2 h-4 w-4 shrink-0" />;
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
        <p className="text-ink-3 text-sm">Select a work item to see details</p>
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
        <span className="text-ink-2 text-sm font-medium">#{id}</span>
        <span className="text-ink-3 ml-auto flex items-center gap-1 text-xs">
          <Kbd shortcut="cmd+shift+o" /> open
        </span>
      </div>

      {/* Title */}
      <h3 className="text-ink-0 mt-2 text-sm font-medium">{title}</h3>

      {/* Metadata row */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {/* Assigned To */}
        <div className="flex items-center gap-1">
          <span className="text-ink-3">Assigned:</span>
          <span className="text-ink-1">{assignedTo ?? 'Unassigned'}</span>
        </div>

        {/* State */}
        <div className="flex items-center gap-1">
          <span className="text-ink-3">State:</span>
          <span className="text-ink-1">{state}</span>
        </div>
      </div>

      {/* Divider */}
      {fields.description && (
        <div className="border-glass-border my-3 border-t" />
      )}

      {/* Description (scrollable) */}
      {fields.description && (
        <AzureHtmlContent
          html={fields.description}
          providerId={providerId}
          className="text-ink-2 min-h-0 flex-1 overflow-y-auto text-xs"
        />
      )}
    </div>
  );
}
