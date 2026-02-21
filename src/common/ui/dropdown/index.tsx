import clsx from 'clsx';
import { Check } from 'lucide-react';
import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { useRegisterOverlay } from '@/common/context/overlay';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { Kbd } from '@/common/ui/kbd';

function setRef<T>(
  ref: ((node: T) => void) | { current: T } | null | undefined,
  value: T,
) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object' && 'current' in ref) {
    ref.current = value;
  }
}

export function Dropdown({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  className,
  dropdownRef,
}: {
  trigger:
    | ReactElement
    | ((props: { triggerRef: RefObject<HTMLElement | null> }) => ReactElement);
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
  dropdownRef?:
    | React.MutableRefObject<{ toggle: () => void } | null>
    | ((handle: { toggle: () => void } | null) => void);
}) {
  const id = useId();
  const menuId = `dropdown-menu-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const position = useDropdownPosition({ isOpen, triggerRef, side, align });

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    // Return focus to trigger on close
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setFocusedIndex(-1);
        // Return focus to trigger on close
        triggerRef.current?.focus();
      }
      return !prev;
    });
  }, []);

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
      contentRef.current.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    );
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

  // Auto-focus first item when dropdown opens
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    // Use a microtask to wait for the portal to render items
    const timer = requestAnimationFrame(() => {
      focusItem(0);
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position, focusItem]);

  // Register with overlay context for click-outside detection
  useRegisterOverlay({
    id: `dropdown-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

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
      down: () => {
        const items = getMenuItems();
        if (items.length === 0) return true;
        const next = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
        focusItem(next);
        return true;
      },
      up: () => {
        const items = getMenuItems();
        if (items.length === 0) return true;
        const prev = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
        focusItem(prev);
        return true;
      },
      enter: () => {
        const items = getMenuItems();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          items[focusedIndex].click();
        }
        return true;
      },
      space: () => {
        const items = getMenuItems();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          items[focusedIndex].click();
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

  // Build trigger element
  let triggerElement: ReactElement;
  if (typeof trigger === 'function') {
    triggerElement = trigger({ triggerRef });
  } else if (isValidElement(trigger)) {
    triggerElement = cloneElement(
      trigger as ReactElement<Record<string, unknown>>,
      {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          // Preserve original ref if any
          const originalRef = (trigger as unknown as { ref?: unknown }).ref;
          setRef(
            originalRef as
              | ((node: HTMLElement | null) => void)
              | { current: HTMLElement | null }
              | null
              | undefined,
            node,
          );
        },
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
              'fixed z-50 min-w-48 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg',
              className,
            )}
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
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none',
        variant === 'danger' ? 'text-red-400' : 'text-neutral-300',
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
        <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      )}
    </button>
  );
}

export function DropdownDivider() {
  return <hr role="separator" className="my-1 border-t border-neutral-700" />;
}

export function DropdownInfo({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={onCopy ? -1 : undefined}
      onClick={onCopy}
      className={clsx(
        'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-sm',
        onCopy
          ? 'cursor-pointer transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none'
          : 'cursor-default',
      )}
    >
      <span className="text-neutral-500">{label}</span>
      <span className="truncate font-mono text-xs text-neutral-400">
        {value}
      </span>
    </div>
  );
}
