import { ExternalLink, GitPullRequest, GitMerge } from 'lucide-react';

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

function getVoteBorderColor(vote: number) {
  if (vote >= 10) return 'border-green-500';
  if (vote > 0) return 'border-green-400';
  if (vote === 0) return 'border-neutral-600';
  if (vote > -10) return 'border-yellow-500';
  return 'border-red-500';
}

function getVoteLabel(vote: number) {
  if (vote === 10) return 'Approved';
  if (vote === 5) return 'Approved with suggestions';
  if (vote === -5) return 'Waiting for author';
  if (vote === -10) return 'Rejected';
  return 'No vote';
}

function getInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

function isGroupReviewer(uniqueName: string) {
  // Group reviewers typically have uniqueName starting with 'vstfs:' or containing backslash for team names
  return uniqueName.startsWith('vstfs:') || uniqueName.includes('\\');
}

export function PrHeader({ pr }: { pr: AzureDevOpsPullRequestDetails }) {
  const reviewers = pr.reviewers.filter((r) => !isGroupReviewer(r.uniqueName));
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
                <div
                  key={reviewer.uniqueName}
                  title={`${reviewer.displayName} - ${getVoteLabel(reviewer.vote)}`}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-neutral-700 text-xs font-medium text-neutral-200 ${getVoteBorderColor(reviewer.vote)}`}
                >
                  {getInitials(reviewer.displayName)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
