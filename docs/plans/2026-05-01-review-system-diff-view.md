# Review System for Diff View — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a PR-style inline review system to the worktree diff view so users can comment on specific lines, submit all comments as a structured prompt, and track agent responses per comment.

**Architecture:** A new Zustand store (`review-comments.ts`) manages review comments per task. A new feature folder (`src/features/agent/ui-review-comments/`) provides the composer, thread, preset chips, submit overlay, and status banners. These plug into the existing `FileDiffContent` → `DiffView` inline comment infrastructure (which already supports `onAddCommentClick`, `inlineComments`, `commentFormLineRange`, `commentForm`). On submit, comments are synthesized into a structured prompt and a new task step is created via the existing `createStep` mutation.

**Tech Stack:** React 19, Zustand, TanStack Query, Tailwind CSS (Aurora Glass design system with OKLCH tokens), Lucide icons, existing DiffView inline comment API.

---

## Architecture Overview

```
┌─ review-comments store (Zustand) ────────────────────────────┐
│  comments: Map<taskId, ReviewComment[]>                      │
│  presets, draft composer state, submit state                 │
│  addComment, removeComment, updateComment, resolveComment    │
│  clearComments, synthesizePrompt                             │
└──────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─ WorktreeDiffView ───┐    ┌─ ReviewSubmitOverlay ──────┐
│  Passes review props  │    │  Global intent input       │
│  to FileDiffContent   │    │  Comment cards list        │
│  + ReviewTopBar       │    │  Synthesized prompt preview│
│  + ReviewBanners      │    │  Submit → createStep()     │
└───────────────────────┘    └────────────────────────────┘
         │
         ▼
┌─ FileDiffContent ─────────────────────┐
│  ReviewCommentComposer (commentForm)  │
│  ReviewCommentThread (inlineComments) │
│  Already has: onAddCommentClick,      │
│  commentFormLineRange, etc.           │
└───────────────────────────────────────┘
```

---

## Task 1: Review Comments Store

**Files:**
- Create: `src/stores/review-comments.ts`

This store manages all review comment state per task. It is not persisted — comments are ephemeral to the session (they become step prompts on submit).

**Step 1: Create the store**

