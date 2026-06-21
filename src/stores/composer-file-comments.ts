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

export interface ComposerFileComment {
  id: string;
  anchor: FileCommentAnchor;
  body: string;
  images?: PromptImagePart[];
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
  projectRoot?: string,
): PromptPart[] | null {
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

  const textLines: string[] = [];
  const imageParts: PromptImagePart[] = [];

  textLines.push('<file_context_comments>');

  for (const [filePath, fileComments] of byFile) {
    const displayPath =
      projectRoot && filePath.startsWith(projectRoot)
        ? filePath.slice(projectRoot.length).replace(/^\//, '')
        : filePath;
    textLines.push(`<file path="${escapePromptTagContent(displayPath)}">`);

    // Sort by line number within each file
    const sorted = [...fileComments].sort(
      (a, b) => a.anchor.lineStart - b.anchor.lineStart,
    );

    for (const c of sorted) {
      const lineLabel = formatPromptLineRange(
        c.anchor.lineStart,
        c.anchor.lineEnd,
      );
      textLines.push(`  <comment line_range="${lineLabel}">`);
      if (c.anchor.selectedText?.trim()) {
        textLines.push('    <selected_lines>');
        textLines.push(escapePromptTagContent(c.anchor.selectedText));
        textLines.push('    </selected_lines>');
      }
      textLines.push('    <instruction>');
      textLines.push(escapePromptTagContent(c.body));
      if (c.images && c.images.length > 0) {
        textLines.push('    [see attached image]');
      }
      textLines.push('    </instruction>');
      textLines.push('  </comment>');
      textLines.push('');

      if (c.images) {
        imageParts.push(...c.images);
      }
    }

    textLines.push('</file>');
    textLines.push('');
  }

  textLines.push('</file_context_comments>');

  const result: PromptPart[] = [
    { type: 'text', text: textLines.join('\n').trimEnd() },
  ];

  for (const img of imageParts) {
    result.push(img);
  }

  return result;
}
