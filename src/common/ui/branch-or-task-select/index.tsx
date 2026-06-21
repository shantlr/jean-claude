import { Check, ChevronDown, GitFork } from 'lucide-react';
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



import type { BranchInfo, Task } from '@shared/types';
import { type ComponentSize, sizeClasses } from '@/common/ui/styles';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';


const SEARCH_INPUT_HEIGHT = 41;

export type BranchOrTaskSelection =
  | { type: 'branch'; branch: string }
  | { type: 'task'; taskId: string; taskBranch: string };

export function BranchOrTaskSelect({
  branches,
  branchesLoading,
  favoriteBranches,
  defaultBranch,
  protectedBranches,
  activeTasks,
  value,
  selectedTaskId,
  onChange,
  label,
  disabled,
  placeholder = 'Select branch...',
  side = 'bottom',
  size = 'md',
  className,
}: {
  branches: BranchInfo[];
  branchesLoading?: boolean;
  favoriteBranches?: string[];
  defaultBranch?: string | null;
  protectedBranches?: string[];
  activeTasks?: Task[];
  value: string | undefined;
  selectedTaskId?: string | null;
  onChange: (selection: BranchOrTaskSelection) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  side?: 'top' | 'bottom';
  size?: ComponentSize;
  className?: string;
}) {
  const id = useId();
  const listboxId = `branch-or-task-select-listbox-${id}`;
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

  // Filter tasks by search
  const filteredTasks = useMemo(
    () =>
      (activeTasks ?? []).filter((t) => {
        const name = t.name ?? t.prompt;
        return name.toLowerCase().includes(lowerSearch);
      }),
    [activeTasks, lowerSearch],
  );

  // Filter branches by search
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

  const allBranchItems = useMemo(
    () =>
      favoriteSet.size > 0
        ? filteredBranches.filter((b) => !favoriteSet.has(b.name))
        : filteredBranches,
    [filteredBranches, favoriteSet],
  );

  // Navigable items: tasks first, then favorite branches, then all branches
  type NavItem =
    | { kind: 'task'; task: Task }
    | { kind: 'branch'; branch: BranchInfo };

  const navigableItems = useMemo(() => {
    const items: NavItem[] = [];
    for (const t of filteredTasks) items.push({ kind: 'task', task: t });
    for (const b of favoriteBranchItems)
      items.push({ kind: 'branch', branch: b });
    for (const b of allBranchItems) items.push({ kind: 'branch', branch: b });
    return items;
  }, [filteredTasks, favoriteBranchItems, allBranchItems]);

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

  useEffect(() => {
    if (!isOpen || !searchRef.current) return;
    const timer = requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position]);

  useRegisterOverlay({
    id: `branch-or-task-select-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

  const getOptionElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }, []);

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

  const handleSelect = useCallback(
    (item: NavItem) => {
      if (item.kind === 'task') {
        onChange({
          type: 'task',
          taskId: item.task.id,
          taskBranch: item.task.branchName ?? '',
        });
      } else {
        onChange({
          type: 'branch',
          branch: item.branch.name,
        });
      }
      close();
    },
    [onChange, close],
  );

  useRegisterKeyboardBindings(
    `branch-or-task-select-${id}`,
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
          handleSelect(navigableItems[focusedIndex]);
        }
        return true;
      },
      tab: () => {
        close();
        return true;
      },
    },
    { enabled: isOpen },
  );

  const s = sizeClasses[size];
  const chevronSize =
    size === 'xs' || size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const heightOrPy = s.height || s.py;

  // Display value: show task name if parent task selected, else branch name
  const displayValue = useMemo(() => {
    if (selectedTaskId) {
      const task = (activeTasks ?? []).find((t) => t.id === selectedTaskId);
      if (task) {
        const name = task.name ?? task.prompt;
        return name.length > 30 ? name.slice(0, 30) + '...' : name;
      }
    }
    return value || placeholder;
  }, [selectedTaskId, activeTasks, value, placeholder]);

  const tasksOffset = 0;
  const favoritesOffset = filteredTasks.length;
  const allBranchesOffset = favoritesOffset + favoriteBranchItems.length;

  const renderTaskItem = (task: Task, navIndex: number) => {
    const isSelected = task.id === selectedTaskId;
    const isFocused = navIndex === focusedIndex;
    const name = task.name ?? task.prompt;
    const displayName = name.length > 50 ? name.slice(0, 50) + '...' : name;

    return (
      <button
        key={`task-${task.id}`}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isSelected}
        onClick={() => handleSelect({ kind: 'task', task })}
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
          <GitFork className="h-3 w-3 shrink-0 opacity-50" />
          <span
            className={clsx(
              'truncate',
              s.text,
              isSelected ? 'text-ink-1 font-medium' : 'text-ink-1',
            )}
          >
            {displayName}
          </span>
          {task.branchName && (
            <span className="text-ink-3 shrink-0 text-[10px]">
              {task.branchName}
            </span>
          )}
        </span>
      </button>
    );
  };

  const renderBranchItem = (branch: BranchInfo, navIndex: number) => {
    const isSelected = !selectedTaskId && branch.name === value;
    const isDefault = branch.name === defaultBranch;
    const isProtected = protectedSet.has(branch.name);
    const isFocused = navIndex === focusedIndex;

    return (
      <button
        key={`branch-${branch.name}-${navIndex}`}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isSelected}
        onClick={() => {
          onChange({ type: 'branch', branch: branch.name });
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
        <span className="max-w-[200px] truncate">{displayValue}</span>
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
            className="bg-bg-1 border-glass-border fixed z-50 min-w-48 rounded-md border shadow-xl"
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
              maxWidth: Math.min(320, position.maxWidth),
              maxHeight: position.maxHeight,
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
                placeholder="Search tasks or branches..."
                className={clsx(
                  'bg-glass-light border-glass-border text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none',
                )}
              />
            </div>

            {/* Scrollable list */}
            <div
              className="overflow-y-auto py-1"
              style={{
                maxHeight: position.maxHeight - SEARCH_INPUT_HEIGHT,
              }}
            >
              {branchesLoading ? (
                <div className="text-ink-3 px-3 py-2 text-sm">Loading...</div>
              ) : navigableItems.length === 0 ? (
                <div className="text-ink-3 px-3 py-2 text-sm">
                  No results found
                </div>
              ) : (
                <>
                  {/* Active tasks section */}
                  {filteredTasks.length > 0 && (
                    <>
                      <div className="text-ink-3 px-3 py-1 text-xs font-medium uppercase">
                        Parent task
                      </div>
                      {filteredTasks.map((task, i) =>
                        renderTaskItem(task, tasksOffset + i),
                      )}
                    </>
                  )}

                  {/* Favorites section */}
                  {favoriteBranchItems.length > 0 && (
                    <>
                      <div className="text-ink-3 px-3 py-1 text-xs font-medium uppercase">
                        Favorite branches
                      </div>
                      {favoriteBranchItems.map((branch, i) =>
                        renderBranchItem(branch, favoritesOffset + i),
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
