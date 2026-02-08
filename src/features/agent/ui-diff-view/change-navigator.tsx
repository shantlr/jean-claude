import { ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className="absolute top-2 left-4 z-10 flex items-center gap-1 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1 shadow-lg">
      <button
        onClick={onPrevious}
        disabled={totalHunks === 0}
        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
        aria-label="Previous change"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <span className="min-w-[6rem] text-center text-xs text-neutral-400">
        {totalHunks > 0
          ? `${currentHunk} of ${totalHunks} changes`
          : 'No changes'}
      </span>

      <button
        onClick={onNext}
        disabled={totalHunks === 0}
        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
        aria-label="Next change"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
