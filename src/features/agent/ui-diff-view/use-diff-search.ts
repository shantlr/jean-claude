import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { DiffSearchBarHandle } from './diff-search-bar';
import type { DiffLine } from './diff-utils';

export interface SearchMatch {
  lineIndex: number;
  startIndex: number;
  endIndex: number;
}

export function useDiffSearch({
  lines,
  scrollContainerRef,
}: {
  lines: DiffLine[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchBarRef = useRef<DiffSearchBarHandle>(null);

  // Find all matches in the diff lines
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const results: SearchMatch[] = [];
    const query = searchQuery.toLowerCase();

    lines.forEach((line, lineIndex) => {
      const content = line.content.toLowerCase();
      let startIndex = 0;

      while (true) {
        const foundIndex = content.indexOf(query, startIndex);
        if (foundIndex === -1) break;

        results.push({
          lineIndex,
          startIndex: foundIndex,
          endIndex: foundIndex + query.length,
        });

        startIndex = foundIndex + 1;
      }
    });

    return results;
  }, [lines, searchQuery]);

  // Reset current match when matches change
  useEffect(() => {
    if (matches.length > 0) {
      setCurrentMatchIndex(0);
    }
  }, [matches.length, searchQuery]);

  // Scroll to current match
  useEffect(() => {
    if (matches.length === 0 || !scrollContainerRef.current) return;

    const currentMatch = matches[currentMatchIndex];
    if (!currentMatch) return;

    // Use requestAnimationFrame to wait for React to render the highlighted mark
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find the current match highlight by data attribute
      const currentMark = container.querySelector(
        'mark[data-current-match="true"]',
      );

      if (currentMark) {
        currentMark.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    });
  }, [currentMatchIndex, matches, scrollContainerRef]);

  const openSearch = useCallback(() => {
    // Use flushSync to ensure the search bar is rendered before focusing
    flushSync(() => {
      setIsSearchOpen(true);
    });
    searchBarRef.current?.focus();
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPreviousMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex(
      (prev) => (prev - 1 + matches.length) % matches.length,
    );
  }, [matches.length]);

  // Handle Cmd+F keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        openSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);

  return {
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    matches,
    currentMatchIndex,
    currentMatch: matches[currentMatchIndex] ?? null,
    totalMatches: matches.length,
    searchBarRef,
    openSearch,
    closeSearch,
    goToNextMatch,
    goToPreviousMatch,
  };
}
