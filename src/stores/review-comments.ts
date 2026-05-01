import { useRef, useMemo } from 'react';
import { create } from 'zustand';

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

// -- Store --

interface ReviewCommentsState {
  // comments keyed by taskId
  commentsByTask: Record<string, ReviewComment[]>;

  // Actions
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

export const useReviewCommentsStore = create<ReviewCommentsState>((set) => ({
  commentsByTask: {},

  addComment: (taskId, comment) => {
    const id = `rc-${crypto.randomUUID()}`;
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
        [taskId]: (state.commentsByTask[taskId] ?? []).filter(
          (c) => c.id !== commentId,
        ),
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
        [taskId]: (state.commentsByTask[taskId] ?? []).filter(
          (c) => !c.resolved,
        ),
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
  },
}));

// -- Selector hooks --

const EMPTY_ARRAY: ReviewComment[] = [];

export function useReviewComments(taskId: string) {
  const comments = useReviewCommentsStore(
    (state) => state.commentsByTask[taskId] ?? EMPTY_ARRAY,
  );
  return comments;
}

export function useReviewCommentsForFile(taskId: string, filePath: string) {
  const allComments = useReviewComments(taskId);
  const filtered = useMemo(
    () => allComments.filter((c) => c.anchor.filePath === filePath),
    [allComments, filePath],
  );
  return filtered.length === 0 ? EMPTY_ARRAY : filtered;
}

export function useOpenReviewCommentCount(taskId: string) {
  const comments = useReviewComments(taskId);
  return useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);
}

const EMPTY_RECORD: Record<string, number> = {};

export function useReviewCommentsByFile(taskId: string) {
  const comments = useReviewComments(taskId);
  const prevRef = useRef<Record<string, number>>(EMPTY_RECORD);

  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of comments) {
      if (!c.resolved) {
        map[c.anchor.filePath] = (map[c.anchor.filePath] ?? 0) + 1;
      }
    }

    // Return previous reference if counts are unchanged (avoids unnecessary re-renders)
    const prev = prevRef.current;
    const keys = Object.keys(map);
    const prevKeys = Object.keys(prev);
    if (
      keys.length === prevKeys.length &&
      keys.every((k) => prev[k] === map[k])
    ) {
      return prev;
    }

    prevRef.current = keys.length === 0 ? EMPTY_RECORD : map;
    return prevRef.current;
  }, [comments]);
}

/** Synthesize a structured prompt from all open comments. Returns null if no open comments. */
export function synthesizeReviewPrompt(
  comments: ReviewComment[],
  globalIntent?: string,
): string | null {
  const openComments = comments.filter((c) => !c.resolved);
  if (openComments.length === 0) return null;

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
    // When body is empty but presets exist, generate instruction from presets
    const body =
      c.body ||
      (c.presets.length > 0 ? `${c.presets.join(' and ')} this code` : '');
    parts.push(`   \u2192 ${body}`);
    parts.push('');
  });

  parts.push(
    "Keep changes scoped to the comments. Don't refactor unrelated code.",
  );

  return parts.join('\n');
}
