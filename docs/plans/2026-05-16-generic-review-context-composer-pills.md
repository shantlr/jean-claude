# Generic Review Context + Composer Review Pills

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the comment/review system generic (not diff-only) and show pending review comments as inline attachment pills inside the prompt composer instead of a separate "Submit review" overlay.

**Architecture:** Introduce a `ReviewContext` (React context) that any surface (diff view, message stream, future: new-task overlay) can consume to add comments. Pending comments appear as attachment pills inside the `TaskInputFooter` composer. On send, they're synthesized into structured prompt parts alongside the user's typed text. The existing diff-view inline comment UX stays unchanged — only the "submit review" bar/overlay is removed and replaced by pills in the composer.

**Tech Stack:** React context, Zustand (existing `review-comments` store), TypeScript strict mode.

**Design reference:** `composer review v2.html` from Claude Design bundle — Direction B (inline attachment pills). Key specs:
- Pills sit above the input row, inside the bordered composer surface
- Each pill: rounded rect (border-radius 7px), `bg-bg-0` + `border-line`, with a left-to-right gradient wash from kind-accent colour (violet=diff `oklch(0.72 0.20 295)`, azure=message `oklch(0.78 0.16 205)`) fading at ~38%
- Anchor label: mono font, coloured by kind (violet or azure), shows `file:Lxx` for diff or `Plan · §2` for message
- Body text: `ink-1`, 11.5px, truncated to one line
- × button on right to remove pill from queue (does NOT resolve the comment in the diff)
- Pills wrap to multiple rows via `flex-wrap: wrap`, gap 6px
- No icons on pills — colour-only distinction between kinds

---

## Task 1: Create the ReviewContext

**Files:**
- Create: `src/common/context/review-context/index.tsx`

**Step 1: Create the context file**

```tsx
// src/common/context/review-context/index.tsx
import { createContext, useContext } from 'react';

import type { FileCommentAnchor } from '@/stores/utils-comment-store';
import type { PromptImagePart } from '@shared/agent-backend-types';

export type ReviewCommentKind = 'diff' | 'message';

export interface ReviewCommentParams {
  kind: ReviewCommentKind;
  anchor: FileCommentAnchor;
  body: string;
  presets: string[];
  images?: PromptImagePart[];
}

export interface ReviewContextValue {
  /** Add a comment to the pending review queue */
  addComment: (params: ReviewCommentParams) => string;
  /** Remove a comment from the pending review queue */
  removeComment: (commentId: string) => void;
  /** Whether the review context is available (i.e. we're inside a provider) */
  enabled: boolean;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export const ReviewProvider = ReviewContext.Provider;

export function useReviewContext(): ReviewContextValue | null {
  return useContext(ReviewContext);
}
```

**Step 2: Run lint + ts-check**

Run: `pnpm ts-check`
Expected: PASS

---

## Task 2: Wire ReviewContext in TaskPanel

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx`

**Step 1: Import ReviewProvider and create the context value**

In `TaskPanel` component (the main one, not `TaskInputFooter`), import `ReviewProvider` and `ReviewCommentParams`, then create a stable context value that delegates to the existing `useReviewCommentsStore`:

```tsx
import { ReviewProvider, type ReviewCommentParams } from '@/common/context/review-context';
```

Inside the component body, create a memoized context value:

```tsx
const addReviewComment = useReviewCommentsStore((s) => s.addComment);
const removeReviewComment = useReviewCommentsStore((s) => s.removeComment);

const reviewContextValue = useMemo(() => ({
  addComment: (params: ReviewCommentParams) => {
    return addReviewComment(taskId, {
      anchor: params.anchor,
      body: params.body,
      images: params.images,
      presets: params.presets as ReviewPresetId[],
      status: 'open',
      resolved: false,
    });
  },
  removeComment: (commentId: string) => {
    removeReviewComment(taskId, commentId);
  },
  enabled: true,
}), [taskId, addReviewComment, removeReviewComment]);
```

**Step 2: Wrap the content area with ReviewProvider**

Wrap the main content area (from step flow bar through the message input footer) in `<ReviewProvider value={reviewContextValue}>`.

**Step 3: Run ts-check**

Run: `pnpm ts-check`

---

## Task 3: Create the Composer Attachment Pills

**Files:**
- Create: `src/features/common/ui-review-pills/index.tsx`

**Step 1: Create the pill component**

This implements the design's `AttachmentPill` and `InlineAttachmentsQueue`. Key design details:
- Pill: `border-radius: 7px`, `bg-bg-0`, `border border-line`, `overflow: hidden`
- Background gradient: `linear-gradient(90deg, <accentSoft> 0, transparent 38%)`
- Diff accent: `oklch(0.72 0.20 295 / 0.16)` soft, `oklch(0.82 0.17 295)` ink
- Message accent: `oklch(0.78 0.16 205 / 0.14)` soft, `oklch(0.78 0.16 205)` ink
- Anchor label: mono, 10.5px, font-weight 500, coloured by kind
- Body: 11.5px, `ink-1`, truncated one line, max-width 240px
- × button: right side, 10px icon, `ink-3`, stretches full height
- Container: `flex-wrap: wrap`, gap 6px, padding `10px 12px 0 12px`

```tsx
// src/features/common/ui-review-pills/index.tsx
import { X } from 'lucide-react';
import { useMemo } from 'react';

