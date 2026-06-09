import { useCallback, useMemo, useRef } from 'react';
import { create } from 'zustand';

export interface PrCommentDraft {
  body: string;
  lineStart: number;
  lineEnd?: number;
}

function lineRangeKey(lineStart: number, lineEnd?: number): string {
  return lineEnd !== undefined && lineEnd !== lineStart
    ? `${lineStart}-${lineEnd}`
    : `${lineStart}`;
}

interface PrCommentDraftsState {
  /** fileKey → lineRangeKey → draft */
  drafts: Record<string, Record<string, PrCommentDraft>>;
  setDraft: (fileKey: string, draft: PrCommentDraft) => void;
  updateBody: (
    fileKey: string,
    lineStart: number,
    lineEnd: number | undefined,
    body: string,
  ) => void;
  clearDraft: (fileKey: string, lineStart: number, lineEnd?: number) => void;
}

export const usePrCommentDraftsStore = create<PrCommentDraftsState>((set) => ({
  drafts: {},

  setDraft: (fileKey, draft) =>
    set((state) => {
      const lrKey = lineRangeKey(draft.lineStart, draft.lineEnd);
      const fileDrafts = state.drafts[fileKey] ?? {};
      return {
        drafts: {
          ...state.drafts,
          [fileKey]: { ...fileDrafts, [lrKey]: draft },
        },
      };
    }),

  updateBody: (fileKey, lineStart, lineEnd, body) =>
    set((state) => {
      const lrKey = lineRangeKey(lineStart, lineEnd);
      const fileDrafts = state.drafts[fileKey];
      const existing = fileDrafts?.[lrKey];
      if (!existing) return state;
      return {
        drafts: {
          ...state.drafts,
          [fileKey]: { ...fileDrafts, [lrKey]: { ...existing, body } },
        },
      };
    }),

  clearDraft: (fileKey, lineStart, lineEnd) =>
    set((state) => {
      const lrKey = lineRangeKey(lineStart, lineEnd);
      const fileDrafts = state.drafts[fileKey];
      if (!fileDrafts?.[lrKey]) return state;
      const { [lrKey]: _, ...rest } = fileDrafts;
      if (Object.keys(rest).length === 0) {
        const { [fileKey]: __, ...restFiles } = state.drafts;
        return { drafts: restFiles };
      }
      return { drafts: { ...state.drafts, [fileKey]: rest } };
    }),
}));

export function prFileKey(prId: number, filePath: string) {
  return `${prId}:${filePath}`;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns action callbacks for a specific file's drafts.
 * Does NOT subscribe to draft values — avoids re-renders on typing.
 */
export function usePrFileDraftActions(prId: number, filePath: string) {
  const fKey = prFileKey(prId, filePath);
  const setDraftAction = usePrCommentDraftsStore((state) => state.setDraft);
  const updateBodyAction = usePrCommentDraftsStore((state) => state.updateBody);
  const clearDraftAction = usePrCommentDraftsStore((state) => state.clearDraft);

  const setDraft = useCallback(
    (draft: PrCommentDraft) => setDraftAction(fKey, draft),
    [fKey, setDraftAction],
  );

  const updateBody = useCallback(
    (lineStart: number, lineEnd: number | undefined, body: string) =>
      updateBodyAction(fKey, lineStart, lineEnd, body),
    [fKey, updateBodyAction],
  );

  const clearDraft = useCallback(
    (lineStart: number, lineEnd?: number) =>
      clearDraftAction(fKey, lineStart, lineEnd),
    [fKey, clearDraftAction],
  );

  /** Read body for a specific line range imperatively (no subscription). */
  const getBody = useCallback(
    (lineStart: number, lineEnd?: number) => {
      const lrKey = lineRangeKey(lineStart, lineEnd);
      return (
        usePrCommentDraftsStore.getState().drafts[fKey]?.[lrKey]?.body ?? ''
      );
    },
    [fKey],
  );

  /** Read all drafts for this file imperatively. */
  const getAllDrafts = useCallback(
    () => usePrCommentDraftsStore.getState().drafts[fKey] ?? {},
    [fKey],
  );

  return { setDraft, updateBody, clearDraft, getBody, getAllDrafts };
}

const EMPTY_COUNTS: Record<string, number> = {};

/**
 * Subscribe to draft count per file for a given PR.
 * Returns a stable `Record<filePath, draftCount>` — only re-renders when counts change.
 *
 * The selector itself returns a stable reference (via prevRef) so
 * useSyncExternalStore won't trigger spurious re-renders.
 */
export function usePrDraftCountByFile(prId: number, filePaths: string[]) {
  const prefix = `${prId}:`;
  const filePathsKey = filePaths.join('\0');
  const prevRef = useRef<Record<string, number>>(EMPTY_COUNTS);

  const selector = useCallback(
    (state: PrCommentDraftsState) => {
      const paths = filePathsKey.split('\0');
      const counts: Record<string, number> = {};
      for (const fp of paths) {
        if (!fp) continue;
        const fKey = `${prefix}${fp}`;
        const fileDrafts = state.drafts[fKey];
        if (fileDrafts) {
          const count = Object.keys(fileDrafts).length;
          if (count > 0) counts[fp] = count;
        }
      }
      // Return same reference when counts unchanged to prevent re-render loops
      if (shallowRecordEqual(prevRef.current, counts)) {
        return prevRef.current;
      }
      prevRef.current = counts;
      return counts;
    },
    [prefix, filePathsKey],
  );

  return usePrCommentDraftsStore(selector);
}

function shallowRecordEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Subscribe to list of draft line ranges for a specific file.
 * Only re-renders when the set of line ranges changes (not on body edits).
 */
export function usePrFileDraftRanges(prId: number, filePath: string) {
  const fKey = prFileKey(prId, filePath);

  const drafts = usePrCommentDraftsStore((state) => state.drafts[fKey]);

  return useMemo(() => {
    if (!drafts) return [];
    return Object.values(drafts).map((d) => ({
      lineStart: d.lineStart,
      lineEnd: d.lineEnd,
    }));
  }, [drafts]);
}
