import { useMemo } from 'react';
import { useStore } from 'zustand';

import type { PromptImagePart, PromptPart } from '@shared/agent-backend-types';

import {
  createCommentSelectors,
  createKeyedCommentStore,
  type FileCommentAnchor,
} from './utils-comment-store';
import {
  escapePromptTagContent,
  formatPromptLineRange,
} from './utils-comment-prompt';


// -- Types --

export type ReviewPresetId =
  | 'refactor'
  | 'simplify'
  | 'rename'
  | 'tests'
  | 'explain'
  | 'remove';

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

/** @deprecated Use FileCommentAnchor from utils-comment-store instead */
export type ReviewCommentAnchor = FileCommentAnchor;

export type ReviewCommentKind = 'diff' | 'message';

export interface ReviewComment {
  id: string;
  /** 'diff' for file/code comments, 'message' for agent message comments */
  commentKind: ReviewCommentKind;
  anchor: FileCommentAnchor;
  /** Commit-scoped comments only appear for that commit's file diff. */
  commitHash?: string;
  body: string;
  images?: PromptImagePart[];
  presets: ReviewPresetId[];
  status: ReviewCommentStatus;
  agentNote?: string;
  resolved: boolean;
  createdAt: number;
}

// -- Store (generic base + domain-specific actions) --

const baseStore = createKeyedCommentStore<ReviewComment>('rc', {
  persistName: 'jean-claude-review-comments',
});

// Domain-specific actions (stable references, not part of zustand state)
function resolveComment(taskId: string, commentId: string) {
  baseStore.setState((s) => ({
    comments: {
      ...s.comments,
      [taskId]: (s.comments[taskId] ?? []).map((c) =>
        c.id === commentId ? { ...c, resolved: true } : c,
      ),
    },
  }));
}

function clearResolvedComments(taskId: string) {
  baseStore.setState((s) => ({
    comments: {
      ...s.comments,
      [taskId]: (s.comments[taskId] ?? []).filter((c) => !c.resolved),
    },
  }));
}

function clearOpenComments(taskId: string) {
  baseStore.setState((s) => ({
    comments: {
      ...s.comments,
      [taskId]: (s.comments[taskId] ?? []).filter((c) => c.resolved),
    },
  }));
}

function resolveAllAddressed(taskId: string) {
  baseStore.setState((s) => ({
    comments: {
      ...s.comments,
      [taskId]: (s.comments[taskId] ?? []).map((c) =>
        c.status === 'addressed' ? { ...c, resolved: true } : c,
      ),
    },
  }));
}

function setCommentStatuses(
  taskId: string,
  updates: {
    commentId: string;
    status: ReviewCommentStatus;
    agentNote?: string;
  }[],
) {
  baseStore.setState((s) => {
    const map = new Map(updates.map((u) => [u.commentId, u]));
    return {
      comments: {
        ...s.comments,
        [taskId]: (s.comments[taskId] ?? []).map((c) => {
          const update = map.get(c.id);
          return update
            ? {
                ...c,
                status: update.status,
                agentNote: update.agentNote ?? c.agentNote,
              }
            : c;
        }),
      },
    };
  });
}

// Compatibility interface that maps `comments` -> `commentsByTask` and includes
// domain-specific actions, so existing `useReviewCommentsStore(s => s.foo)` works.
interface ReviewCommentsCompat {
  commentsByTask: Record<string, ReviewComment[]>;
  addComment: (
    taskId: string,
    comment: Omit<ReviewComment, 'id' | 'createdAt'>,
  ) => string;
  removeComment: (taskId: string, commentId: string) => void;
  updateComment: (
    taskId: string,
    commentId: string,
    updates: Partial<ReviewComment>,
  ) => void;
  resolveComment: (taskId: string, commentId: string) => void;
  clearComments: (taskId: string) => void;
  clearOpenComments: (taskId: string) => void;
  clearResolvedComments: (taskId: string) => void;
  resolveAllAddressed: (taskId: string) => void;
  setCommentStatuses: (
    taskId: string,
    updates: {
      commentId: string;
      status: ReviewCommentStatus;
      agentNote?: string;
    }[],
  ) => void;
}

// Cache the compat object. Actions are stable refs; only `commentsByTask`
// changes when store state changes. This avoids creating a new object on every
// zustand selector run.
let cachedCompat: ReviewCommentsCompat | null = null;
let cachedComments: Record<string, ReviewComment[]> | null = null;

function getCompat(
  state: ReturnType<(typeof baseStore)['getState']>,
): ReviewCommentsCompat {
  if (cachedCompat && cachedComments === state.comments) {
    return cachedCompat;
  }
  cachedComments = state.comments;
  cachedCompat = {
    commentsByTask: state.comments,
    addComment: state.addComment,
    removeComment: state.removeComment,
    updateComment: state.updateComment,
    clearComments: state.clearComments,
    clearOpenComments,
    resolveComment,
    clearResolvedComments,
    resolveAllAddressed,
    setCommentStatuses,
  };
  return cachedCompat;
}

export function useReviewCommentsStore<T>(
  selector: (state: ReviewCommentsCompat) => T,
): T {
  return useStore(baseStore, (state) => selector(getCompat(state)));
}

// -- Generic selector hooks --

const {
  useComments: useReviewComments,
  useCommentsForFile: useAllReviewCommentsForFile,
} = createCommentSelectors(baseStore);

export { useReviewComments };

export function useReviewCommentsForFile(taskId: string, filePath: string) {
  const comments = useAllReviewCommentsForFile(taskId, filePath);
  return useMemo(
    () => comments.filter((c) => c.commitHash === undefined),
    [comments],
  );
}