```typescript
// src/stores/review-comments.ts
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';

// ── Types ──

export type ReviewPresetId = 'refactor' | 'simplify' | 'rename' | 'tests' | 'explain' | 'remove';

export const REVIEW_PRESETS: { id: ReviewPresetId; label: string }[] = [
  { id: 'refactor', label: 'refactor' },
  { id: 'simplify', label: 'simplify' },
  { id: 'rename', label: 'rename' },
  { id: 'tests', label: 'add tests' },
  { id: 'explain', label: 'explain' },
  { id: 'remove', label: 'remove' },
];

export type ReviewCommentStatus =
  | 'open'
  | 'queued'
  | 'working'
  | 'addressed'
  | 'partial'
  | 'skipped'
  | 'resolved';

export interface ReviewCommentAnchor {
  filePath: string;
  lineStart: number;
  lineEnd?: number; // undefined = single line
}

export interface ReviewComment {
  id: string;
  anchor: ReviewCommentAnchor;
  body: string;
  presets: ReviewPresetId[];
  status: ReviewCommentStatus;
  agentNote?: string;
  resolved: boolean;
  createdAt: number;
}

// ── Store ──

interface ReviewCommentsState {
  // comments keyed by taskId
  commentsByTask: Record<string, ReviewComment[]>;

  // Actions
  addComment: (taskId: string, comment: Omit<ReviewComment, 'id' | 'createdAt'>) => string;
  removeComment: (taskId: string, commentId: string) => void;
  updateComment: (taskId: string, commentId: string, updates: Partial<ReviewComment>) => void;
  resolveComment: (taskId: string, commentId: string) => void;
  clearComments: (taskId: string) => void;
  clearResolvedComments: (taskId: string) => void;
  resolveAllAddressed: (taskId: string) => void;
  setCommentStatuses: (taskId: string, updates: { commentId: string; status: ReviewCommentStatus; agentNote?: string }[]) => void;
}

export const useReviewCommentsStore = create<ReviewCommentsState>((set) => ({
  commentsByTask: {},

  addComment: (taskId, comment) => {
    const id = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: [
          ...(state.commentsByTask[taskId] ?? []),
          { ...comment, id, createdAt: Date.now() },
        ],
      },
    }));
    return id;
  },

  removeComment: (taskId, commentId) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] ?? []).filter((c) => c.id !== commentId),
      },
    }));
  },

  updateComment: (taskId, commentId, updates) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] ?? []).map((c) =>
          c.id === commentId ? { ...c, ...updates } : c,
        ),
      },
    }));
  },

  resolveComment: (taskId, commentId) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] ?? []).map((c) =>
          c.id === commentId ? { ...c, resolved: true } : c,
        ),
      },
    }));
  },

  clearComments: (taskId) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: [],
      },
    }));
  },

  clearResolvedComments: (taskId) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] ?? []).filter((c) => !c.resolved),
      },
    }));
  },

  resolveAllAddressed: (taskId) => {
    set((state) => ({
      commentsByTask: {
        ...state.commentsByTask,
        [taskId]: (state.commentsByTask[taskId] ?? []).map((c) =>
          c.status === 'addressed' ? { ...c, resolved: true } : c,
        ),
      },
    }));
  },

  setCommentStatuses: (taskId, updates) => {
    set((state) => {
      const map = new Map(updates.map((u) => [u.commentId, u]));
      return {
        commentsByTask: {
          ...state.commentsByTask,
          [taskId]: (state.commentsByTask[taskId] ?? []).map((c) => {
            const update = map.get(c.id);
            return update
              ? { ...c, status: update.status, agentNote: update.agentNote ?? c.agentNote }
              : c;
          }),
        },
      };
    });
  },
}));

// ── Selector hooks ──

const EMPTY_ARRAY: ReviewComment[] = [];

export function useReviewComments(taskId: string) {
  const comments = useReviewCommentsStore(
    (state) => state.commentsByTask[taskId] ?? EMPTY_ARRAY,
  );
  return comments;
}

export function useReviewCommentsForFile(taskId: string, filePath: string) {
  const allComments = useReviewComments(taskId);
  return useMemo(
    () => allComments.filter((c) => c.anchor.filePath === filePath),
    [allComments, filePath],
  );
}

export function useOpenReviewCommentCount(taskId: string) {
  const comments = useReviewComments(taskId);
  return useMemo(
    () => comments.filter((c) => !c.resolved).length,
    [comments],
  );
}

export function useReviewCommentsByFile(taskId: string) {
  const comments = useReviewComments(taskId);
  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of comments) {
      if (!c.resolved) {
        map[c.anchor.filePath] = (map[c.anchor.filePath] ?? 0) + 1;
      }
    }
    return map;
  }, [comments]);
}

/** Synthesize a structured prompt from all open comments. */
export function synthesizeReviewPrompt(
  comments: ReviewComment[],
  globalIntent?: string,
): string {
  const openComments = comments.filter((c) => !c.resolved);
  const parts: string[] = [];

  if (globalIntent?.trim()) {
    parts.push(globalIntent.trim());
    parts.push('');
  }

  parts.push('Address the following inline comments from the diff review:');
  parts.push('');

  openComments.forEach((c, i) => {
    const lineLabel = c.anchor.lineEnd
      ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
      : `L${c.anchor.lineStart}`;
    const anchor = `${c.anchor.filePath}:${lineLabel}`;
    const tags = c.presets.length > 0 ? ` [${c.presets.join(', ')}]` : '';
    parts.push(`${i + 1}. ${anchor}${tags}`);
    parts.push(`   → ${c.body}`);
    parts.push('');
  });

  parts.push("Keep changes scoped to the comments. Don't refactor unrelated code.");

  return parts.join('\n');
}
```

**Step 2: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 3: Commit**

