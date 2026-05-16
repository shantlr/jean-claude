import { createContext, useContext } from 'react';

import type { PromptImagePart } from '@shared/agent-backend-types';

export type ReviewCommentKind = 'diff' | 'message';

/** Diff comment — anchored to a file path + line range with selected content */
export interface DiffCommentParams {
  kind: 'diff';
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  selectedText?: string;
  body: string;
  presets: string[];
  images?: PromptImagePart[];
}

/** Message comment — anchored to an agent message entry */
export interface MessageCommentParams {
  kind: 'message';
  /** The step the message belongs to */
  stepLabel: string;
  /** Normalized entry ID of the message */
  entryId: string;
  /** Human-readable label for the anchor (e.g. "Plan · §2") */
  anchorLabel: string;
  /** Quoted text from the message */
  selectedText?: string;
  body: string;
  presets: string[];
  images?: PromptImagePart[];
}

export type ReviewCommentParams = DiffCommentParams | MessageCommentParams;

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
