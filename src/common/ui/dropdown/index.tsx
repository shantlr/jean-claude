import clsx from 'clsx';
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
import { useRegisterOverlay } from '@/common/context/overlay';

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
}: {
  trigger:
    | ReactElement
    | ((props: { triggerRef: RefObject<HTMLElement | null> }) => ReactElement);
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    actualSide: 'top' | 'bottom';
  } | null>(null);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Register with overlay context for click-outside detection
  useRegisterOverlay({
    id: `dropdown-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
  });

  // Register escape to close
  useRegisterKeyboardBindings(
    `dropdown-${id}`,
    isOpen
      ? {
          escape: () => {
            close();
            return true;
          },
        }
      : {},
  );

  // Calculate position when opening
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const dropdownMaxHeight = 320;
      const gap = 4;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const actualSide =
        side === 'bottom'
          ? spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top'
          : spaceAbove >= dropdownMaxHeight || spaceAbove >= spaceBelow
            ? 'top'
            : 'bottom';

      const top = actualSide === 'bottom' ? rect.bottom + gap : rect.top - gap;

      const left = align === 'right' ? rect.right : rect.left;

      setPosition({ top, left, actualSide });
    };

    updatePosition();

    window.addEventListener('scroll', updatePosition, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, side, align]);

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
            className={clsx(
              'fixed z-50 min-w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg',
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
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700',
        variant === 'danger' ? 'text-red-400' : 'text-neutral-300',
      )}
    >
      {icon && (
        <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
