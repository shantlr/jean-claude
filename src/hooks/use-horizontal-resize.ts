import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

interface UseHorizontalResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidthFraction?: number; // Fraction of container width (e.g., 0.5 for 50%)
  onWidthChange: (width: number) => void;
}

export function useHorizontalResize({
  initialWidth,
  minWidth,
  maxWidthFraction = 0.5,
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

      const handleMouseMove = (moveEvent: MouseEvent | ReactMouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const containerWidth =
          containerRef.current?.offsetWidth ?? window.innerWidth;
        const maxWidth = containerWidth * maxWidthFraction;
        const newWidth = Math.min(
          Math.max(startWidth + delta, minWidth),
          maxWidth,
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
    [initialWidth, minWidth, maxWidthFraction, onWidthChange],
  );

  return {
    containerRef,
    isDragging,
    handleMouseDown,
  };
}
