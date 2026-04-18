import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitPullRequest, GitMerge } from 'lucide-react';

import { UserAvatar } from '@/common/ui/user-avatar';
import type { AzureDevOpsPullRequest } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

function getStatusIcon(
  status: AzureDevOpsPullRequest['status'],
  isDraft: boolean,
) {
  if (isDraft) {
    return <GitPullRequest className="text-ink-3 h-4 w-4" />;
  }
  switch (status) {
    case 'active':
      return <GitPullRequest className="text-status-done h-4 w-4" />;
    case 'completed':
      return <GitMerge className="text-acc-ink h-4 w-4" />;
    case 'abandoned':
      return <GitPullRequest className="text-status-fail h-4 w-4" />;
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

  // Get individual users (not groups) who have voted (approved or rejected)
  const reviewersWithVotes = pr.reviewers.filter(
    (r) => r.voteStatus !== 'none' && !r.isContainer,
  );

  return (
    <Link
      {...linkProps}
      className={clsx(
        'group flex flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors',
        isActive ? 'bg-glass-medium' : 'hover:bg-glass-light',
      )}
    >
      {/* Top row: icon, PR number, draft badge */}
      <div className="flex items-center gap-2">
        <div className="shrink-0">{getStatusIcon(pr.status, pr.isDraft)}</div>
        <span className="text-ink-3 text-xs">#{pr.id}</span>
        {pr.isDraft && (
          <span className="text-ink-2 bg-glass-medium rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
            Draft
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-ink-1 truncate text-sm font-medium">{pr.title}</p>

      {/* Bottom row: metadata and reviewers */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-ink-3 flex min-w-0 items-center gap-1.5 text-xs">
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
          <span className="shrink-0">
            {formatRelativeTime(pr.creationDate)}
          </span>
        </div>

        {/* Reviewer avatars */}
        {reviewersWithVotes.length > 0 && (
          <div className="flex shrink-0 -space-x-1">
            {reviewersWithVotes.slice(0, 3).map((reviewer) => (
              <UserAvatar
                key={reviewer.uniqueName}
                name={reviewer.displayName}
                vote={reviewer.voteStatus}
              />
            ))}
            {reviewersWithVotes.length > 3 && (
              <div className="bg-bg-3 text-ink-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium">
                +{reviewersWithVotes.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
