import { ExternalLink, GitPullRequest, GitMerge } from 'lucide-react';

import { UserAvatar, getVoteLabel } from '@/common/ui/user-avatar';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

function getStatusBadge(
  status: AzureDevOpsPullRequestDetails['status'],
  isDraft: boolean,
) {
  if (isDraft) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-300">
        <GitPullRequest className="h-3 w-3" />
        Draft
      </span>
    );
  }
  switch (status) {
    case 'active':
      return (
        <span className="flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400">
          <GitPullRequest className="h-3 w-3" />
          Open
        </span>
      );
    case 'completed':
      return (
        <span className="flex items-center gap-1 rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
          <GitMerge className="h-3 w-3" />
          Merged
        </span>
      );
    case 'abandoned':
      return (
        <span className="flex items-center gap-1 rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400">
          <GitPullRequest className="h-3 w-3" />
          Closed
        </span>
      );
  }
}

function getBranchName(refName: string) {
  return refName.replace('refs/heads/', '');
}

export function PrHeader({ pr }: { pr: AzureDevOpsPullRequestDetails }) {
  // Filter out group reviewers (isContainer) - only show individual users
  const reviewers = pr.reviewers.filter((r) => !r.isContainer);

  return (
    <div className="border-b border-neutral-700 p-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">#{pr.id}</span>
            <div className="flex">{getStatusBadge(pr.status, pr.isDraft)}</div>
            <div className="grow" />
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-600"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Azure DevOps
            </a>
          </div>

          {/* TITLE */}
          <h1 className="text-lg font-semibold text-neutral-100">{pr.title}</h1>

          <div className="flex w-full items-center gap-x-4 text-neutral-400">
            <div className="flex items-center gap-1">
              <span className="text-neutral-500">by</span>
              <span>{pr.createdBy.displayName}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-blue-400">
                {getBranchName(pr.sourceRefName)}
              </span>
              <span className="text-neutral-500">→</span>
              <span className="font-mono text-green-400">
                {getBranchName(pr.targetRefName)}
              </span>
            </div>
            <div className="grow">{formatRelativeTime(pr.creationDate)}</div>

            <div className="flex justify-end -space-x-1">
              {reviewers.map((reviewer) => (
                <UserAvatar
                  key={reviewer.uniqueName}
                  name={reviewer.displayName}
                  title={`${reviewer.displayName} - ${getVoteLabel(reviewer.voteStatus)}`}
                  size="md"
                  vote={reviewer.voteStatus}
                  variant="border"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
