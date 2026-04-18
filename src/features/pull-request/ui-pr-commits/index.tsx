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
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
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
        <div className="bg-glass-medium absolute top-0 bottom-0 left-[7px] w-0.5" />

        {commits.map((commit, index) => {
          const isFirst = index === 0;
          const isLast = index === commits.length - 1;
          const shortHash = commit.commitId.slice(0, 7);
          const message = commit.comment.split('\n')[0];

          return (
            <div
              key={commit.commitId}
              className="group hover:bg-bg-1/60 relative flex items-start gap-3 rounded-md px-2 py-2 transition-colors"
              style={isLast ? undefined : { marginBottom: '4px' }}
            >
              {/* Dot */}
              <div className="absolute top-[11px] left-[-16px] z-10 flex -translate-x-1/2 items-center justify-center">
                {isFirst ? (
                  /* HEAD indicator — larger dot with ring */
                  <div className="border-acc bg-acc/30 h-3.5 w-3.5 rounded-full border-2" />
                ) : (
                  /* Regular commit dot */
                  <div className="bg-bg-2 h-2 w-2 rounded-full" />
                )}
              </div>

              {/* Clip the timeline line above and below the dots */}
              {isFirst && (
                <div className="bg-bg-0 absolute top-0 left-[3px] h-[11px] w-1.5" />
              )}
              {isLast && (
                <div className="bg-bg-0 absolute bottom-0 left-[3px] h-[calc(100%-15px)] w-1.5" />
              )}

              {/* Commit info */}
              <div className="min-w-0 flex-1">
                <p className="text-ink-1 truncate text-sm">{message}</p>
                <div className="text-ink-3 mt-0.5 flex items-center gap-1.5 text-xs">
                  {commit.url ? (
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-2 hover:text-acc-ink font-mono transition-colors hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(commit.url, '_blank');
                        e.preventDefault();
                      }}
                    >
                      {shortHash}
                    </a>
                  ) : (
                    <span className="text-ink-2 font-mono">{shortHash}</span>
                  )}
                  <span className="text-ink-4">·</span>
                  <span>{commit.author.name}</span>
                  <span className="text-ink-4">·</span>
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
