import type { AzureDevOpsCommit } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

export function PrCommits({
  commits,
  bottomPadding = 0,
}: {
  commits: AzureDevOpsCommit[];
  bottomPadding?: number;
}) {
  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No commits
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto p-4"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute top-0 bottom-0 left-[7px] w-0.5 bg-neutral-700" />

        {commits.map((commit, index) => {
          const isFirst = index === 0;
          const isLast = index === commits.length - 1;
          const shortHash = commit.commitId.slice(0, 7);
          const message = commit.comment.split('\n')[0];

          return (
            <div
              key={commit.commitId}
              className="group relative flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-neutral-800/60"
              style={isLast ? undefined : { marginBottom: '4px' }}
            >
              {/* Dot */}
              <div className="absolute top-[11px] left-[-16px] z-10 flex items-center justify-center">
                {isFirst ? (
                  /* HEAD indicator — larger dot with ring */
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 bg-blue-400/30" />
                ) : (
                  /* Regular commit dot */
                  <div className="h-2 w-2 rounded-full bg-neutral-400" />
                )}
              </div>

              {/* Clip the timeline line above and below the dots */}
              {isFirst && (
                <div className="absolute top-0 left-[3px] h-[11px] w-1.5 bg-neutral-900" />
              )}
              {isLast && (
                <div className="absolute bottom-0 left-[3px] h-[calc(100%-15px)] w-1.5 bg-neutral-900" />
              )}

              {/* Commit info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{message}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                  {commit.url ? (
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-neutral-400 transition-colors hover:text-blue-400 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(commit.url, '_blank');
                        e.preventDefault();
                      }}
                    >
                      {shortHash}
                    </a>
                  ) : (
                    <span className="font-mono text-neutral-400">
                      {shortHash}
                    </span>
                  )}
                  <span className="text-neutral-600">·</span>
                  <span>{commit.author.name}</span>
                  <span className="text-neutral-600">·</span>
                  <span>{formatRelativeTime(commit.author.date)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
