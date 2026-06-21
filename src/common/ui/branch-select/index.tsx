import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';



import { type ComponentSize, sizeClasses } from '@/common/ui/styles';
import {
  type KeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import type { BranchInfo } from '@shared/types';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useRegisterOverlay } from '@/common/context/overlay';



const SEARCH_INPUT_HEIGHT = 41; // 32px input + 8px padding + 1px border

export function BranchSelect({
  branches,
  branchesLoading,
  favoriteBranches,
  defaultBranch,
  protectedBranches,
  value,
  onChange,
  label,
  disabled,
  placeholder = 'Select branch...',
  side = 'bottom',
  size = 'md',
  className,
  layer,
}: {
  branches: BranchInfo[];
  branchesLoading?: boolean;
  favoriteBranches?: string[];
  defaultBranch?: string | null;
  protectedBranches?: string[];
  value: string | undefined;
  onChange: (branch: string) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  side?: 'top' | 'bottom';
  size?: ComponentSize;
  className?: string;
  layer?: KeyboardLayer;
}) {
  const id = useId();
  const listboxId = `branch-select-listbox-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const position = useDropdownPosition({ isOpen, triggerRef, side });

  const favoriteSet = useMemo(
    () => new Set(favoriteBranches ?? []),
    [favoriteBranches],
  );

  const protectedSet = useMemo(
    () => new Set(protectedBranches ?? []),
    [protectedBranches],
  );

  const lowerSearch = search.toLowerCase();

  const filteredBranches = useMemo(
    () =>
      lowerSearch
        ? branches.filter((b) => b.name.toLowerCase().includes(lowerSearch))
        : branches,
    [branches, lowerSearch],
  );

  const favoriteBranchItems = useMemo(
    () =>
      favoriteSet.size > 0
        ? filteredBranches.filter((b) => favoriteSet.has(b.name))
        : [],
    [filteredBranches, favoriteSet],
  );

  // "All Branches" excludes favorites to avoid duplicates
  const allBranchItems = useMemo(
    () =>
      favoriteSet.size > 0
        ? filteredBranches.filter((b) => !favoriteSet.has(b.name))
        : filteredBranches,
    [filteredBranches, favoriteSet],
  );

  // Flat list of navigable items (favorites then all, no duplicates)
  const navigableItems = useMemo(() => {
    const items: BranchInfo[] = [];
    for (const b of favoriteBranchItems) items.push(b);
    for (const b of allBranchItems) items.push(b);
    return items;
  }, [favoriteBranchItems, allBranchItems]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    setSearch('');
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      if (prev) {
        setFocusedIndex(-1);
        setSearch('');
        triggerRef.current?.focus();
      }
      return !prev;
    });
  }, [disabled]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (!isOpen || !searchRef.current) return;
    const timer = requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position]);

  // Click-outside detection
  useRegisterOverlay({
    id: `branch-select-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

  // Get all option elements in the listbox
  const getOptionElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }, []);

  // Focus an option by index (scroll into view)
  const focusOptionByIndex = useCallback(
    (index: number) => {
      const items = getOptionElements();
      if (index >= 0 && index < items.length) {
        items[index].scrollIntoView({ block: 'nearest' });
        setFocusedIndex(index);
      }
    },
    [getOptionElements],
  );

  // Keyboard bindings when open
  useRegisterKeyboardBindings(
    `branch-select-${id}`,
    {
      escape: () => {
        close();
        return true;
      },
      down: () => {
        if (navigableItems.length === 0) return true;
        const next =
          focusedIndex < navigableItems.length - 1 ? focusedIndex + 1 : 0;
        focusOptionByIndex(next);
        return true;
      },
      up: () => {
        if (navigableItems.length === 0) return true;
        const prev =
          focusedIndex > 0 ? focusedIndex - 1 : navigableItems.length - 1;
        focusOptionByIndex(prev);
        return true;
      },
      enter: () => {
        if (focusedIndex >= 0 && focusedIndex < navigableItems.length) {
          onChange(navigableItems[focusedIndex].name);
          close();
        }
        return true;
      },
      tab: () => {
        close();
        return true;
      },
    },
    { enabled: isOpen, layer },
  );

  const s = sizeClasses[size];
  const chevronSize =
    size === 'xs' || size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const heightOrPy = s.height || s.py;

  const displayValue = value || placeholder;

  // Offset for "All Branches" items in the navigable list
  const allBranchesOffset = favoriteBranchItems.length;

  const renderBranchItem = (branch: BranchInfo, navIndex: number) => {
    const isSelected = branch.name === value;
    const isDefault = branch.name === defaultBranch;
    const isProtected = protectedSet.has(branch.name);
    const isFocused = navIndex === focusedIndex;

    return (
      <button
        key={`${branch.name}-${navIndex}`}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isSelected}
        onClick={() => {
          onChange(branch.name);
          close();
        }}
        className={clsx(
          'focus:bg-glass-medium flex w-full items-center text-left transition-colors focus:outline-none',
          isFocused ? 'bg-glass-medium' : 'hover:bg-glass-medium',
          s.text,
          s.gap,
          s.px,
          s.py,
          isSelected ? 'text-ink-1' : 'text-ink-2',
        )}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {isSelected && <Check className="h-3 w-3" />}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className={clsx(
              'truncate',
              s.text,
              isSelected ? 'text-ink-1 font-medium' : 'text-ink-1',
            )}
          >
            {branch.name}
          </span>
          {isDefault && (
            <span className="text-ink-3 shrink-0 text-xs">(default)</span>
          )}
          {isProtected && (
            <span className="text-ink-3 shrink-0 text-xs">(protected)</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={label}
        className={clsx(
          'bg-glass-light hover:bg-glass-medium text-ink-1 flex items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          heightOrPy,
          s.text,
          s.px,
          s.radius,
          s.gap,
          className,
        )}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown className={chevronSize} aria-hidden />
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            id={listboxId}
            role="listbox"
            aria-orientation="vertical"
            aria-label={label}
            className="bg-bg-1 border-glass-border fixed z-[70] min-w-48 rounded-md border shadow-xl"
            style={{
              top: position.actualSide === 'bottom' ? position.top : undefined,
              bottom:
                position.actualSide === 'top'
                  ? window.innerHeight - position.top
                  : undefined,
              left: position.actualAlign === 'left' ? position.left : undefined,
              right:
                position.actualAlign === 'right'
                  ? window.innerWidth - position.left
                  : undefined,
              maxHeight: position.maxHeight,
              maxWidth: position.maxWidth,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search input */}
            <div className="border-glass-border border-b p-1">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusedIndex(-1);
                }}
                placeholder="Search branches..."
                className={clsx(
                  'bg-glass-light border-glass-border text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none',
                )}
              />
            </div>

            {/* Scrollable branch list */}
            <div
              className="overflow-y-auto py-1"
              style={{
                maxHeight: position.maxHeight - SEARCH_INPUT_HEIGHT,
              }}
            >
              {branchesLoading ? (
                <div className="text-ink-3 px-3 py-2 text-sm">
                  Loading branches...
                </div>
              ) : navigableItems.length === 0 ? (
                <div className="text-ink-3 px-3 py-2 text-sm">
                  No branches found
                </div>
              ) : (
                <>
                  {/* Favorites section */}
                  {favoriteBranchItems.length > 0 && (
                    <>
                      <div className="text-ink-3 px-3 py-1 text-xs font-medium uppercase">
                        Favorites
                      </div>
                      {favoriteBranchItems.map((branch, i) =>
                        renderBranchItem(branch, i),
                      )}
                    </>
                  )}

                  {/* All Branches section */}
                  {allBranchItems.length > 0 && (
                    <>
                      <div className="text-ink-3 px-3 py-1 text-xs font-medium uppercase">
                        All branches
                      </div>
                      {allBranchItems.map((branch, i) =>
                        renderBranchItem(branch, allBranchesOffset + i),
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
