import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RefObject } from 'react';
import { useMemo } from 'react';

import type { DisplayMessage } from '../message-merger';
import {
  computePromptIndexMap,
  usePromptNavigation,
} from '../use-prompt-navigation';

export function TimelinePromptNavigator({
  scrollContainerRef,
  displayMessages,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  displayMessages: DisplayMessage[];
}) {
  const totalPrompts = useMemo(
    () => computePromptIndexMap(displayMessages).size,
    [displayMessages],
  );

  const { currentIndex, goToNext, goToPrevious } = usePromptNavigation({
    scrollContainerRef,
    totalPrompts,
  });

  if (totalPrompts === 0) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalPrompts - 1;

  return (
    // Sticky wrapper: h-0 so it takes no vertical space.
    // top-1/2 keeps it vertically centered in the scroll viewport.
    <div className="pointer-events-none sticky top-1/2 z-20 h-0">
      {/* Centered on the timeline line: ml-3 = 12px from left, translate-x-1/2 centers the widget on it */}
      <div className="pointer-events-auto absolute left-3 -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-0.5 rounded-full border border-neutral-600/60 bg-neutral-900/50 px-0.5 py-1 shadow-lg backdrop-blur-sm">
          <button
            onClick={goToPrevious}
            disabled={isFirst}
            className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            aria-label="Previous prompt"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>

          <div className="flex flex-col items-center leading-none tabular-nums text-neutral-400">
            <span className="text-[10px]">{currentIndex + 1}</span>
            <span className="text-[10px]">{totalPrompts}</span>
          </div>

          <button
            onClick={goToNext}
            disabled={isLast}
            className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            aria-label="Next prompt"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
