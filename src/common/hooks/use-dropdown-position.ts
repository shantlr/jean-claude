import { useEffect, useState, type RefObject } from 'react';

const PREFERRED_MAX_HEIGHT = 320;
const GAP = 4;
const VIEWPORT_PADDING = 8;

export interface DropdownPosition {
  top: number;
  left: number;
  actualSide: 'top' | 'bottom';
  maxHeight: number;
}

/**
 * Shared positioning hook for portal-based dropdowns.
 * Calculates position relative to a trigger element, auto-flips top/bottom,
 * and computes maxHeight based on available viewport space.
 */
export function useDropdownPosition({
  isOpen,
  triggerRef,
  side = 'bottom',
  align = 'left',
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  side?: 'top' | 'bottom';
  align?: 'left' | 'right';
}): DropdownPosition | null {
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const actualSide =
        side === 'bottom'
          ? spaceBelow >= PREFERRED_MAX_HEIGHT || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top'
          : spaceAbove >= PREFERRED_MAX_HEIGHT || spaceAbove >= spaceBelow
            ? 'top'
            : 'bottom';

      const availableSpace = actualSide === 'bottom' ? spaceBelow : spaceAbove;
      const maxHeight = Math.min(
        PREFERRED_MAX_HEIGHT,
        availableSpace - GAP - VIEWPORT_PADDING,
      );

      const top = actualSide === 'bottom' ? rect.bottom + GAP : rect.top - GAP;
      const left = align === 'right' ? rect.right : rect.left;

      setPosition({ top, left, actualSide, maxHeight });
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
  }, [isOpen, side, align, triggerRef]);

  return position;
}