```bash
git add src/stores/review-comments.ts
git commit -m "feat: add review comments Zustand store

Manages inline review comments per task with presets, statuses, resolve
flow, and prompt synthesis."
```

---

## Task 2: Review Comment Composer Component

**Files:**
- Create: `src/features/agent/ui-review-comments/index.tsx` (barrel exports)
- Create: `src/features/agent/ui-review-comments/review-comment-composer.tsx`

The composer is the inline form shown when the user clicks "+" on a diff line. It replaces the generic `CommentForm` prop with a review-specific UI featuring preset chips and Cmd+Enter to save.

**Step 1: Create the composer component**

```typescript
// src/features/agent/ui-review-comments/review-comment-composer.tsx
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useCallback, useRef, useState, useEffect } from 'react';

import { Kbd } from '@/common/ui/kbd';
import {
  REVIEW_PRESETS,
  type ReviewPresetId,
} from '@/stores/review-comments';

export function ReviewCommentComposer({
  lineStart,
  lineEnd,
  onSubmit,
  onCancel,
}: {
  lineStart: number;
  lineEnd?: number;
  onSubmit: (body: string, presets: ReviewPresetId[]) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<ReviewPresetId[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const togglePreset = useCallback((id: ReviewPresetId) => {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed && selectedPresets.length === 0) return;
    onSubmit(trimmed, selectedPresets);
  }, [body, selectedPresets, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  const isMultiLine = lineEnd !== undefined && lineEnd !== lineStart;
  const lineLabel = isMultiLine
    ? `lines ${lineStart}–${lineEnd}`
    : `line ${lineStart}`;

  return (
    <div className="border-acc/50 border-l-2">
      <div className="bg-bg-1/90 px-3 py-2.5">
        {isMultiLine && (
          <div className="text-ink-3 mb-2 font-mono text-[10.5px]">
            commenting on {lineLabel}
          </div>
        )}

        {/* Preset chips */}
        <div className="mb-2 flex flex-wrap gap-1">
          {REVIEW_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePreset(p.id)}
              className={clsx(
                'rounded-full border px-2 py-0.5 font-mono text-[10.5px] transition-colors',
                selectedPresets.includes(p.id)
                  ? 'border-acc-line bg-acc-soft text-acc-ink'
                  : 'border-line bg-bg-1 text-ink-2 hover:bg-bg-2',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leave an instruction for this line…"
          rows={2}
          className="border-line bg-bg-0 text-ink-1 placeholder:text-ink-4 focus:border-acc-line w-full resize-y rounded border px-2.5 py-2 text-xs outline-none"
        />

        {/* Actions */}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={!body.trim() && selectedPresets.length === 0}
            className="bg-acc inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11.5px] font-medium text-white disabled:opacity-40"
          >
            Add comment <Kbd className="text-[9px] opacity-70">⌘↵</Kbd>
          </button>
          <button
            onClick={onCancel}
            className="border-line text-ink-2 hover:bg-bg-2 rounded border px-2.5 py-1 text-[11.5px]"
          >
            Cancel
          </button>
          <span className="text-ink-4 ml-auto text-[10.5px]">
            Won't be sent until you submit the review.
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run lint + ts-check**

**Step 3: Commit**

---

## Task 3: Review Comment Thread Component

**Files:**
- Create: `src/features/agent/ui-review-comments/review-comment-thread.tsx`

Renders existing comments inline between diff lines. Shows presets, status pills, agent responses, and resolve button.

**Step 1: Create the thread component**

```typescript
// src/features/agent/ui-review-comments/review-comment-thread.tsx
import clsx from 'clsx';
import { Sparkles, Trash2 } from 'lucide-react';

import type { ReviewComment } from '@/stores/review-comments';

