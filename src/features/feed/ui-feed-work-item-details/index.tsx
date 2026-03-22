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
      return <Bug className={`${sizeClass} shrink-0 text-red-400`} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={`${sizeClass} shrink-0 text-blue-400`} />;
    case 'Task':
      return <CheckSquare className={`${sizeClass} shrink-0 text-green-400`} />;
    default:
      return <FileText className={`${sizeClass} shrink-0 text-neutral-400`} />;
  }
}

function StateBadge({ state }: { state: string }) {
  let color: 'neutral' | 'blue' | 'yellow' | 'green' = 'neutral';
  let ringClass = '';
  if (state === 'Active') {
    color = 'blue';
    ringClass = 'ring-1 ring-blue-400/30';
  } else if (state === 'New') {
    color = 'yellow';
    ringClass = 'ring-1 ring-yellow-400/30';
  } else if (state === 'Resolved' || state === 'Done' || state === 'Closed') {
    color = 'green';
    ringClass = 'ring-1 ring-green-400/30';
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
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-500">
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
      <div className="shrink-0 border-b border-neutral-700/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <WorkItemTypeIcon type={fields.workItemType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-400">
                #{workItem.id}
              </span>
              <span className="text-xs text-neutral-600">&bull;</span>
              <span className="text-xs text-neutral-400">
                {fields.workItemType}
              </span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-neutral-100">
              {fields.title}
            </h1>
          </div>
          {workItem.url && (
            <a
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
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
            <span className="text-neutral-500">Assigned to:</span>
            <span className="text-neutral-300">
              {fields.assignedTo ?? 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-500">Project:</span>
            <span className="text-neutral-300">{project.name}</span>
          </div>
        </div>
      </div>

      {/* Description (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {description ? (
          <AzureHtmlContent
            html={description}
            providerId={providerId ?? undefined}
            className="text-sm text-neutral-300"
          />
        ) : (
          <p className="text-sm text-neutral-500 italic">
            No description provided.
          </p>
        )}
      </div>
    </div>
  );
}
