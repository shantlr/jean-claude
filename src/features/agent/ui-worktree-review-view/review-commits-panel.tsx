import clsx from 'clsx';
import { Loader2 } from 'lucide-react';



import { formatRelativeTime } from '@/lib/time';
import type { WorktreeCommit } from '@/lib/api';


export function ReviewCommitsPanel({
  commits,
  isLoading,
  selectedCommitHash,
  onSelectCommit,
}: {
  commits: WorktreeCommit[];
  isLoading: boolean;
  selectedCommitHash: string | null;
  onSelectCommit: (hash: string | null) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        No commits yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-1 py-1">
      {commits.map((commit, index) => {
        const isFirst = index === 0;
        const isSelected = selectedCommitHash === commit.hash;

        return (
          <button
            key={commit.hash}
            onClick={() => onSelectCommit(isSelected ? null : commit.hash)}
            className={clsx(
              'group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
              isSelected ? 'bg-acc/10' : 'hover:bg-bg-1/60',
            )}
          >
            {/* Dot */}
            <div className="flex shrink-0 items-center justify-center">
              {isFirst ? (
                <div className="border-acc bg-acc/30 h-2.5 w-2.5 rounded-full border-[1.5px]" />
              ) : (
                <div
                  className={clsx(
                    'h-1.5 w-1.5 rounded-full',
                    isSelected ? 'bg-acc' : 'bg-ink-4',
                  )}
                />
              )}
            </div>

            {/* Message */}
            <span className="text-ink-1 min-w-0 flex-1 truncate text-xs">
              {commit.message}
            </span>

            {/* Hash + time */}
            <span className="text-ink-4 shrink-0 font-mono text-[10px]">
              {commit.shortHash}
            </span>
            <span className="text-ink-4 shrink-0 text-[10px]">
              {formatRelativeTime(commit.date)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
