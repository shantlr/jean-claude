import { useStore } from 'zustand';

import {
  createCommentSelectors,
  createKeyedCommentStore,
  type FileCommentAnchor,
} from './utils-comment-store';

// -- Types --

export interface ComposerFileComment {
  id: string;
  anchor: FileCommentAnchor;
  body: string;
  createdAt: number;
}

// -- Store --

const store = createKeyedCommentStore<ComposerFileComment>('cfc');

const selectors = createCommentSelectors(store);

// Re-export a hook-based accessor so existing `useComposerFileCommentsStore(selector)` calls work,
// while also exposing `.getState()` / `.setState()` / `.subscribe()` for imperative access.
type StoreState = ReturnType<(typeof store)['getState']>;

function useComposerFileCommentsStoreHook<U>(
  selector: (state: StoreState) => U,
): U {
  return useStore(store, selector);
}

export const useComposerFileCommentsStore = Object.assign(
  useComposerFileCommentsStoreHook,
  {
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
  },
);

// -- Selector hooks (same names as before) --

export const useComposerFileComments = selectors.useComments;
export const useComposerFileCommentsForFile = selectors.useCommentsForFile;
export const useComposerFileCommentCount = selectors.useCommentCount;
export const useComposerFileCommentCountsByFile =
  selectors.useCommentCountsByFile;
export const useComposerFileCommentActions = selectors.useCommentActions;

// -- Prompt synthesis --

/** Synthesize a structured prompt from file comments. Returns null if no comments. */
export function synthesizeFileCommentsPrompt(
  comments: ComposerFileComment[],
): string | null {
  if (comments.length === 0) return null;

  // Group comments by file
  const byFile = new Map<string, ComposerFileComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.anchor.filePath);
    if (existing) {
      existing.push(c);
    } else {
      byFile.set(c.anchor.filePath, [c]);
    }
  }

  const parts: string[] = [];

  for (const [filePath, fileComments] of byFile) {
    parts.push(`### ${filePath}`);

    // Sort by line number within each file
    const sorted = [...fileComments].sort(
      (a, b) => a.anchor.lineStart - b.anchor.lineStart,
    );

    for (const c of sorted) {
      const lineLabel = c.anchor.lineEnd
        ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
        : `L${c.anchor.lineStart}`;
      parts.push(`- ${lineLabel}: ${c.body}`);
    }

    parts.push('');
  }

  return parts.join('\n').trimEnd();
}
