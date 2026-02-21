import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { useRegisterOverlay } from '@/common/context/overlay';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { Kbd } from '@/common/ui/kbd';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectRef {
  next: () => void;
  prev: () => void;
  open: () => void;
  close: () => void;
}

export const Select = forwardRef<
  SelectRef,
  {
    value: string;
    options: SelectOption<string>[];
    onChange: (value: string) => void;
    disabled?: boolean;
    label?: string;
    side?: 'top' | 'bottom';
    align?: 'left' | 'right';
    className?: string;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
  }
>(function Select(
  {
    value,
    options,
    onChange,
    disabled,
    label,
    side = 'bottom',
    align = 'left',
    className,
    shortcut,
    shortcutBehavior = 'cycle',
  },
  ref,
) {
  const id = useId();
  const listboxId = `select-listbox-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const position = useDropdownPosition({ isOpen, triggerRef, side, align });

  const selectedOption = options.find((o) => o.value === value) ?? options[0];
  const selectedIndex = options.findIndex((o) => o.value === value);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
  }, [disabled]);

  const toggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      if (prev) {
        setFocusedIndex(-1);
        triggerRef.current?.focus();
      }
      return !prev;
    });
  }, [disabled]);

  const cycleNext = useCallback(() => {
    if (options.length === 0) return;
    const nextIndex =
      selectedIndex === -1 ? 0 : (selectedIndex + 1) % options.length;
    onChange(options[nextIndex].value);
  }, [options, selectedIndex, onChange]);

  const cyclePrev = useCallback(() => {
    if (options.length === 0) return;
    const prevIndex =
      selectedIndex <= 0 ? options.length - 1 : selectedIndex - 1;
    onChange(options[prevIndex].value);
  }, [options, selectedIndex, onChange]);

  // Imperative ref
  useImperativeHandle(
    ref,
    () => ({
      next: cycleNext,
      prev: cyclePrev,
      open,
      close,
    }),
    [cycleNext, cyclePrev, open, close],
  );

  // Get all option elements in the listbox
  const getOptionElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }, []);

  // Focus an option by index
  const focusOption = useCallback(
    (index: number) => {
      const items = getOptionElements();
      if (index >= 0 && index < items.length) {
        items[index].focus();
        setFocusedIndex(index);
      }
    },
    [getOptionElements],
  );

  // Auto-focus selected (or first) item when dropdown opens
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const timer = requestAnimationFrame(() => {
      focusOption(selectedIndex >= 0 ? selectedIndex : 0);
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position, focusOption, selectedIndex]);

  // Click-outside detection
  useRegisterOverlay({
    id: `select-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

  // Keyboard bindings when open
  useRegisterKeyboardBindings(
    `select-${id}`,
    {
      escape: () => {
        close();
        return true;
      },
      down: () => {
        const items = getOptionElements();
        if (items.length === 0) return true;
        const next = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
        focusOption(next);
        return true;
      },
      up: () => {
        const items = getOptionElements();
        if (items.length === 0) return true;
        const prev = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
        focusOption(prev);
        return true;
      },
      enter: () => {
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
          close();
        }
        return true;
      },
      space: () => {
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
          close();
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

  // Shortcut bindings (always active when mounted, ignoreIfInput)
  const shortcutKeys = shortcut
    ? Array.isArray(shortcut)
      ? shortcut
      : [shortcut]
    : [];
  const shortcutBindings = Object.fromEntries(
    shortcutKeys.map((key) => [
      key,
      {
        handler: () => {
          if (shortcutBehavior === 'open') {
            toggle();
          } else {
            cycleNext();
          }
          return true;
        },
        ignoreIfInput: false,
      },
    ]),
  );
  useRegisterKeyboardBindings(`select-shortcut-${id}`, shortcutBindings, {
    enabled: shortcutKeys.length > 0 && !disabled,
  });

  // Resolve display shortcut (first one for <Kbd>)
  const displayShortcut = shortcutKeys[0];

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
          'flex items-center gap-1.5 rounded border border-neutral-600 px-2 py-1 text-sm text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span>{selectedOption?.label}</span>
        {displayShortcut ? (
          <Kbd shortcut={displayShortcut} />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden />
        )}
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
            className="fixed z-50 min-w-48 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
            style={{
              top: position.actualSide === 'bottom' ? position.top : undefined,
              bottom:
                position.actualSide === 'top'
                  ? window.innerHeight - position.top
                  : undefined,
              left: align === 'left' ? position.left : undefined,
              right:
                align === 'right'
                  ? window.innerWidth - position.left
                  : undefined,
              maxHeight: position.maxHeight,
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none',
                  option.value === value
                    ? 'text-neutral-200'
                    : 'text-neutral-400',
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {option.value === value && <Check className="h-3 w-3" />}
                </span>
                <div className="flex flex-col">
                  <span
                    className={clsx(
                      'text-sm',
                      option.value === value
                        ? 'font-medium text-neutral-200'
                        : 'text-neutral-300',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-xs text-neutral-500">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}) as <T extends string>(props: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
  side?: 'top' | 'bottom';
  align?: 'left' | 'right';
  className?: string;
  shortcut?: BindingKey | BindingKey[];
  shortcutBehavior?: 'cycle' | 'open';
  ref?: React.Ref<SelectRef>;
}) => React.ReactElement;
