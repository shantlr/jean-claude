import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

export interface DiffSearchBarHandle {
  focus: () => void;
}

export const DiffSearchBar = forwardRef<
  DiffSearchBarHandle,
  {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    currentMatch: number;
    totalMatches: number;
    onNext: () => void;
    onPrevious: () => void;
    onClose: () => void;
  }
>(function DiffSearchBar(
  {
    searchQuery,
    onSearchChange,
    currentMatch,
    totalMatches,
    onNext,
    onPrevious,
    onClose,
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrevious();
        } else {
          onNext();
        }
      }
    },
    [onClose, onNext, onPrevious],
  );

  return (
    <div className="flex items-center gap-1 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in diff..."
        className="w-32 bg-transparent text-xs text-neutral-200 placeholder-neutral-500 outline-none"
      />

      {/* Occurrence count */}
      <span className="min-w-[4rem] text-center text-xs text-neutral-400">
        {searchQuery ? (
          totalMatches > 0 ? (
            `${currentMatch} of ${totalMatches}`
          ) : (
            'No results'
          )
        ) : (
          <>&nbsp;</>
        )}
      </span>

      {/* Navigation arrows */}
      <button
        onClick={onPrevious}
        disabled={totalMatches === 0}
        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
        aria-label="Previous match"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        onClick={onNext}
        disabled={totalMatches === 0}
        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
        aria-label="Next match"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Close button */}
      <button
        onClick={onClose}
        className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        aria-label="Close search"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
});
