import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

interface UseHorizontalResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidthFraction?: number; // Fraction of container width (e.g., 0.5 for 50%)
  maxWidth?: number; // Absolute max width (takes precedence over maxWidthFraction if smaller)
  direction?: 'left' | 'right'; // Which direction increases width ('right' = drag right to grow, 'left' = drag left to grow)
  onWidthChange: (width: number) => void;
}

export function useHorizontalResize({
  initialWidth,
  minWidth,
  maxWidthFraction = 0.5,
  maxWidth: maxWidthAbsolute,
  direction = 'right',
  onWidthChange,
}: UseHorizontalResizeOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = initialWidth;
      const directionMultiplier = direction === 'right' ? 1 : -1;

      const handleMouseMove = (moveEvent: MouseEvent | ReactMouseEvent) => {
        const delta = (moveEvent.clientX - startX) * directionMultiplier;
        const containerWidth =
          containerRef.current?.offsetWidth ?? window.innerWidth;
        const fractionMax = containerWidth * maxWidthFraction;
        const effectiveMax =
          maxWidthAbsolute !== undefined
            ? Math.min(fractionMax, maxWidthAbsolute)
            : fractionMax;
        const newWidth = Math.min(
          Math.max(startWidth + delta, minWidth),
          effectiveMax,
        );
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [initialWidth, minWidth, maxWidthFraction, maxWidthAbsolute, direction, onWidthChange],
  );

  return {
    containerRef,
    isDragging,
    handleMouseDown,
  };
}
