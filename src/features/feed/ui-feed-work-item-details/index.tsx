import {
  Bug,
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileText,
  Loader2,
} from 'lucide-react';

import { Chip } from '@/common/ui/chip';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { useProject } from '@/hooks/use-projects';
import { useWorkItemById } from '@/hooks/use-work-items';

function WorkItemTypeIcon({
  type,
  size = 'md',
}: {
  type: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (type) {
    case 'Bug':
      return <Bug className={`${sizeClass} text-status-fail shrink-0`} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={`${sizeClass} text-acc-ink shrink-0`} />;
    case 'Task':
      return (
        <CheckSquare className={`${sizeClass} text-status-done shrink-0`} />
      );
    default:
      return <FileText className={`${sizeClass} text-ink-2 shrink-0`} />;
  }
}

function StateBadge({ state }: { state: string }) {
  let color: 'neutral' | 'blue' | 'yellow' | 'green' = 'neutral';
  let ringClass = '';
  if (state === 'Active') {
    color = 'blue';
    ringClass = 'ring-1 ring-acc/30';
  } else if (state === 'New') {
    color = 'yellow';
    ringClass = 'ring-1 ring-status-run/30';
  } else if (state === 'Resolved' || state === 'Done' || state === 'Closed') {
    color = 'green';
    ringClass = 'ring-1 ring-status-done/30';
  }
  return (
    <Chip size="sm" color={color} className={ringClass}>
      {state}
    </Chip>
  );
}

export function FeedWorkItemDetails({
  projectId,
  workItemId,
}: {
  projectId: string;
  workItemId: number;
}) {
  const { data: project } = useProject(projectId);
  const providerId = project?.workItemProviderId ?? null;

  const {
    data: workItem,
    isLoading,
    error,
  } = useWorkItemById({
    providerId,
    workItemId,
  });

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-ink-3 text-sm">
          {error ? 'Failed to load work item' : 'Work item not found'}
        </p>
      </div>
    );
  }

  const { fields } = workItem;
  const description = fields.description || fields.reproSteps;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-glass-border/50 shrink-0 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <WorkItemTypeIcon type={fields.workItemType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-ink-2 text-sm font-medium">
                #{workItem.id}
              </span>
              <span className="text-ink-4 text-xs">&bull;</span>
              <span className="text-ink-2 text-xs">{fields.workItemType}</span>
            </div>
            <h1 className="text-ink-0 mt-1 text-lg font-semibold">
              {fields.title}
            </h1>
          </div>
          {workItem.url && (
            <a
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:border-glass-border hover:text-ink-1 border-glass-border flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
              title="Open in Azure DevOps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StateBadge state={fields.state} />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-3">Assigned to:</span>
            <span className="text-ink-1">
              {fields.assignedTo ?? 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-3">Project:</span>
            <span className="text-ink-1">{project.name}</span>
          </div>
        </div>
      </div>

      {/* Description (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {description ? (
          <AzureHtmlContent
            html={description}
            providerId={providerId ?? undefined}
            className="text-ink-1 text-sm"
          />
        ) : (
          <p className="text-ink-3 text-sm italic">No description provided.</p>
        )}
      </div>
    </div>
  );
}