export function useReviewCommentsForCommitFile({
  taskId,
  commitHash,
  filePath,
}: {
  taskId: string;
  commitHash: string;
  filePath: string;
}) {
  const comments = useAllReviewCommentsForFile(taskId, filePath);
  return useMemo(
    () => comments.filter((c) => c.commitHash === commitHash),
    [comments, commitHash],
  );
}

// -- Imperative API (for use outside React components) --

/** Clear all review comments for a task. Call during task state cleanup. */
export function clearReviewCommentsForTask(taskId: string) {
  baseStore.getState().clearComments(taskId);
}

/** Remove persisted comments for tasks that no longer exist or are completed.
 *  Call once on app startup. */
export function pruneOrphanedReviewComments(activeTaskIds: Set<string>) {
  const state = baseStore.getState();
  const storedTaskIds = Object.keys(state.comments);
  for (const taskId of storedTaskIds) {
    if (!activeTaskIds.has(taskId)) {
      state.clearComments(taskId);
    }
  }
}

// -- Domain-specific selector hooks --

export function useOpenReviewCommentCount(taskId: string) {
  const comments = useReviewComments(taskId);
  return useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);
}

const EMPTY_RECORD: Record<string, number> = {};

export function useReviewCommentsByFile(taskId: string) {
  const comments = useReviewComments(taskId);

  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of comments) {
      if (!c.resolved && c.commitHash === undefined) {
        map[c.anchor.filePath] = (map[c.anchor.filePath] ?? 0) + 1;
      }
    }

    return Object.keys(map).length === 0 ? EMPTY_RECORD : map;
  }, [comments]);
}

export function useReviewCommentsByCommitFile({
  taskId,
  commitHash,
}: {
  taskId: string;
  commitHash: string | null;
}) {
  const comments = useReviewComments(taskId);

  return useMemo(() => {
    if (!commitHash) return EMPTY_RECORD;

    const map: Record<string, number> = {};
    for (const c of comments) {
      if (!c.resolved && c.commitHash === commitHash) {
        map[c.anchor.filePath] = (map[c.anchor.filePath] ?? 0) + 1;
      }
    }

    return Object.keys(map).length === 0 ? EMPTY_RECORD : map;
  }, [comments, commitHash]);
}

/** Synthesize a single comment into XML lines based on its kind. */
function synthesizeComment(
  c: ReviewComment,
  index: number,
): { textLines: string[]; imageParts: PromptImagePart[] } {
  const textLines: string[] = [];
  const imageParts: PromptImagePart[] = [];

  if (c.commentKind === 'message') {
    // Message comment — quote-based anchor
    textLines.push(`<comment index="${index}" type="message">`);
    if (c.anchor.selectedText?.trim()) {
      textLines.push('  <quoted_text>');
      textLines.push(escapePromptTagContent(c.anchor.selectedText));
      textLines.push('  </quoted_text>');
    }
  } else {
    // File/diff comment — file path + line range anchor
    const lineLabel = c.anchor.omitLineRangeFromPrompt
      ? null
      : formatPromptLineRange(c.anchor.lineStart, c.anchor.lineEnd);
    const commitAttr = c.commitHash
      ? ` commit="${escapePromptTagContent(c.commitHash)}"`
      : '';
    const lineRangeAttr = lineLabel ? ` line_range="${lineLabel}"` : '';
    textLines.push(
      `<comment index="${index}" type="file" file_path="${escapePromptTagContent(c.anchor.filePath)}"${lineRangeAttr}${commitAttr}>`,
    );
    if (c.presets.length > 0) {
      textLines.push(
        `  <tags>${escapePromptTagContent(c.presets.join(', '))}</tags>`,
      );
    }
    if (c.anchor.selectedText?.trim()) {
      textLines.push('  <selected_lines>');
      textLines.push(escapePromptTagContent(c.anchor.selectedText));
      textLines.push('  </selected_lines>');
    }
  }

  const body =
    c.body ||
    (c.presets.length > 0 ? `${c.presets.join(' and ')} this code` : '');
  textLines.push('  <instruction>');
  textLines.push(escapePromptTagContent(body));
  if (c.images && c.images.length > 0) {
    textLines.push('  [see attached image]');
  }
  textLines.push('  </instruction>');
  textLines.push('</comment>');
  textLines.push('');

  if (c.images) {
    imageParts.push(...c.images);
  }

  return { textLines, imageParts };
}

/** Synthesize a structured prompt from all open comments. Returns null if no open comments. */
export function synthesizeReviewPrompt(
  comments: ReviewComment[],
  globalIntent?: string,
): PromptPart[] | null {
  const openComments = comments
    .filter((c) => !c.resolved)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (openComments.length === 0) return null;

  const textLines: string[] = [];
  const imageParts: PromptImagePart[] = [];

  if (globalIntent?.trim()) {
    textLines.push('<overall_intent>');
    textLines.push(escapePromptTagContent(globalIntent.trim()));
    textLines.push('</overall_intent>');
    textLines.push('');
  }

  textLines.push('<user_review>');

  openComments.forEach((c, i) => {
    const result = synthesizeComment(c, i + 1);
    textLines.push(...result.textLines);
    imageParts.push(...result.imageParts);
  });

  textLines.push('</user_review>');

  const result: PromptPart[] = [{ type: 'text', text: textLines.join('\n') }];

  for (const img of imageParts) {
    result.push(img);
  }

  return result;
}
