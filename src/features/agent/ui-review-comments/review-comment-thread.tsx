import clsx from 'clsx';
import { Sparkles } from 'lucide-react';



import {
  COMMENT_ACCENT,
  InlineCommentBubble,
} from '@/features/common/ui-inline-comments';
import type { PromptImagePart } from '@shared/agent-backend-types';
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
  onEdit,
}: {
  comment: ReviewComment;
  showStatus: boolean;
  onResolve?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onEdit?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
}) {
  return (
    <div
      style={{
        background: COMMENT_ACCENT.bg,
        borderTop: `1px solid ${COMMENT_ACCENT.border}`,
        borderBottom: `1px solid ${COMMENT_ACCENT.border}`,
      }}
    >
      <InlineCommentBubble
        lineStart={comment.anchor.lineStart}
        lineEnd={comment.anchor.lineEnd}
        body={comment.body}
        images={comment.images}
        onRemove={onDelete ? () => onDelete(comment.id) : undefined}
        onEdit={
          onEdit
            ? (newBody, newImages) => onEdit(comment.id, newBody, newImages)
            : undefined
        }
        renderHeaderExtras={
          <>
            {showStatus && <StatusPill status={comment.status} />}
            {comment.presets.map((p) => (
              <span
                key={p}
                className="rounded-full px-1.5 py-px font-mono text-[9.5px]"
                style={{
                  background: COMMENT_ACCENT.chipBg,
                  color: COMMENT_ACCENT.chipText,
                }}
              >
                {p}
              </span>
            ))}
          </>
        }
        renderExtraActions={
          showStatus && onResolve ? (
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
          ) : undefined
        }
        renderFooter={
          comment.agentNote ? (
            <div className="border-ink-4 bg-bg-1 mt-2 flex items-start gap-2 rounded-r border-l-2 px-2.5 py-2">
              <div className="bg-bg-3 text-ink-3 flex h-4 w-4 shrink-0 items-center justify-center rounded">
                <Sparkles className="h-2.5 w-2.5" />
              </div>
              <span className="text-ink-2 text-[11.5px]">
                {comment.agentNote}
              </span>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
