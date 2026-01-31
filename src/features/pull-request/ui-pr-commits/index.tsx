import { GitCommit } from 'lucide-react';

import type { AzureDevOpsCommit } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

export function PrCommits({ commits }: { commits: AzureDevOpsCommit[] }) {
  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No commits
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {commits.map((commit) => (
        <div
          key={commit.commitId}
          className="flex items-start gap-3 rounded-lg bg-neutral-800/50 p-3"
        >
          <GitCommit className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-200">
              {commit.comment.split('\n')[0]}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
              <span className="font-mono">{commit.commitId.slice(0, 7)}</span>
              <span>·</span>
              <span>{commit.author.name}</span>
              <span>·</span>
              <span>{formatRelativeTime(commit.author.date)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