import type { ReviewComment } from '@/stores/review-comments';

// Kind accent tokens (from design)
const DIFF_ACCENT_INK = 'oklch(0.82 0.17 295)';
const DIFF_ACCENT_SOFT = 'oklch(0.72 0.20 295 / 0.16)';
const MSG_ACCENT_INK = 'oklch(0.78 0.16 205)';
const MSG_ACCENT_SOFT = 'oklch(0.78 0.16 205 / 0.14)';

export type PillKind = 'diff' | 'message';

export interface ReviewPillData {
  id: string;
  kind: PillKind;
  anchorLabel: string;  // e.g. "file.tsx:L7-14" or "Plan · §2"
  body: string;
}

function getKindAccent(kind: PillKind) {
  return kind === 'message'
    ? { ink: MSG_ACCENT_INK, soft: MSG_ACCENT_SOFT }
    : { ink: DIFF_ACCENT_INK, soft: DIFF_ACCENT_SOFT };
}

export function reviewCommentToPill(comment: ReviewComment): ReviewPillData {
  const lineLabel = comment.anchor.lineEnd
    ? `L${comment.anchor.lineStart}-${comment.anchor.lineEnd}`
    : `L${comment.anchor.lineStart}`;
  // Shorten file path to last segment(s)
  const parts = comment.anchor.filePath.split('/');
  const shortFile = parts.length > 2
    ? parts.slice(-2).join('/')
    : comment.anchor.filePath;
  return {
    id: comment.id,
    kind: 'diff',
    anchorLabel: `${shortFile}:${lineLabel}`,
    body: comment.body || comment.presets.join(', '),
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

export function ReviewPillsQueue({
  pills,
  onRemove,
  onPillClick,
}: {
  pills: ReviewPillData[];
  onRemove?: (id: string) => void;
  onPillClick?: (id: string) => void;
}) {
  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
      {pills.map((pill) => (
        <AttachmentPill
          key={pill.id}
          pill={pill}
          onRemove={onRemove ? () => onRemove(pill.id) : undefined}
          onClick={onPillClick ? () => onPillClick(pill.id) : undefined}
        />
      ))}
    </div>
  );
}
```

**Step 2: Run ts-check**

Run: `pnpm ts-check`

---

## Task 4: Integrate pills into TaskInputFooter

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (TaskInputFooter component, around line 1717)

**Step 1: Import pills + review store hooks**

```tsx
import { ReviewPillsQueue, reviewCommentToPill } from '@/features/common/ui-review-pills';
import { useReviewComments, useReviewCommentsStore, synthesizeReviewPrompt } from '@/stores/review-comments';
```

**Step 2: Add review comments state to TaskInputFooter**

Inside `TaskInputFooter`, add:

```tsx
const reviewComments = useReviewComments(taskId);
const removeComment = useReviewCommentsStore((s) => s.removeComment);
const resolveComment = useReviewCommentsStore((s) => s.resolveComment);
const clearResolvedComments = useReviewCommentsStore((s) => s.clearResolvedComments);

const openReviewComments = useMemo(
  () => reviewComments.filter((c) => !c.resolved),
  [reviewComments],
);

const reviewPills = useMemo(
  () => openReviewComments.map(reviewCommentToPill),
  [openReviewComments],
);

const handleRemovePill = useCallback(
  (commentId: string) => {
    removeComment(taskId, commentId);
  },
  [taskId, removeComment],
);
```

**Step 3: Modify handleSendMessage to include review comments**

Update `handleSendMessage` to synthesize review comments into the prompt parts when there are pending comments:

```tsx
const handleSendMessage = useCallback(
  (parts: PromptPart[]) => {
    if (task?.userCompleted) {
      clearUserCompleted.mutate(taskId);
    }

    // Append synthesized review comments to prompt
    if (openReviewComments.length > 0) {
      const reviewParts = synthesizeReviewPrompt(openReviewComments);
      if (reviewParts) {
        parts = [...parts, ...reviewParts];
      }
      // Resolve and clear all open comments after send
      for (const comment of openReviewComments) {
        resolveComment(taskId, comment.id);
      }
      clearResolvedComments(taskId);
    }

    clearPromptDraft();
    onSend(parts);
  },
  [task?.userCompleted, taskId, clearUserCompleted, clearPromptDraft, onSend,
   openReviewComments, resolveComment, clearResolvedComments],
);
```

**Step 4: Render pills above the input row in the composer**

In the JSX, add the pills queue inside the composer div, above the `MessageInput`. The pills go inside the rounded composer container, above the controls row:

```tsx
return (
  <div
    className={clsx(
      'mx-3 mb-3 flex flex-col rounded-xl transition-shadow duration-300',
      inputFocused ? 'prompt-input-border-focused' : 'prompt-input-border',
    )}
  >
    {/* Review comment pills */}
    <ReviewPillsQueue
      pills={reviewPills}
      onRemove={handleRemovePill}
    />
    {/* Input row */}
    <div className="flex items-center gap-2 p-2 px-3">
      <ContextUsageDisplay contextUsage={contextUsage} />
      <ModeSelector ... />
      <ModelSelector ... />
      <MessageInput ... />
    </div>
  </div>
);
```

Note the layout change: the outer div switches from `flex items-center` to `flex flex-col` so pills stack above the input row.

**Step 5: Run ts-check + lint**

Run: `pnpm ts-check && pnpm lint --fix`

---

## Task 5: Remove ReviewSubmitBar and ReviewSubmitOverlay from WorktreeDiffView

**Files:**
- Modify: `src/features/agent/ui-worktree-diff-view/index.tsx`

**Step 1: Remove the submit overlay and submit bar**

Remove:
- The `isSubmitOverlayOpen` state
- The `handleSubmitReview` callback
- The `handleClearAllComments` callback
- The `onSubmitReview` prop from the component interface
- The `ReviewSubmitBar` render
- The `ReviewSubmitOverlay` render
- The keyboard shortcut for `cmd+enter` to open submit overlay
- Imports of `ReviewSubmitOverlay`, `ReviewSubmitTargetConfig`, `ReviewSubmitBar`

Keep:
- All the review comment add/edit/delete/resolve logic — comments still created in the diff
- The `useReviewComments*` hooks — comments still needed for inline display in diff
- The `commentCountByFile` for file tree badges

**Step 2: Remove `onSubmitReview` prop from TaskPanel's usage of WorktreeDiffView**

In `src/features/task/ui-task-panel/index.tsx`, remove the `onSubmitReview` callback prop from the `<WorktreeDiffView>` usage (around line 1409).

**Step 3: Run ts-check + lint**

Run: `pnpm ts-check && pnpm lint --fix`

---

## Task 6: Make send button aware of pending review comments

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (TaskInputFooter)

**Step 1: Allow sending with only review pills (no typed text)**

Currently `MessageInput` disables send when `value.trim()` is empty and no images/files attached. We need the send button to also be enabled when there are pending review pills.

In `TaskInputFooter`, pass a flag or override the disabled logic. The simplest approach: if there are pending review pills, the `disabled` prop on `MessageInput` should be false even when no text is typed. The `handleSubmit` in `MessageInput` already checks for empty — we need to allow submit when pills exist.

Add a prop `hasAttachments` to `MessageInput` or adjust the parent. The cleanest approach: in `TaskInputFooter`, override `handleSendMessage` to be callable even with empty text when pills exist. Alternatively, add a `canSubmitEmpty` prop to `MessageInput`.

Option: add `extraDisabledCheck` or simply ensure `MessageInput` gets `disabled={!canSendMessage && openReviewComments.length === 0}`. But that won't help since `handleSubmit` inside `MessageInput` also checks for empty.

Better approach: in `TaskInputFooter`, intercept by wrapping `handleSendMessage`. If the text is empty but pills exist, create a minimal text part:

```tsx
const handleSendMessage = useCallback(
  (parts: PromptPart[]) => {
    // ...existing logic with review comment synthesis...
  },
  [...],
);

// Allow send with just pills (override disabled)
const effectiveCanSend = canSendMessage || openReviewComments.length > 0;
```

And pass `disabled={!effectiveCanSend}` to `MessageInput`.

Also need to handle the case where `MessageInput.handleSubmit` blocks on empty text. In `MessageInput`, update to allow submission when parent indicates:

In `MessageInput`, add an optional `allowEmptySubmit` prop:

```tsx
allowEmptySubmit?: boolean;
```

And modify `handleSubmit`:

```tsx
if (!trimmed && images.length === 0 && attachedFiles.length === 0 && !allowEmptySubmit) return;
```

**Step 2: Run ts-check + lint**

Run: `pnpm ts-check && pnpm lint --fix`

---

## Task 7: Final cleanup and verification

**Step 1: Run full checks**

```bash
pnpm install
pnpm lint --fix
pnpm ts-check
pnpm lint
```

**Step 2: Verify the flow**

The expected user flow:
1. User opens diff view, adds comments on file lines → comments appear inline in diff as before
2. Comments also appear as pills in the composer at the bottom
3. User types optional follow-up text in composer
4. User hits Send (⌘↵) → typed text + synthesized review comments sent as prompt
5. Pills clear, diff comments get resolved
6. No more "Submit review" bar or overlay — single unified send path

**Step 3: Check no dead code remains**

Verify `ReviewSubmitOverlay` and `ReviewSubmitBar` still exist as files but are no longer imported by `WorktreeDiffView`. They can be removed in a follow-up if nothing else imports them. Check with:

```bash
grep -r "ReviewSubmitOverlay\|ReviewSubmitBar" src/ --include="*.tsx" --include="*.ts"
```

If only the definition files remain (no importers), mark them for removal.
