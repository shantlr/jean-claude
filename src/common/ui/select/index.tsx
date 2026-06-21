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
import clsx from 'clsx';
import { createPortal } from 'react-dom';



import { type ComponentSize, sizeClasses } from '@/common/ui/styles';
import {
  type KeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { Kbd } from '@/common/ui/kbd';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useRegisterOverlay } from '@/common/context/overlay';



export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  group?: string;
  badge?: string;
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
    size?: ComponentSize;
    side?: 'top' | 'bottom';
    align?: 'left' | 'right';
    className?: string;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    layer?: KeyboardLayer;
  }
>(function Select(
  {
    value,
    options,
    onChange,
    disabled,
    label,
    size = 'md',
    side = 'bottom',
    align = 'left',
    className,
    shortcut,
    shortcutBehavior = 'cycle',
    layer,
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
    { enabled: isOpen, layer },
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
    layer,
  });

  // Resolve display shortcut (first one for <Kbd>)
  const displayShortcut = shortcutKeys[0];
  const s = sizeClasses[size];

  const chevronSize =
    size === 'xs' || size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const heightOrPy = s.height || s.py;

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
          'bg-glass-light hover:bg-glass-medium text-ink-1 flex min-w-0 items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          heightOrPy,
          s.text,
          s.px,
          s.radius,
          s.gap,
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{selectedOption?.label}</span>
          {selectedOption?.badge && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
              {selectedOption.badge}
            </span>
          )}
        </span>
        {displayShortcut ? (
          <Kbd shortcut={displayShortcut} />
        ) : (
          <ChevronDown className={chevronSize} aria-hidden />
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
            className="bg-bg-1 border-glass-border fixed z-[70] min-w-48 overflow-x-hidden overflow-y-auto rounded-md border py-1 shadow-xl"
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
            }}
          >
            {options.map((option, index) => {
              const previousGroup = index > 0 ? options[index - 1].group : null;
              const showGroupLabel =
                option.group && option.group !== previousGroup;

              return (
                <React.Fragment key={option.value}>
                  {showGroupLabel && (
                    <div className="text-ink-4 bg-bg-1 sticky -top-1 z-10 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase first:pt-1">
                      {option.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                    className={clsx(
                      'hover:bg-glass-medium focus:bg-glass-medium flex w-full items-center text-left transition-colors focus:outline-none',
                      s.text,
                      s.gap,
                      s.px,
                      s.py,
                      option.value === value ? 'text-ink-1' : 'text-ink-2',
                    )}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {option.value === value && <Check className="h-3 w-3" />}
                    </span>
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        <span
                          className={clsx(
                            s.text,
                            option.value === value
                              ? 'text-ink-1 font-medium'
                              : 'text-ink-1',
                          )}
                        >
                          {option.label}
                        </span>
                        {option.badge && (
                          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
                            {option.badge}
                          </span>
                        )}
                      </span>
                      {option.description && (
                        <span className="text-ink-3 text-xs">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
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
  size?: ComponentSize;
  side?: 'top' | 'bottom';
  align?: 'left' | 'right';
  className?: string;
  shortcut?: BindingKey | BindingKey[];
  shortcutBehavior?: 'cycle' | 'open';
  layer?: KeyboardLayer;
  ref?: React.Ref<SelectRef>;
}) => React.ReactElement;
