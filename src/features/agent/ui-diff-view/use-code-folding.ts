import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { hashContent, useCollapsedLines } from '@/stores/code-folding';
import { api } from '@/lib/api';
import type { FoldRange } from '@shared/fold-types';



export type { FoldRange };

/**
 * Detect foldable ranges based on indentation (fallback when tree-sitter is unavailable).
 */
function detectFoldRangesFromIndentation(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];

  function getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    return match[1].replace(/\t/g, '    ').length;
  }

  function getNextNonEmptyIndent(startIdx: number): number {
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        return getIndent(lines[i]);
      }
    }
    return 0;
  }

  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i];
    if (currentLine.trim().length === 0) continue;

    const currentIndent = getIndent(currentLine);
    const nextIndent = getNextNonEmptyIndent(i + 1);

    if (nextIndent > currentIndent) {
      let endLine = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim().length === 0) {
          endLine = j;
          continue;
        }
        const indent = getIndent(line);
        if (indent <= currentIndent) {
          break;
        }
        endLine = j;
      }

      if (endLine > i) {
        ranges.push({
          startLine: i + 1,
          endLine: endLine + 1,
        });
      }
    }
  }

  return ranges;
}

/**
 * Hook for managing code folding state in the diff view.
 * Uses tree-sitter (via main process IPC) for AST-based fold detection,
 * with indentation-based fallback for unsupported languages.
 * Fold state is persisted per file path via Zustand store, keyed by content hash.
 */
export function useCodeFolding(
  content: string,
  language: string,
  filePath: string,
) {
  const contentHash = useMemo(() => hashContent(content), [content]);
  const { collapsedLines, setCollapsedLines } = useCollapsedLines(
    filePath,
    contentHash,
  );
  const [foldRanges, setFoldRanges] = useState<FoldRange[]>([]);
  const requestIdRef = useRef(0);
  const lastHashRef = useRef('');

  // Fetch fold ranges from tree-sitter in main process.
  // Uses content hash to avoid redundant IPC calls for same content.
  useEffect(() => {
    if (lastHashRef.current === contentHash) return;
    lastHashRef.current = contentHash;

    const requestId = ++requestIdRef.current;

    api.codeFolding
      .getFoldRanges(content, language)
      .then((ranges) => {
        if (requestId !== requestIdRef.current) return;

        if (ranges.length > 0) {
          setFoldRanges(ranges);
        } else {
          const lines = content.split('\n');
          setFoldRanges(detectFoldRangesFromIndentation(lines));
        }
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        const lines = content.split('\n');
        setFoldRanges(detectFoldRangesFromIndentation(lines));
      });
  }, [content, language, contentHash]);

  // Map from startLine to FoldRange for quick lookup
  const foldRangeMap = useMemo(() => {
    const map = new Map<number, FoldRange>();
    for (const range of foldRanges) {
      map.set(range.startLine, range);
    }
    return map;
  }, [foldRanges]);

  // Pre-compute the set of all hidden line numbers for O(1) per-line checks.
  // This replaces the O(N*M) isLineHidden iteration.
  const hiddenLines = useMemo(() => {
    const hidden = new Set<number>();
    for (const startLine of collapsedLines) {
      const range = foldRangeMap.get(startLine);
      if (range) {
        for (let i = range.startLine + 1; i <= range.endLine; i++) {
          hidden.add(i);
        }
      }
    }
    return hidden;
  }, [collapsedLines, foldRangeMap]);

  // Use the store's setCollapsedLines directly in a stable callback
  // that reads from the store action (not the derived Set).
  const toggleFold = useCallback(
    (lineNumber: number) => {
      setCollapsedLines(
        collapsedLines.has(lineNumber)
          ? new Set([...collapsedLines].filter((l) => l !== lineNumber))
          : new Set([...collapsedLines, lineNumber]),
      );
    },
    [collapsedLines, setCollapsedLines],
  );

  const collapseAll = useCallback(() => {
    setCollapsedLines(new Set(foldRanges.map((r) => r.startLine)));
  }, [foldRanges, setCollapsedLines]);

  const expandAll = useCallback(() => {
    setCollapsedLines(new Set());
  }, [setCollapsedLines]);

  const isLineHidden = useCallback(
    (lineNumber: number): boolean => hiddenLines.has(lineNumber),
    [hiddenLines],
  );

  const isFoldStart = useCallback(
    (lineNumber: number): boolean => foldRangeMap.has(lineNumber),
    [foldRangeMap],
  );

  const isFoldCollapsed = useCallback(
    (lineNumber: number): boolean => collapsedLines.has(lineNumber),
    [collapsedLines],
  );

  const getFoldRange = useCallback(
    (lineNumber: number): FoldRange | undefined => foldRangeMap.get(lineNumber),
    [foldRangeMap],
  );

  return {
    foldRanges,
    collapsedLines,
    hiddenLines,
    toggleFold,
    collapseAll,
    expandAll,
    isLineHidden,
    isFoldStart,
    isFoldCollapsed,
    getFoldRange,
  };
}
