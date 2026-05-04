import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Store for persisting code folding state per file path.
 * Keyed by filePath → { collapsed line numbers, content hash }.
 * Persisted to localStorage so fold state survives across view mode switches and sessions.
 */

interface FoldEntry {
  /** Collapsed line numbers */
  lines: number[];
  /** Hash of the content when folds were saved, to detect stale state */
  contentHash: string;
}

interface CodeFoldingState {
  /** Map of filePath → fold entry */
  foldsByFile: Record<string, FoldEntry>;
  setFolds: (filePath: string, entry: FoldEntry) => void;
  clearFile: (filePath: string) => void;
  clearAll: () => void;
}

/** Max number of files to keep fold state for */
const MAX_ENTRIES = 200;

export const useCodeFoldingStore = create<CodeFoldingState>()(
  persist(
    (set) => ({
      foldsByFile: {},
      setFolds: (filePath, entry) =>
        set((s) => {
          const next = { ...s.foldsByFile, [filePath]: entry };
          // Evict oldest entries if over limit
          const keys = Object.keys(next);
          if (keys.length > MAX_ENTRIES) {
            const toRemove = keys.slice(0, keys.length - MAX_ENTRIES);
            for (const key of toRemove) {
              delete next[key];
            }
          }
          return { foldsByFile: next };
        }),
      clearFile: (filePath) =>
        set((s) => {
          const next = { ...s.foldsByFile };
          delete next[filePath];
          return { foldsByFile: next };
        }),
      clearAll: () => set({ foldsByFile: {} }),
    }),
    {
      name: 'code-folding-store',
    },
  ),
);

/**
 * Simple hash for content change detection (not cryptographic).
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

/**
 * Hook to get and set collapsed lines for a specific file path.
 * Returns a stable Set<number> and a setter.
 * Fold state is invalidated when contentHash changes.
 */
export function useCollapsedLines(filePath: string, contentHash: string) {
  const entry = useCodeFoldingStore((s) => s.foldsByFile[filePath]);
  const setFoldsAction = useCodeFoldingStore((s) => s.setFolds);

  // Return empty set if content has changed since folds were saved
  const collapsedLines = useMemo(() => {
    if (!entry || entry.contentHash !== contentHash) {
      return new Set<number>();
    }
    return new Set(entry.lines);
  }, [entry, contentHash]);

  const setCollapsedLines = useCallback(
    (lines: Set<number>) => {
      setFoldsAction(filePath, {
        lines: Array.from(lines),
        contentHash,
      });
    },
    [filePath, contentHash, setFoldsAction],
  );

  return { collapsedLines, setCollapsedLines };
}
