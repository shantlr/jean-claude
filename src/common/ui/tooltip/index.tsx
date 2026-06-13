import clsx from 'clsx';
import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';

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

/**
 * Portal-based tooltip that renders on hover.
 * Positions itself relative to the trigger using the same positioning logic as Dropdown/Select.
 *
 * Usage:
 *   <Tooltip content={<div>Rich content</div>}>
 *     <button>Hover me</button>
 *   </Tooltip>
 */
export function Tooltip({
  children,
  content,
  side = 'bottom',
  align = 'left',
  className,
  delay = 200,
  minWidth,
}: {
  children: ReactElement;
  content: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'left' | 'right';
  className?: string;
  delay?: number;
  minWidth?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [contentWidth, setContentWidth] = useState<number | undefined>(
    minWidth,
  );
  const triggerRef = useRef<HTMLElement | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const position = useDropdownPosition({
    isOpen,
    triggerRef,
    side,
    align,
    autoAlign: true,
    minHorizontalSpace: contentWidth ?? minWidth,
  });

  const updateContentWidth = useCallback((element: HTMLDivElement) => {
    setContentWidth(Math.ceil(element.getBoundingClientRect().width));
  }, []);

  const handleContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      setContentElement(node);
      if (node) updateContentWidth(node);
    },
    [updateContentWidth],
  );

  useEffect(() => {
    if (!isOpen) {
      setContentElement(null);
      setContentWidth(minWidth);
      return;
    }
    if (!contentElement) return;

    updateContentWidth(contentElement);

    const observer = new ResizeObserver(() => {
      updateContentWidth(contentElement);
    });
    observer.observe(contentElement);

    return () => observer.disconnect();
  }, [contentElement, isOpen, minWidth, updateContentWidth]);

  // Clean up pending delay timeout on unmount
  useEffect(() => {
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = setTimeout(() => setIsOpen(true), delay);
  };

  const handleMouseLeave = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = null;
    setIsOpen(false);
  };

  if (!isValidElement(children)) {
    throw new Error('Tooltip children must be a single ReactElement');
  }

  const triggerElement = cloneElement(
    children as ReactElement<Record<string, unknown>>,
    {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        const originalRef = (children as unknown as { ref?: unknown }).ref;
        setRef(
          originalRef as
            | ((node: HTMLElement | null) => void)
            | { current: HTMLElement | null }
            | null
            | undefined,
          node,
        );
      },
      onMouseEnter: (e: React.MouseEvent) => {
        const originalProps = children.props as Record<string, unknown>;
        if (typeof originalProps.onMouseEnter === 'function') {
          (originalProps.onMouseEnter as (e: React.MouseEvent) => void)(e);
        }
        handleMouseEnter();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        const originalProps = children.props as Record<string, unknown>;
        if (typeof originalProps.onMouseLeave === 'function') {
          (originalProps.onMouseLeave as (e: React.MouseEvent) => void)(e);
        }
        handleMouseLeave();
      },
      onFocus: (e: React.FocusEvent) => {
        const originalProps = children.props as Record<string, unknown>;
        if (typeof originalProps.onFocus === 'function') {
          (originalProps.onFocus as (e: React.FocusEvent) => void)(e);
        }
        handleMouseEnter();
      },
      onBlur: (e: React.FocusEvent) => {
        const originalProps = children.props as Record<string, unknown>;
        if (typeof originalProps.onBlur === 'function') {
          (originalProps.onBlur as (e: React.FocusEvent) => void)(e);
        }
        handleMouseLeave();
      },
    },
  );

  return (
    <>
      {triggerElement}
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={handleContentRef}
            role="tooltip"
            className={clsx(
              'border-glass-border bg-bg-1 text-ink-1 pointer-events-none fixed z-[10020] rounded-md border px-3 py-2 text-xs shadow-lg',
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
              minWidth,
              maxWidth: position.maxWidth,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
