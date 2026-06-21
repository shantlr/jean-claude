import { ChevronDown, ChevronRight, Eye, X } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { ReviewComment } from '@/stores/review-comments';

// Kind accent tokens from design (composer review v2)
const DIFF_ACCENT_INK = 'oklch(0.82 0.17 295)';
const DIFF_ACCENT_SOFT = 'oklch(0.72 0.20 295 / 0.16)';
const MSG_ACCENT_INK = 'oklch(0.78 0.16 205)';
const MSG_ACCENT_SOFT = 'oklch(0.78 0.16 205 / 0.14)';

export type PillKind = 'diff' | 'message';

export interface ReviewPillData {
  id: string;
  kind: PillKind;
  /** e.g. "file.tsx:L7-14" or "Plan · §2" */
  anchorLabel: string;
  body: string;
  /** Navigation source — used by pill click to redirect to the comment origin */
  source?:
    | { kind: 'diff'; filePath: string; lineStart: number }
    | { kind: 'message'; entryId: string };
}

function getKindAccent(kind: PillKind) {
  return kind === 'message'
    ? { ink: MSG_ACCENT_INK, soft: MSG_ACCENT_SOFT }
    : { ink: DIFF_ACCENT_INK, soft: DIFF_ACCENT_SOFT };
}

export function reviewCommentToPill(comment: ReviewComment): ReviewPillData {
  // Message comments use a synthetic filePath like "__message__:entryId"
  if (comment.anchor.filePath.startsWith('__message__:')) {
    const lineLabel =
      comment.anchor.lineStart > 0
        ? comment.anchor.lineEnd
          ? `:L${comment.anchor.lineStart}-${comment.anchor.lineEnd}`
          : `:L${comment.anchor.lineStart}`
        : '';
    return {
      id: comment.id,
      kind: 'message',
      anchorLabel: `msg${lineLabel}`,
      body: comment.body || comment.presets.join(', '),
      source: {
        kind: 'message',
        entryId: comment.anchor.filePath.replace('__message__:', ''),
      },
    };
  }

  const lineLabel = comment.anchor.lineEnd
    ? `L${comment.anchor.lineStart}-${comment.anchor.lineEnd}`
    : `L${comment.anchor.lineStart}`;
  const parts = comment.anchor.filePath.split('/');
  const shortFile =
    parts.length > 2 ? parts.slice(-2).join('/') : comment.anchor.filePath;
  return {
    id: comment.id,
    kind: 'diff',
    anchorLabel: `${shortFile}:${lineLabel}`,
    body: comment.body || comment.presets.join(', '),
    source: {
      kind: 'diff',
      filePath: comment.anchor.filePath,
      lineStart: comment.anchor.lineStart,
    },
  };
}

export function AttachmentPill({
  pill,
  onRemove,
  onClick,
}: {
  pill: ReviewPillData;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const accent = getKindAccent(pill.kind);
  return (
    <div
      className="border-line bg-bg-0 inline-flex items-stretch overflow-hidden rounded-[7px] border"
      style={{
        maxWidth: 300,
        backgroundImage: `linear-gradient(90deg, ${accent.soft} 0, transparent 38%)`,
      }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px border-0 bg-transparent py-1 pr-2 pl-2.5 text-left"
        onClick={onClick}
      >
        <span
          className="max-w-[200px] truncate font-mono text-[10.5px] font-medium"
          style={{ color: accent.ink }}
        >
          {pill.anchorLabel}
        </span>
        <span className="text-ink-1 max-w-[240px] truncate text-[11.5px]">
          {pill.body}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-ink-3 hover:text-ink-1 inline-flex cursor-pointer items-center self-stretch border-0 bg-transparent px-[7px] transition-colors"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/** Collapsed max-height is computed from the first pill's actual height */

export function ReviewPillsQueue({
  pills,
  onRemove,
  onPillClick,
  onPreview,
}: {
  pills: ReviewPillData[];
  onRemove?: (id: string) => void;
  onPillClick?: (id: string) => void;
  onPreview?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure first pill to derive single-row height, detect overflow
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const firstChild = el.firstElementChild as HTMLElement | null;
    const rowH = firstChild ? firstChild.offsetHeight : 0;
    setCollapsedHeight(rowH);
    setOverflows(el.scrollHeight > rowH + 2);
  }, [pills]);

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pt-2.5">
      <div
        ref={containerRef}
        className="flex flex-wrap gap-1.5 overflow-hidden transition-[max-height] duration-200"
        style={{
          maxHeight: expanded || collapsedHeight === 0 ? 9999 : collapsedHeight,
        }}
      >
        {pills.map((pill) => (
          <AttachmentPill
            key={pill.id}
            pill={pill}
            onRemove={onRemove ? () => onRemove(pill.id) : undefined}
            onClick={onPillClick ? () => onPillClick(pill.id) : undefined}
          />
        ))}
      </div>
      {(overflows || onPreview) && (
        <div className="flex items-center gap-2">
          {overflows && (
            <button
              type="button"
              onClick={toggle}
              className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-1 text-[10.5px] transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronDown className="h-3 w-3" /> collapse
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" /> +{pills.length} comments
                </>
              )}
            </button>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-1 text-[10.5px] transition-colors"
            >
              <Eye className="h-3 w-3" /> preview
            </button>
          )}
        </div>
      )}
    </div>
  );
}
