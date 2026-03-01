import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DisplayMessage } from './message-merger';

/**
 * Pure helper: builds a map from displayMessage index → prompt index
 * for entries that represent user prompts (regular user-prompt or skill invocation).
 */
export function computePromptIndexMap(
  displayMessages: DisplayMessage[],
): Map<number, number> {
  const map = new Map<number, number>();
  let counter = 0;
  for (let i = 0; i < displayMessages.length; i++) {
    const dm = displayMessages[i];
    const isUserPrompt =
      (dm.kind === 'entry' &&
        dm.entry.type === 'user-prompt' &&
        dm.entry.value.trim() !== '') ||
      dm.kind === 'skill';
    if (isUserPrompt) {
      map.set(i, counter);
      counter++;
    }
  }
  return map;
}

/**
 * Hook that tracks which user-prompt is in view and provides prev/next navigation.
 * Self-attaches a scroll listener to the provided scroll container.
 */
export function usePromptNavigation({
  scrollContainerRef,
  totalPrompts,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  totalPrompts: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Find the DOM element for a given prompt index
  const findPromptElement = useCallback(
    (index: number): Element | null => {
      const container = scrollContainerRef.current;
      if (!container) return null;
      return container.querySelector(`[data-prompt-index="${index}"]`);
    },
    [scrollContainerRef],
  );

  // Determine which prompt is "current" based on scroll position.
  // The last prompt whose top edge is at or above the viewport upper-third wins.
  const updateCurrentIndex = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || totalPrompts === 0) return;

    const midpoint = container.scrollTop + container.clientHeight / 3;
    let best = 0;

    for (let i = 0; i < totalPrompts; i++) {
      const el = findPromptElement(i);
      if (!el) continue;
      if ((el as HTMLElement).offsetTop <= midpoint) {
        best = i;
      } else {
        break;
      }
    }

    setCurrentIndex(best);
  }, [scrollContainerRef, totalPrompts, findPromptElement]);

  // Self-attach scroll listener to the container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (isNavigatingRef.current) return;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        updateCurrentIndex();
        rafRef.current = null;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [scrollContainerRef, updateCurrentIndex]);

  // Scroll to a specific prompt index
  const scrollToPrompt = useCallback(
    (index: number) => {
      const el = findPromptElement(index);
      if (!el) return;

      isNavigatingRef.current = true;
      if (navigationTimeoutRef.current !== null) {
        clearTimeout(navigationTimeoutRef.current);
      }

      setCurrentIndex(index);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
        navigationTimeoutRef.current = null;
      }, 500);
    },
    [findPromptElement],
  );

  const goToNext = useCallback(() => {
    if (totalPrompts === 0) return;
    const next = Math.min(currentIndex + 1, totalPrompts - 1);
    scrollToPrompt(next);
  }, [totalPrompts, currentIndex, scrollToPrompt]);

  const goToPrevious = useCallback(() => {
    if (totalPrompts === 0) return;
    const prev = Math.max(currentIndex - 1, 0);
    scrollToPrompt(prev);
  }, [totalPrompts, currentIndex, scrollToPrompt]);

  const goToLast = useCallback(() => {
    if (totalPrompts === 0) return;
    scrollToPrompt(totalPrompts - 1);
  }, [totalPrompts, scrollToPrompt]);

  // Update index when prompt count changes
  useEffect(() => {
    updateCurrentIndex();
  }, [totalPrompts, updateCurrentIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (navigationTimeoutRef.current !== null)
        clearTimeout(navigationTimeoutRef.current);
    };
  }, []);

  return {
    currentIndex,
    totalPrompts,
    goToNext,
    goToPrevious,
    goToLast,
  };
}
