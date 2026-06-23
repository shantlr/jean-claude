import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo } from 'react';
import type { RefObject } from 'react';

import type { DiffLine } from './diff-utils';
import { useChangeNavigator } from './use-change-navigator';

export const ChangeNavigatorOverlay = memo(function ChangeNavigatorOverlay({
  lines,
  scrollContainerRef,
  viewMode,
  oldString,
  newString,
}: {
  lines: DiffLine[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  viewMode: 'inline' | 'side-by-side' | 'current-state';
  oldString: string;
  newString: string;
}) {
  const {
    totalHunks,
    currentHunkIndex,
    goToNextHunk,
    goToPreviousHunk,
    isScrollable,
  } = useChangeNavigator({
    lines,
    scrollContainerRef,
    viewMode,
    oldString,
    newString,
  });

  if (!isScrollable || totalHunks === 0) return null;

  return (
    <ChangeNavigator
      currentHunk={currentHunkIndex + 1}
      totalHunks={totalHunks}
      onNext={goToNextHunk}
      onPrevious={goToPreviousHunk}
    />
  );
});

export function ChangeNavigator({
  currentHunk,
  totalHunks,
  onNext,
  onPrevious,
}: {
  currentHunk: number;
  totalHunks: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div className="border-glass-border bg-bg-1 absolute top-2 left-4 z-10 flex items-center gap-1 rounded-md border px-2 py-1 shadow-lg">
      <button
        onClick={onPrevious}
        disabled={totalHunks === 0}
        className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 disabled:hover:text-ink-2 rounded p-0.5 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Previous change"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <span className="text-ink-2 min-w-[6rem] text-center text-xs">
        {totalHunks > 0
          ? `${currentHunk} of ${totalHunks} changes`
          : 'No changes'}
      </span>

      <button
        onClick={onNext}
        disabled={totalHunks === 0}
        className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 disabled:hover:text-ink-2 rounded p-0.5 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Next change"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
