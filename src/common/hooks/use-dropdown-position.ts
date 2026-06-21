import { type RefObject, useEffect, useState } from 'react';

const PREFERRED_MAX_HEIGHT = 320;
const GAP = 4;
const VIEWPORT_PADDING = 8;
/** Minimum horizontal space required before auto-flipping alignment */
const MIN_HORIZONTAL_SPACE = 200;

export interface DropdownPosition {
  top: number;
  left: number;
  actualSide: 'top' | 'bottom';
  actualAlign: 'left' | 'right';
  maxHeight: number;
  maxWidth: number;
}

/**
 * Shared positioning hook for portal-based dropdowns.
 * Calculates position relative to a trigger element, auto-flips top/bottom,
 * and computes maxHeight based on available viewport space.
 *
 * When `autoAlign` is true, horizontally flips the alignment when there isn't
 * enough space on the preferred side.
 */
export function useDropdownPosition({
  isOpen,
  triggerElement,
  triggerRef,
  side = 'bottom',
  align = 'left',
  autoAlign = true,
  minHorizontalSpace = MIN_HORIZONTAL_SPACE,
  preferredMaxHeight = PREFERRED_MAX_HEIGHT,
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  triggerElement?: HTMLElement | null;
  side?: 'top' | 'bottom';
  align?: 'left' | 'right';
  /** When true, automatically flip horizontal alignment when space is limited */
  autoAlign?: boolean;
  /** Minimum horizontal space required before auto-flipping alignment */
  minHorizontalSpace?: number;
  preferredMaxHeight?: number;
}): DropdownPosition | null {
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  useEffect(() => {
    const trigger = triggerElement ?? triggerRef.current;
    if (!isOpen || !trigger) return;

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const actualSide =
        side === 'bottom'
          ? spaceBelow >= preferredMaxHeight || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top'
          : spaceAbove >= preferredMaxHeight || spaceAbove >= spaceBelow
            ? 'top'
            : 'bottom';

      const availableSpace = actualSide === 'bottom' ? spaceBelow : spaceAbove;
      const maxHeight = Math.min(
        preferredMaxHeight,
        availableSpace - GAP - VIEWPORT_PADDING,
      );

      const top = actualSide === 'bottom' ? rect.bottom + GAP : rect.top - GAP;

      // Determine horizontal alignment
      let actualAlign = align;
      if (autoAlign) {
        const spaceRight = window.innerWidth - rect.left - VIEWPORT_PADDING;
        const spaceLeft = rect.right - VIEWPORT_PADDING;

        if (align === 'left' && spaceRight < minHorizontalSpace) {
          actualAlign = 'right';
        } else if (align === 'right' && spaceLeft < minHorizontalSpace) {
          actualAlign = 'left';
        }
      }

      const left = actualAlign === 'right' ? rect.right : rect.left;
      const maxWidth =
        actualAlign === 'right'
          ? Math.max(0, rect.right - VIEWPORT_PADDING)
          : Math.max(0, window.innerWidth - rect.left - VIEWPORT_PADDING);

      setPosition({ top, left, actualSide, actualAlign, maxHeight, maxWidth });
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
  }, [
    isOpen,
    side,
    align,
    autoAlign,
    minHorizontalSpace,
    preferredMaxHeight,
    triggerElement,
    triggerRef,
  ]);

  return position;
}
