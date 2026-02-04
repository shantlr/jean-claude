import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitPullRequest, GitMerge } from 'lucide-react';

import type { AzureDevOpsPullRequest } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

function getStatusIcon(
  status: AzureDevOpsPullRequest['status'],
  isDraft: boolean,
) {
  if (isDraft) {
    return <GitPullRequest className="h-4 w-4 text-neutral-500" />;
  }
  switch (status) {
    case 'active':
      return <GitPullRequest className="h-4 w-4 text-green-500" />;
    case 'completed':
      return <GitMerge className="h-4 w-4 text-purple-500" />;
    case 'abandoned':
      return <GitPullRequest className="h-4 w-4 text-red-500" />;
  }
}

export function PrListItem({
  pr,
  projectId,
  isActive,
  basePath = 'project',
  projectName,
  projectColor,
}: {
  pr: AzureDevOpsPullRequest;
  projectId: string;
  isActive: boolean;
  basePath?: 'project' | 'all';
  projectName?: string;
  projectColor?: string;
}) {
  const linkProps =
    basePath === 'all'
      ? {
          to: '/all/prs/$projectId/$prId' as const,
          params: { projectId, prId: String(pr.id) },
        }
      : {
          to: '/projects/$projectId/prs/$prId' as const,
          params: { projectId, prId: String(pr.id) },
        };

  return (
    <Link
      {...linkProps}
      className={clsx(
        'group flex flex-col gap-1 rounded-lg px-3 py-2 transition-colors',
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {getStatusIcon(pr.status, pr.isDraft)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">#{pr.id}</span>
            {pr.isDraft && (
              <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 uppercase">
                Draft
              </span>
            )}
          </div>
          <p className="truncate text-sm font-medium text-neutral-200">
            {pr.title}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-6 text-xs text-neutral-500">
        {projectName && projectColor && (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: projectColor }}
            />
            <span className="max-w-16 truncate">{projectName}</span>
            <span>·</span>
          </>
        )}
        <span className="truncate">{pr.createdBy.displayName}</span>
        <span>·</span>
        <span className="shrink-0">{formatRelativeTime(pr.creationDate)}</span>
      </div>
    </Link>
  );
}