function StatusPill({ status }: { status: ReviewComment['status'] }) {
  const config = {
    open: { color: 'text-ink-3', bg: 'bg-bg-3', label: 'open' },
    queued: { color: 'text-ink-3', bg: 'bg-bg-3', label: 'queued' },
    working: { color: 'text-status-run', bg: 'bg-status-run-soft', label: 'working', pulse: true },
    addressed: { color: 'text-status-done', bg: 'bg-status-done-soft', label: '✓ addressed' },
    partial: { color: 'text-status-run', bg: 'bg-status-run-soft', label: '◐ partial' },
    skipped: { color: 'text-ink-3', bg: 'bg-bg-3', label: '⊘ skipped' },
    resolved: { color: 'text-ink-3', bg: 'bg-bg-2', label: 'resolved' },
  }[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium lowercase tracking-wide',
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
    ? `L${comment.anchor.lineStart}–${comment.anchor.lineEnd}`
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
              {comment.resolved ? '✓ resolved' : 'resolve'}
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
            <span className="text-ink-2 text-[11.5px]">{comment.agentNote}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run lint + ts-check**

**Step 3: Commit**

---

## Task 4: Submit Review Overlay

**Files:**
- Create: `src/features/agent/ui-review-comments/review-submit-overlay.tsx`

Modal overlay shown when user clicks "Submit review". Shows global intent input, comment cards, collapsible synthesized prompt preview, and submit button.

**Step 1: Create the overlay component**

```typescript
// src/features/agent/ui-review-comments/review-submit-overlay.tsx
import { ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import type { ReviewComment } from '@/stores/review-comments';
import { synthesizeReviewPrompt } from '@/stores/review-comments';

export function ReviewSubmitOverlay({
  comments,
  onSubmit,
  onClose,
}: {
  comments: ReviewComment[];
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}) {
  const [globalIntent, setGlobalIntent] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const openComments = useMemo(
    () => comments.filter((c) => !c.resolved),
    [comments],
  );

  const synthesized = useMemo(
    () => synthesizeReviewPrompt(openComments, globalIntent),
    [openComments, globalIntent],
  );

  const handleSubmit = useCallback(() => {
    onSubmit(synthesized);
  }, [synthesized, onSubmit]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'oklch(0.06 0.012 275 / 0.78)' }}
    >
      <div className="bg-bg-1 border-line flex max-h-[92%] w-[720px] flex-col overflow-hidden rounded-lg border shadow-2xl">
        {/* Header */}
        <div className="border-line-soft flex items-center gap-2.5 border-b px-4 py-3.5">
          <Send className="text-acc-ink h-3.5 w-3.5" />
          <div className="flex-1">
            <div className="text-ink-0 text-[13px] font-medium">Submit review</div>
            <div className="text-ink-3 text-[11.5px]">
              {openComments.length} comment{openComments.length !== 1 ? 's' : ''} → next iteration
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Global intent */}
        <div className="border-line-soft border-b px-4 py-3.5">
          <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium uppercase tracking-wider">
            Overall intent <span className="normal-case tracking-normal">(optional)</span>
          </div>
          <textarea
            value={globalIntent}
            onChange={(e) => setGlobalIntent(e.target.value)}
            placeholder="e.g. 'don't change behaviour, just clean up imports & ordering'"
            rows={2}
            className="border-line bg-bg-0 text-ink-1 placeholder:text-ink-4 focus:border-acc-line w-full resize-none rounded border px-2.5 py-2 text-xs outline-none"
          />
        </div>

        {/* Comment cards */}
        <div className="flex-1 overflow-y-auto px-4 py-2.5">
          <div className="text-ink-4 mb-2 text-[10.5px] font-medium uppercase tracking-wider">
            Inline comments ({openComments.length})
          </div>
          <div className="flex flex-col gap-2">
            {openComments.map((c, i) => {
              const lineLabel = c.anchor.lineEnd
                ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
                : `L${c.anchor.lineStart}`;
              const anchor = `${c.anchor.filePath}:${lineLabel}`;
              return (
                <div
                  key={c.id}
                  className="border-line-soft bg-bg-0 grid grid-cols-[24px_1fr] gap-2.5 rounded border px-2.5 py-2"
                >
                  <div className="bg-acc-soft text-acc-ink flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[10px] font-semibold">
                    {i + 1}
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className="text-acc-ink font-mono text-[10.5px]">{anchor}</span>
                      {c.presets.map((p) => (
                        <span
                          key={p}
                          className="bg-bg-2 text-ink-2 rounded-full px-1.5 font-mono text-[9.5px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="text-ink-1 text-xs leading-relaxed">{c.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synthesized prompt preview (collapsible) */}
        <div className="border-line-soft bg-bg-0 border-t">
          <button
            onClick={() => setShowPromptPreview((s) => !s)}
            className="text-ink-2 flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11.5px]"
          >
            {showPromptPreview ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-medium">Preview the prompt sent to the agent</span>
            <span className="text-ink-4 ml-auto text-[10.5px]">
              {showPromptPreview ? 'read-only' : `${synthesized.length} chars`}
            </span>
          </button>
          {showPromptPreview && (
            <div className="px-4 pb-3.5">
              <div className="border-line bg-bg-1 max-h-[200px] overflow-y-auto rounded border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {synthesized}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-line-soft bg-bg-1 flex items-center gap-2 border-t px-4 py-3">
          <span className="text-ink-3 text-[11px]">
            A new step will be created from this review.
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="border-line text-ink-2 hover:bg-bg-2 rounded border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="bg-acc inline-flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-medium text-white"
          >
            Submit review <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run lint + ts-check**

**Step 3: Commit**

---

## Task 5: Review Top Bar + Banner Components

**Files:**
- Create: `src/features/agent/ui-review-comments/review-top-bar.tsx`

A bar at the top of the diff view when review mode is active. Shows comment count badge on submit button. Also includes the "agent working" and "resolved" banners.

**Step 1: Create the top bar and banners**

```typescript
// src/features/agent/ui-review-comments/review-top-bar.tsx
import { Check, MessageSquare } from 'lucide-react';

export function ReviewSubmitBar({
  commentCount,
  onSubmit,
}: {
  commentCount: number;
  onSubmit: () => void;
}) {
  if (commentCount === 0) return null;

  return (
    <div className="border-line bg-bg-0 flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <MessageSquare className="text-acc-ink h-3.5 w-3.5" />
      <span className="text-ink-2 text-xs">
        {commentCount} review comment{commentCount !== 1 ? 's' : ''} pending
      </span>
      <div className="flex-1" />
      <button
        onClick={onSubmit}
        className="bg-acc inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11.5px] font-medium text-white"
      >
        Submit review
        <span className="rounded-full bg-white/20 px-1.5 font-mono text-[10px]">
          {commentCount}
        </span>
      </button>
    </div>
  );
}

export function AgentWorkingBanner({
  total,
  done,
}: {
  total: number;
  done: number;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="bg-status-run-soft border-line flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
      <span className="bg-status-run h-2 w-2 animate-pulse rounded-full" />
      <span className="text-ink-1 text-xs font-medium">Agent working on review</span>
      <span className="text-ink-3 text-[11.5px]">
        Addressing {total} comments — {done}/{total} done
      </span>
      <div className="flex-1" />
      <div className="bg-bg-3 h-1 w-40 overflow-hidden rounded-full">
        <div
          className="bg-status-run h-full transition-all duration-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ResolvedBanner({
  total,
  addressedCount,
  onResolveAllAddressed,
  onSubmitFollowUp,
}: {
  total: number;
  addressedCount: number;
  onResolveAllAddressed: () => void;
  onSubmitFollowUp: () => void;
}) {
  return (
    <div className="bg-bg-1 border-line flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
      <Check className="text-status-done h-3 w-3" strokeWidth={2.5} />
      <span className="text-ink-1 text-xs font-medium">Step complete</span>
      <span className="text-ink-3 text-[11.5px]">
        {addressedCount} of {total} comments addressed — review the changes and resolve each thread.
      </span>
      <div className="flex-1" />
      <button
        onClick={onResolveAllAddressed}
        className="border-line bg-bg-2 text-ink-1 rounded border px-2.5 py-0.5 text-[11.5px]"
      >
        Resolve all addressed
      </button>
      <button
        onClick={onSubmitFollowUp}
        className="border-acc-line bg-acc-soft text-acc-ink rounded border px-2.5 py-0.5 text-[11.5px]"
      >
        Submit follow-up review
      </button>
    </div>
  );
}
```

**Step 2: Run lint + ts-check**

**Step 3: Commit**

---

## Task 6: Barrel Export

**Files:**
- Create: `src/features/agent/ui-review-comments/index.tsx`

**Step 1: Create barrel export**

```typescript
// src/features/agent/ui-review-comments/index.tsx
export { ReviewCommentComposer } from './review-comment-composer';
export { ReviewCommentThread } from './review-comment-thread';
export { ReviewSubmitOverlay } from './review-submit-overlay';
export {
  ReviewSubmitBar,
  AgentWorkingBanner,
  ResolvedBanner,
} from './review-top-bar';
```

**Step 2: Commit**

---

## Task 7: Wire Review System into WorktreeDiffView

**Files:**
- Modify: `src/features/agent/ui-worktree-diff-view/index.tsx`
- Modify: `src/features/common/ui-file-diff/file-diff-content.tsx`

This is the integration task. We:
1. Add review comment state to `WorktreeDiffView`
2. Pass review props through `FileDiffContent` to `DiffView`
3. Add the `ReviewSubmitBar`, `ReviewSubmitOverlay`, and banners
4. Wire comment creation through the existing `onAddComment` / `CommentForm` pattern

**Step 1: Modify WorktreeDiffView to add review support**

Key changes to `WorktreeDiffView`:

1. Import review components and store hooks
2. Add `ReviewSubmitBar` between `SummaryPanel` and file diff content
3. Add `ReviewSubmitOverlay` state + rendering
4. Pass `onAddComment`, `CommentForm`, and `threads` through to `WorktreeFileDiffContent` → `FileDiffContent`
5. Wire submit to create a new step via `createStep`

The component receives a new optional `onCreateStep` callback (or we pass `taskId` and use the hook inline).

Changes in `WorktreeFileDiffContent`:
- Accept new props: `reviewComments`, `onAddReviewComment`, `onDeleteReviewComment`, `showReviewStatus`, `onResolveComment`
- Convert `ReviewComment[]` to `InlineComment[]` using `ReviewCommentThread`
- Pass `ReviewCommentComposer` as the `CommentForm`
- Pass all review props through to `FileDiffContent`

Changes in `FileDiffContent`:
- No changes needed! It already has `onAddComment`, `CommentForm`, `threads` props. We just need to use them.

Actually, looking more carefully at the existing code, the `CommentForm` interface in `FileDiffContent` is:
```typescript
CommentForm?: ComponentType<{
  onSubmit: (content: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
}>;
```

This is too simple for our review composer (which needs `lineStart`, `lineEnd`, presets). Instead, we should use the **`commentForm` ReactNode** path that DiffView already supports — `FileDiffContent` already builds a `commentFormElement` ReactNode from the `CommentForm` component. But the better approach is to bypass `FileDiffContent`'s built-in comment handling and wire directly into `DiffView`'s `commentForm` + `commentFormLineRange` + `inlineComments`.

The cleanest approach: add review-specific props to `FileDiffContent`:

```typescript
// New optional props on FileDiffContent:
reviewComments?: ReviewComment[];
onAddReviewComment?: (params: { filePath: string; lineStart: number; lineEnd?: number; body: string; presets: ReviewPresetId[] }) => void;
onDeleteReviewComment?: (commentId: string) => void;
showReviewStatus?: boolean;
onResolveReviewComment?: (commentId: string) => void;
```

When these are provided, `FileDiffContent` builds review-flavored `inlineComments` and `commentForm` instead of the generic ones.

**Step 2: Implement the integration**

In `file-diff-content.tsx`, add:
- Import `ReviewCommentComposer`, `ReviewCommentThread`, store types
- When `reviewComments` prop is present, convert them to `InlineComment[]` using `ReviewCommentThread`
- When `onAddReviewComment` is present, render `ReviewCommentComposer` as the comment form
- Handle the `onAddCommentClick` → open composer flow

In `ui-worktree-diff-view/index.tsx`, add:
- Import store hooks and review components
- `useReviewComments(taskId)` + store actions
- `useOpenReviewCommentCount(taskId)` for submit bar badge
- `ReviewSubmitBar` before diff content
- `ReviewSubmitOverlay` rendered conditionally
- Pass review props to `WorktreeFileDiffContent`
- Submit handler that calls `synthesizeReviewPrompt` and triggers step creation via a callback prop

**Step 3: Update WorktreeDiffView props**

Add to `WorktreeDiffView`:
```typescript
onSubmitReview?: (prompt: string) => void;
```

The task panel will pass a callback that creates a new step.

**Step 4: Wire in task panel**

In `ui-task-panel/index.tsx`, pass `onSubmitReview` to `WorktreeDiffView`:
```typescript
onSubmitReview={(prompt) => {
  void handleAddStep({
    promptTemplate: prompt,
    presetType: 'continue',
    interactionMode: effectiveMode,
    agentBackend: effectiveBackend,
    modelPreference: effectiveModel,
    images: [],
    start: true,
  });
}}
```

**Step 5: Run lint + ts-check**

**Step 6: Commit**

```bash
git commit -m "feat: wire review system into diff view

Integrates review comments store, composer, threads, submit overlay,
and banners into WorktreeDiffView and FileDiffContent. Comments are
synthesized into a structured prompt and submitted as a new task step."
```

---

## Task 8: Comment Count Badges in File Tree

**Files:**
- Modify: `src/features/common/ui-file-diff/file-tree.tsx` (the `DiffFileTree` component)
- Modify: `src/features/agent/ui-worktree-diff-view/index.tsx`

**Step 1: Add comment count support to DiffFileTree**

The `DiffFileTree` already accepts `filesWithAnnotations` for the annotation indicator. Add a `commentCountByFile` prop:

```typescript
commentCountByFile?: Record<string, number>;
```

Render a small accent-tinted badge next to the file name when count > 0, similar to the design's `commentCount` chip.

**Step 2: Pass counts from WorktreeDiffView**

Use `useReviewCommentsByFile(taskId)` to get counts, pass to `DiffFileTree`.

**Step 3: Run lint + ts-check**

**Step 4: Commit**

---

## Summary of Files

| Action | Path |
|--------|------|
| Create | `src/stores/review-comments.ts` |
| Create | `src/features/agent/ui-review-comments/index.tsx` |
| Create | `src/features/agent/ui-review-comments/review-comment-composer.tsx` |
| Create | `src/features/agent/ui-review-comments/review-comment-thread.tsx` |
| Create | `src/features/agent/ui-review-comments/review-submit-overlay.tsx` |
| Create | `src/features/agent/ui-review-comments/review-top-bar.tsx` |
| Modify | `src/features/common/ui-file-diff/file-diff-content.tsx` |
| Modify | `src/features/agent/ui-worktree-diff-view/index.tsx` |
| Modify | `src/features/common/ui-file-diff/file-tree.tsx` |
| Modify | `src/features/task/ui-task-panel/index.tsx` |

---

## What's Intentionally Deferred

1. **Database persistence for review comments** — Comments live in Zustand store (session-only). If the user closes the app mid-review, they're lost. This is acceptable for v1; persist later if needed.
2. **Agent response tracking** — The `setCommentStatuses` action + status pills + banners are built, but the actual agent response → status update mapping requires integration with the agent message stream. For v1, after submitting a review, all comments move to `queued` status. Real-time tracking is a follow-up.
3. **Multi-file comment navigation** — Clicking a comment in the submit overlay could scroll to the file and line. Deferred.
4. **Drag-to-select line range** — The existing `DiffView` already supports click-and-drag line selection via `handleLineMouseDown/MouseUp`. This works out of the box.
