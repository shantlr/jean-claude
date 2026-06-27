import React, {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';



import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { isTypingInInput } from '@/common/context/keyboard-bindings/utils';
import { Kbd } from '@/common/ui/kbd';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';

function setRef<T>(
  ref: ((node: T) => void) | { current: T } | null | undefined,
  value: T,
) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object' && 'current' in ref) {
    queueMicrotask(() => {
      Reflect.set(ref, 'current', value);
    });
  }
}

export function Dropdown({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  className,
  dropdownRef,
  variant = 'default',
  onOpen,
  initialFocusIndex = 0,
}: {
  variant?: 'default' | 'bright';
  trigger:
    | ReactElement
    | ((props: { triggerRef: (node: HTMLElement | null) => void }) => ReactElement);
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
  dropdownRef?:
    | React.MutableRefObject<{ toggle: () => void } | null>
    | ((handle: { toggle: () => void } | null) => void);
  onOpen?: () => void;
  initialFocusIndex?: number;
}) {
  const id = useId();
  const menuId = `dropdown-menu-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [triggerElementNode, setTriggerElementNode] =
    useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const originalTriggerRef =
    typeof trigger !== 'function' && isValidElement(trigger)
      ? ((trigger as unknown as { ref?: unknown }).ref as
          | ((node: HTMLElement | null) => void)
          | { current: HTMLElement | null }
          | null
          | undefined)
      : undefined;

  const position = useDropdownPosition({
    isOpen,
    triggerElement: triggerElementNode,
    triggerRef,
    side,
    align,
  });

  useEffect(() => {
    if (isOpen) onOpen?.();
  }, [isOpen, onOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    // Return focus to trigger on close
    (triggerElementNode ?? triggerRef.current)?.focus();
  }, [triggerElementNode]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setFocusedIndex(-1);
        // Return focus to trigger on close
        (triggerElementNode ?? triggerRef.current)?.focus();
      }
      return !prev;
    });
  }, [triggerElementNode]);

  useEffect(() => {
    triggerRef.current = triggerElementNode;
  }, [triggerElementNode]);

  useEffect(() => {
    if (!originalTriggerRef) return;
    setRef(originalTriggerRef, triggerElementNode);
    return () => setRef(originalTriggerRef, null);
  }, [originalTriggerRef, triggerElementNode]);

  // Expose toggle to parent via ref or callback
  useEffect(() => {
    if (dropdownRef) {
      setRef(dropdownRef, { toggle });
    }
    return () => {
      if (dropdownRef) {
        setRef(dropdownRef, null);
      }
    };
  }, [dropdownRef, toggle]);

  // Get all menu items
  const getMenuItems = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter((element) => element.hasAttribute('tabindex'));
  }, []);

  // Focus the item at the given index
  const focusItem = useCallback(
    (index: number) => {
      const items = getMenuItems();
      if (index >= 0 && index < items.length) {
        items[index].focus();
        setFocusedIndex(index);
      }
    },
    [getMenuItems],
  );

  // Auto-focus requested item when dropdown opens
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    // Use a microtask to wait for the portal to render items
    const timer = requestAnimationFrame(() => {
      focusItem(initialFocusIndex);
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position, focusItem, initialFocusIndex]);

  // Register with overlay context for click-outside detection
  useRegisterOverlay({
    id: `dropdown-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

  // Type-ahead: pressing a letter key jumps to the first matching menu item
  const typeAheadBufferRef = useRef('');
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInInput(e)) return;

      // Only handle single printable letter keys (no modifiers except shift)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;

      // Skip if focus moved outside dropdown (e.g., overlay opened on top)
      const active = document.activeElement;
      if (
        active &&
        !contentRef.current?.contains(active) &&
        !triggerRef.current?.contains(active)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Accumulate characters for multi-char type-ahead
      clearTimeout(typeAheadTimerRef.current);
      typeAheadBufferRef.current += e.key.toLowerCase();
      typeAheadTimerRef.current = setTimeout(() => {
        typeAheadBufferRef.current = '';
      }, 500);

      const items = getMenuItems();
      const search = typeAheadBufferRef.current;

      // Search from after the current focused item, wrapping around
      const startIndex = focusedIndex + 1;
      for (let i = 0; i < items.length; i++) {
        const index = (startIndex + i) % items.length;
        const text = items[index].textContent?.trim().toLowerCase() ?? '';
        if (text.startsWith(search)) {
          focusItem(index);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      clearTimeout(typeAheadTimerRef.current);
    };
  }, [isOpen, focusedIndex, getMenuItems, focusItem]);

  // Register keyboard bindings when open.
  // Using { enabled: isOpen } so bindings re-register at the end of the LIFO
  // stack when the dropdown opens, giving them priority over parent bindings.
  useRegisterKeyboardBindings(
    `dropdown-${id}`,
    {
      escape: () => {
        close();
        return true;
      },
      down: {
        handler: () => {
          const items = getMenuItems();
          if (items.length === 0) return true;
          const next = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
          focusItem(next);
          return true;
        },
        ignoreIfInput: true,
      },
      up: {
        handler: () => {
          const items = getMenuItems();
          if (items.length === 0) return true;
          const prev = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
          focusItem(prev);
          return true;
        },
        ignoreIfInput: true,
      },
      enter: {
        handler: () => {
          const items = getMenuItems();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            items[focusedIndex].click();
          }
          return true;
        },
        ignoreIfInput: true,
      },
      space: {
        handler: () => {
          const items = getMenuItems();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            items[focusedIndex].click();
          }
          return true;
        },
        ignoreIfInput: true,
      },
      tab: {
        handler: () => {
          close();
          return true;
        },
        ignoreIfInput: true,
      },
    },
    { enabled: isOpen },
  );

  // Build trigger element
  let triggerElement: ReactElement;
  if (typeof trigger === 'function') {
    triggerElement = trigger({ triggerRef: setTriggerElementNode });
  } else if (isValidElement(trigger)) {
    triggerElement = cloneElement(
      trigger as ReactElement<Record<string, unknown>>,
      {
        ref: setTriggerElementNode,
        onClick: (e: React.MouseEvent) => {
          // Call original onClick if present
          const originalProps = trigger.props as Record<string, unknown>;
          if (typeof originalProps.onClick === 'function') {
            (originalProps.onClick as (e: React.MouseEvent) => void)(e);
          }
          toggle();
        },
        'aria-haspopup': 'menu' as const,
        'aria-expanded': isOpen,
        'aria-controls': isOpen ? menuId : undefined,
      },
    );
  } else {
    throw new Error(
      'Dropdown trigger must be a ReactElement or render function',
    );
  }

  return (
    <>
      {triggerElement}
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            id={menuId}
            role="menu"
            aria-orientation="vertical"
            className={clsx(
              variant === 'default' ? 'bg-bg-1' : 'bg-bg-1',
              'border-glass-border fixed z-50 min-w-48 overflow-x-hidden overflow-y-auto rounded-xl border py-1 shadow-lg',
              className,
            )}
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
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function DropdownItem({
  children,
  onClick,
  icon,
  variant = 'default',
  checked,
  shortcut,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
  checked?: boolean;
  shortcut?: BindingKey;
}) {
  return (
    <button
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={clsx(
        'hover:bg-glass-medium focus:bg-glass-medium flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors focus:outline-none',
        variant === 'danger' ? 'text-red-400' : 'text-ink-1',
      )}
    >
      {icon && (
        <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd shortcut={shortcut} />}
      {checked === true && (
        <Check className="text-acc-ink h-3.5 w-3.5 shrink-0" />
      )}
    </button>
  );
}

export function DropdownDivider() {
  return <hr role="separator" className="border-glass-border my-1 border-t" />;
}

export function DropdownInfo({
  label,
  value,
  onClick,
  valueClassName,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  valueClassName?: string;
}) {
  return (
    <div
      role={onClick ? 'menuitem' : undefined}
      tabIndex={onClick ? -1 : undefined}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-sm',
        onClick
          ? 'hover:bg-glass-medium focus:bg-glass-medium cursor-pointer transition-colors focus:outline-none'
          : 'cursor-default',
      )}
    >
      <span className="text-ink-3">{label}</span>
      <span
        className={clsx(
          'text-ink-2 truncate font-mono text-xs',
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}
