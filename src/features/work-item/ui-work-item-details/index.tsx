import { Kbd } from '@/common/ui/kbd';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { useWorkItemComments } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';

import { WorkItemTypeIcon } from '../ui-work-item-shared';

export function WorkItemDetails({
  workItem,
  providerId,
  projectName,
}: {
  workItem: AzureDevOpsWorkItem | null;
  providerId?: string;
  projectName?: string;
}) {
  const workItemId = workItem?.id ?? null;
  const { data: comments = [], isLoading: isLoadingComments } =
    useWorkItemComments({
      providerId: providerId ?? null,
      projectName: projectName ?? null,
      workItemIds: workItemId ? [workItemId] : [],
    });

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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
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
          className="text-ink-2 text-xs"
        />
      )}

      {(isLoadingComments || comments.length > 0) && (
        <div className="border-glass-border my-3 border-t" />
      )}

      {isLoadingComments && (
        <p className="text-ink-3 text-xs">Loading comments...</p>
      )}

      {comments.length > 0 && (
        <div className="flex flex-col gap-3 pb-2">
          <div className="text-ink-3 text-[11px] font-medium tracking-wide uppercase">
            Comments
          </div>
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-md border px-3 py-2"
              style={{
                borderColor: 'oklch(1 0 0 / 0.06)',
                background: 'oklch(1 0 0 / 0.02)',
              }}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span className="text-ink-2 font-medium">
                  {comment.createdBy}
                </span>
                <span className="text-ink-3">
                  {new Date(comment.createdDate).toLocaleDateString()}
                </span>
              </div>
              <AzureHtmlContent
                html={comment.text}
                providerId={providerId}
                className="text-ink-2 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
