import { create, type StoreApi, useStore } from 'zustand';
import { useCallback, useMemo, useRef } from 'react';
import { persist } from 'zustand/middleware';



// -- Base types --

export interface FileCommentAnchor {
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  selectedText?: string;
  /** Omit line_range when synthesizing prompt if source line numbers are unreliable. */
  omitLineRangeFromPrompt?: boolean;
  /** Character offset of the selection start within the container's combined
   *  text content. Used by message comments for precise highlight placement. */
  charOffset?: number;
}

// -- Keyed-collection store factory --

export interface KeyedCommentState<
  T extends { id: string; createdAt: number },
> {
  comments: Record<string, T[]>;

  addComment: (key: string, comment: Omit<T, 'id' | 'createdAt'>) => string;
  removeComment: (key: string, commentId: string) => void;
  updateComment: (key: string, commentId: string, updates: Partial<T>) => void;
  clearComments: (key: string) => void;
  clearAllComments: () => void;
}

export type KeyedCommentStore<T extends { id: string; createdAt: number }> =
  StoreApi<KeyedCommentState<T>>;

export function createKeyedCommentStore<
  T extends { id: string; createdAt: number },
>(idPrefix: string, options?: { persistName?: string }): KeyedCommentStore<T> {
  const storeCreator = (
    set: (
      fn: (state: KeyedCommentState<T>) => Partial<KeyedCommentState<T>>,
    ) => void,
  ): KeyedCommentState<T> => ({
    comments: {},

    addComment: (key, comment) => {
      const id = `${idPrefix}-${crypto.randomUUID()}`;
      set((state) => ({
        comments: {
          ...state.comments,
          [key]: [
            ...(state.comments[key] ?? []),
            { ...comment, id, createdAt: Date.now() } as T,
          ],
        },
      }));
      return id;
    },

    removeComment: (key, commentId) => {
      set((state) => ({
        comments: {
          ...state.comments,
          [key]: (state.comments[key] ?? []).filter((c) => c.id !== commentId),
        },
      }));
    },

    updateComment: (key, commentId, updates) => {
      set((state) => ({
        comments: {
          ...state.comments,
          [key]: (state.comments[key] ?? []).map((c) =>
            c.id === commentId ? { ...c, ...updates } : c,
          ),
        },
      }));
    },

    clearComments: (key) => {
      set((state) => {
        // Delete the key so useComments returns EMPTY_ARRAY via ?? fallback
        const { [key]: _, ...rest } = state.comments;
        return { comments: rest };
      });
    },

    clearAllComments: () => {
      set(() => ({
        comments: {},
      }));
    },
  });

  if (options?.persistName) {
    return create<KeyedCommentState<T>>()(
      persist(storeCreator, {
        name: options.persistName,
        version: 1,
        partialize: (state) => ({ comments: state.comments }),
      }),
    );
  }

  return create<KeyedCommentState<T>>()(storeCreator);
}

// -- Selector hooks factory --

const EMPTY_ARRAY: never[] = [];

export function createCommentSelectors<
  T extends { id: string; createdAt: number; anchor: FileCommentAnchor },
>(store: KeyedCommentStore<T>) {
  function useComments(key: string): T[] {
    return useStore(store, (state) => state.comments[key] ?? EMPTY_ARRAY);
  }

  function useCommentsForFile(key: string, filePath: string): T[] {
    const allComments = useComments(key);
    const filtered = useMemo(
      () => allComments.filter((c) => c.anchor.filePath === filePath),
      [allComments, filePath],
    );
    return filtered.length === 0 ? (EMPTY_ARRAY as T[]) : filtered;
  }

  function useCommentCount(key: string): number {
    const comments = useComments(key);
    return comments.length;
  }

  const EMPTY_MAP = new Map<string, number>();

  function useCommentCountsByFile(key: string): Map<string, number> {
    const comments = useComments(key);
    const prevRef = useRef<Map<string, number>>(EMPTY_MAP);

    return useMemo(() => {
      const map = new Map<string, number>();
      for (const c of comments) {
        map.set(c.anchor.filePath, (map.get(c.anchor.filePath) ?? 0) + 1);
      }

      // Structural equality check — return previous reference if counts unchanged
      const prev = prevRef.current;
      if (
        map.size === prev.size &&
        [...map].every(([k, v]) => prev.get(k) === v)
      ) {
        return prev;
      }

      prevRef.current = map.size === 0 ? EMPTY_MAP : map;
      return prevRef.current;
    }, [comments]);
  }

  function useCommentActions(key: string) {
    const addCommentAction = useStore(store, (state) => state.addComment);
    const removeCommentAction = useStore(store, (state) => state.removeComment);
    const updateCommentAction = useStore(store, (state) => state.updateComment);
    const clearCommentsAction = useStore(store, (state) => state.clearComments);

    const addComment = useCallback(
      (comment: Omit<T, 'id' | 'createdAt'>) => addCommentAction(key, comment),
      [key, addCommentAction],
    );

    const removeComment = useCallback(
      (commentId: string) => removeCommentAction(key, commentId),
      [key, removeCommentAction],
    );

    const updateComment = useCallback(
      (commentId: string, updates: Partial<T>) =>
        updateCommentAction(key, commentId, updates),
      [key, updateCommentAction],
    );

    const clearComments = useCallback(
      () => clearCommentsAction(key),
      [key, clearCommentsAction],
    );

    return useMemo(
      () => ({ addComment, removeComment, updateComment, clearComments }),
      [addComment, removeComment, updateComment, clearComments],
    );
  }

  return {
    useComments,
    useCommentsForFile,
    useCommentCount,
    useCommentCountsByFile,
    useCommentActions,
  };
}

// -- Shared utilities --

/** Group comments by their effective line (lineEnd ?? lineStart) */
export function groupCommentsByLine<T extends { anchor: FileCommentAnchor }>(
  comments: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const c of comments) {
    const line = c.anchor.lineEnd ?? c.anchor.lineStart;
    const existing = map.get(line);
    if (existing) {
      existing.push(c);
    } else {
      map.set(line, [c]);
    }
  }
  return map;
}

/** Get the set of all line numbers covered by any anchor range */
export function getCommentedLineSet<T extends { anchor: FileCommentAnchor }>(
  comments: T[],
): Set<number> {
  const set = new Set<number>();
  for (const c of comments) {
    const end = c.anchor.lineEnd ?? c.anchor.lineStart;
    for (let line = c.anchor.lineStart; line <= end; line++) {
      set.add(line);
    }
  }
  return set;
}

/** Format a human-readable label for a line range */
export function formatLineRangeLabel(
  lineStart: number,
  lineEnd?: number,
): string {
  if (lineEnd != null && lineEnd !== lineStart) {
    return `lines ${lineStart}\u2013${lineEnd}`;
  }
  return `line ${lineStart}`;
}
