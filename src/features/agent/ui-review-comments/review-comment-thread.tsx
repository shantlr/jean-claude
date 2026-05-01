import clsx from 'clsx';
import { Sparkles, Trash2 } from 'lucide-react';

import type { ReviewComment } from '@/stores/review-comments';

function StatusPill({ status }: { status: ReviewComment['status'] }) {
  const config = {
    open: { color: 'text-ink-3', bg: 'bg-bg-3', label: 'open', pulse: false },
    queued: {
      color: 'text-ink-3',
      bg: 'bg-bg-3',
      label: 'queued',
      pulse: false,
    },
    working: {
      color: 'text-status-run',
      bg: 'bg-status-run-soft',
      label: 'working',
      pulse: true,
    },
    addressed: {
      color: 'text-status-done',
      bg: 'bg-status-done-soft',
      label: '\u2713 addressed',
      pulse: false,
    },
    partial: {
      color: 'text-status-run',
      bg: 'bg-status-run-soft',
      label: '\u25D0 partial',
      pulse: false,
    },
    skipped: {
      color: 'text-ink-3',
      bg: 'bg-bg-3',
      label: '\u2298 skipped',
      pulse: false,
    },
    resolved: {
      color: 'text-ink-3',
      bg: 'bg-bg-2',
      label: 'resolved',
      pulse: false,
    },
  }[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium tracking-wide lowercase',
        config.bg,
        config.color,
        config.pulse && 'animate-pulse',
      )}
    >
      {config.label}
    </span>
  );
}

export function ReviewCommentThread({
  comment,
  showStatus,
  onResolve,
  onDelete,
}: {
  comment: ReviewComment;
  showStatus: boolean;
  onResolve?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
}) {
  const lineLabel = comment.anchor.lineEnd
    ? `L${comment.anchor.lineStart}\u2013${comment.anchor.lineEnd}`
    : `L${comment.anchor.lineStart}`;

  return (
    <div className="border-acc/50 border-l-2">
      <div className="bg-bg-1/80 px-3 py-2">
        {/* Header row */}
        <div className="mb-1.5 flex items-center gap-2">
          <div className="bg-acc-soft text-acc-ink flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] font-semibold">
            Y
          </div>
          <span className="text-ink-1 text-xs font-medium">You</span>
          <span className="text-ink-4 text-[11px]">{lineLabel}</span>

          {showStatus && <StatusPill status={comment.status} />}

          <div className="flex-1" />

          {/* Preset tags */}
          {comment.presets.map((p) => (
            <span
              key={p}
              className="bg-acc-soft text-acc-ink rounded-full px-1.5 py-px font-mono text-[9.5px]"
            >
              {p}
            </span>
          ))}

          {/* Resolve / delete buttons */}
          {showStatus && onResolve && (
            <button
              onClick={() => onResolve(comment.id)}
              className={clsx(
                'rounded border px-2 py-px text-[10px]',
                comment.resolved
                  ? 'border-line bg-status-done-soft text-status-done'
                  : 'border-line bg-bg-2 text-ink-2 hover:bg-bg-3',
              )}
            >
              {comment.resolved ? '\u2713 resolved' : 'resolve'}
            </button>
          )}
          {!showStatus && onDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-ink-4 hover:text-status-fail rounded p-0.5"
              title="Remove comment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Comment body */}
        <div className="text-ink-1 pl-[26px] text-xs leading-relaxed">
          {comment.body}
        </div>

        {/* Agent response note */}
        {comment.agentNote && (
          <div className="border-ink-4 bg-bg-1 mt-2 ml-[26px] flex items-start gap-2 rounded-r border-l-2 px-2.5 py-2">
            <div className="bg-bg-3 text-ink-3 flex h-4 w-4 shrink-0 items-center justify-center rounded">
              <Sparkles className="h-2.5 w-2.5" />
            </div>
            <span className="text-ink-2 text-[11.5px]">
              {comment.agentNote}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
