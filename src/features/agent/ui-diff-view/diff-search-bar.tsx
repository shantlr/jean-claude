import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';

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
      <Input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in diff..."
        size="sm"
        className="w-32 border-none bg-transparent p-0 focus:border-none"
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
      <IconButton
        onClick={onPrevious}
        disabled={totalMatches === 0}
        icon={<ChevronUp />}
        size="sm"
        variant="ghost"
        aria-label="Previous match"
      />
      <IconButton
        onClick={onNext}
        disabled={totalMatches === 0}
        icon={<ChevronDown />}
        size="sm"
        variant="ghost"
        aria-label="Next match"
      />

      {/* Close button */}
      <IconButton
        onClick={onClose}
        icon={<X />}
        size="sm"
        variant="ghost"
        aria-label="Close search"
      />
    </div>
  );
});
