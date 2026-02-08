import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  computeDiff,
  computeSideBySideDiff,
  type DiffLine,
} from './diff-utils';

interface Hunk {
  /** Index of the first non-context line in the DiffLine[] array */
  startLineIndex: number;
  /** Index of the last non-context line in the DiffLine[] array */
  endLineIndex: number;
}

/**
 * Compute change hunks from diff lines.
 * A hunk is a maximal run of consecutive non-context lines
 * (merges adjacent deletions + additions into one navigable unit).
 */
function computeHunks(lines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type !== 'context') {
      const startLineIndex = i;
      while (i < lines.length && lines[i].type !== 'context') {
        i++;
      }
      hunks.push({ startLineIndex, endLineIndex: i - 1 });
    } else {
      i++;
    }
  }

  return hunks;
}

/**
 * Build a mapping from DiffLine index to the side-by-side row index.
 * This is needed because side-by-side mode renders rows differently
 * than the flat DiffLine[] array.
 */
function buildLineToRowMapping(
  oldString: string,
  newString: string,
): Map<number, number> {
  const lines = computeDiff(oldString, newString);
  const sbsRows = computeSideBySideDiff(oldString, newString);
  const mapping = new Map<number, number>();

  let lineIndex = 0;
  let rowIndex = 0;

  while (lineIndex < lines.length && rowIndex < sbsRows.length) {
    const line = lines[lineIndex];
    const row = sbsRows[rowIndex];

    if (line.type === 'context') {
      mapping.set(lineIndex, rowIndex);
      lineIndex++;
      rowIndex++;
    } else if (line.type === 'deletion') {
      if (row.left && row.left.oldLineNumber === line.oldLineNumber) {
        mapping.set(lineIndex, rowIndex);
        lineIndex++;
        if (!row.right || lines[lineIndex]?.type !== 'addition') {
          rowIndex++;
        }
      } else {
        rowIndex++;
      }
    } else if (line.type === 'addition') {
      if (row.right && row.right.newLineNumber === line.newLineNumber) {
        mapping.set(lineIndex, rowIndex);
        lineIndex++;
        rowIndex++;
      } else {
        rowIndex++;
      }
    }
  }

  return mapping;
}

export function useChangeNavigator({
  lines,
  scrollContainerRef,
  viewMode,
  oldString,
  newString,
}: {
  lines: DiffLine[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  viewMode: 'inline' | 'side-by-side';
  oldString: string;
  newString: string;
}) {
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const rafRef = useRef<number | null>(null);
  // Track if navigation is in progress to suppress scroll-based updates
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hunks = useMemo(() => computeHunks(lines), [lines]);

  // For side-by-side mode, build line-to-row mapping
  const lineToRowMap = useMemo(() => {
    if (viewMode === 'side-by-side') {
      return buildLineToRowMapping(oldString, newString);
    }
    return null;
  }, [viewMode, oldString, newString]);

  /**
   * Get the data-line-index value for a given hunk's start line.
   * In inline mode, data-line-index = DiffLine index.
   * In side-by-side mode, data-line-index = row index from the mapping.
   */
  const getDataLineIndex = useCallback(
    (hunkStartLineIndex: number): number | null => {
      if (viewMode === 'inline') {
        return hunkStartLineIndex;
      }
      if (lineToRowMap) {
        return lineToRowMap.get(hunkStartLineIndex) ?? null;
      }
      return null;
    },
    [viewMode, lineToRowMap],
  );

  /**
   * Find the row element for a given hunk.
   */
  const findHunkRow = useCallback(
    (hunkIndex: number): Element | null => {
      const container = scrollContainerRef.current;
      if (!container || !hunks[hunkIndex]) return null;

      const dataIndex = getDataLineIndex(hunks[hunkIndex].startLineIndex);
      if (dataIndex === null) return null;

      return container.querySelector(`[data-line-index="${dataIndex}"]`);
    },
    [scrollContainerRef, hunks, getDataLineIndex],
  );

  // Update current hunk based on scroll position
  const updateCurrentHunk = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || hunks.length === 0) return;

    // Use top-third of viewport as the reference point
    const referencePoint = container.scrollTop + container.clientHeight / 3;

    let bestIndex = 0;
    for (let i = 0; i < hunks.length; i++) {
      const row = findHunkRow(i);
      if (!row) continue;

      const rowTop = (row as HTMLElement).offsetTop;
      if (rowTop <= referencePoint) {
        bestIndex = i;
      } else {
        break;
      }
    }

    setCurrentHunkIndex(bestIndex);
  }, [scrollContainerRef, hunks, findHunkRow]);

  // Check scrollability and update current hunk on scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsScrollable(container.scrollHeight > container.clientHeight);

    // Skip scroll-based updates during programmatic navigation
    if (isNavigatingRef.current) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      updateCurrentHunk();
      rafRef.current = null;
    });
  }, [scrollContainerRef, updateCurrentHunk]);

  // Listen to scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Initial check
    setIsScrollable(container.scrollHeight > container.clientHeight);
    updateCurrentHunk();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [scrollContainerRef, handleScroll, updateCurrentHunk]);

  // Also check scrollability on resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setIsScrollable(container.scrollHeight > container.clientHeight);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // Reset current hunk when hunks change
  useEffect(() => {
    setCurrentHunkIndex(0);
  }, [hunks]);

  const scrollToHunk = useCallback(
    (hunkIndex: number) => {
      const row = findHunkRow(hunkIndex);
      if (row) {
        // Mark that we're navigating so scroll handler doesn't override our index
        isNavigatingRef.current = true;

        // Clear any existing navigation timeout
        if (navigationTimeoutRef.current !== null) {
          clearTimeout(navigationTimeoutRef.current);
        }

        setCurrentHunkIndex(hunkIndex);
        row.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Allow scroll handler to resume after smooth scroll completes
        navigationTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
          navigationTimeoutRef.current = null;
        }, 500);
      }
    },
    [findHunkRow],
  );

  const goToNextHunk = useCallback(() => {
    if (hunks.length === 0) return;
    const next = (currentHunkIndex + 1) % hunks.length;
    scrollToHunk(next);
  }, [hunks.length, currentHunkIndex, scrollToHunk]);

  const goToPreviousHunk = useCallback(() => {
    if (hunks.length === 0) return;
    const prev = (currentHunkIndex - 1 + hunks.length) % hunks.length;
    scrollToHunk(prev);
  }, [hunks.length, currentHunkIndex, scrollToHunk]);

  // Keyboard shortcuts: [ for previous, ] for next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (hunks.length === 0) return;

      if (e.key === '[') {
        e.preventDefault();
        goToPreviousHunk();
      } else if (e.key === ']') {
        e.preventDefault();
        goToNextHunk();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hunks.length, goToNextHunk, goToPreviousHunk]);

  // Cleanup navigation timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current !== null) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  return {
    totalHunks: hunks.length,
    currentHunkIndex,
    goToNextHunk,
    goToPreviousHunk,
    isScrollable,
  };
}
