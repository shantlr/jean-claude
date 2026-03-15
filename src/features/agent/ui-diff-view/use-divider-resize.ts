import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

/** Fixed-width columns: 2 × line-number (32px each) + divider (4px) */
const FIXED_WIDTH_PX = 32 + 32 + 4;
const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;

export function useDividerResize() {
  const [leftFraction, setLeftFraction] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleDividerMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!tableRef.current) return;
      const tableRect = tableRef.current.getBoundingClientRect();
      // Subtract fixed columns so fraction maps only to the content area
      const contentWidth = tableRect.width - FIXED_WIDTH_PX;
      if (contentWidth <= 0) return;
      const contentX = moveEvent.clientX - tableRect.left - 32; // offset past left line-number col
      const fraction = Math.min(
        MAX_FRACTION,
        Math.max(MIN_FRACTION, contentX / contentWidth),
      );
      setLeftFraction(fraction);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return { tableRef, leftFraction, isDragging, handleDividerMouseDown };
}
