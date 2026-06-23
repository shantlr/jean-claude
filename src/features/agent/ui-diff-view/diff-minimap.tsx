import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { DiffLine } from './diff-utils';

interface MinimapMarker {
  type: 'addition' | 'deletion';
  startPercent: number;
  heightPercent: number;
}

interface CommentMarker {
  startPercent: number;
  heightPercent: number;
}

export interface ViewportInfo {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Compute markers by merging consecutive same-type lines into single markers.
 */
function computeMarkers(lines: DiffLine[]): MinimapMarker[] {
  if (lines.length === 0) return [];

  const markers: MinimapMarker[] = [];
  const totalLines = lines.length;

  let i = 0;
  while (i < totalLines) {
    const line = lines[i];

    if (line.type === 'addition' || line.type === 'deletion') {
      const type = line.type;
      const startIndex = i;

      // Count consecutive lines of the same type
      while (i < totalLines && lines[i].type === type) {
        i++;
      }

      const lineCount = i - startIndex;
      const startPercent = (startIndex / totalLines) * 100;
      // Minimum height of 0.5% to ensure visibility, otherwise proportional
      const heightPercent = Math.max(0.5, (lineCount / totalLines) * 100);

      markers.push({ type, startPercent, heightPercent });
    } else {
      i++;
    }
  }

  return markers;
}

/**
 * Compute comment markers by finding lines with comments and merging consecutive ones.
 */
function computeCommentMarkers(
  lines: DiffLine[],
  commentedLines: Set<number>,
): CommentMarker[] {
  if (lines.length === 0 || commentedLines.size === 0) return [];

  const markers: CommentMarker[] = [];
  const totalLines = lines.length;

  let i = 0;
  while (i < totalLines) {
    const lineNum = lines[i].newLineNumber;
    if (lineNum !== undefined && commentedLines.has(lineNum)) {
      const startIndex = i;

      // Merge consecutive commented lines
      while (i < totalLines) {
        const num = lines[i].newLineNumber;
        if (num !== undefined && commentedLines.has(num)) {
          i++;
        } else {
          break;
        }
      }

      const lineCount = i - startIndex;
      const startPercent = (startIndex / totalLines) * 100;
      const heightPercent = Math.max(0.5, (lineCount / totalLines) * 100);

      markers.push({ startPercent, heightPercent });
    } else {
      i++;
    }
  }

  return markers;
}

export function DiffMinimap({
  lines,
  viewport,
  commentedLines,
}: {
  lines: DiffLine[];
  viewport?: ViewportInfo;
  commentedLines?: Set<number>;
}) {
  const markers = useMemo(() => computeMarkers(lines), [lines]);
  const commentMarkers = useMemo(
    () => (commentedLines ? computeCommentMarkers(lines, commentedLines) : []),
    [lines, commentedLines],
  );

  // Calculate viewport indicator position and size
  const viewportIndicator = useMemo(() => {
    if (!viewport || viewport.scrollHeight <= viewport.clientHeight) {
      return null; // No scrolling needed, don't show indicator
    }

    const topPercent = (viewport.scrollTop / viewport.scrollHeight) * 100;
    const heightPercent = (viewport.clientHeight / viewport.scrollHeight) * 100;

    return { topPercent, heightPercent };
  }, [viewport]);

  if (markers.length === 0 && commentMarkers.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-0 right-0 h-full w-2.5 border-b-4">
      {/* Comment markers (left side) */}
      {commentMarkers.map((marker, i) => (
        <div
          key={`comment-${i}`}
          style={{
            position: 'absolute',
            top: `${marker.startPercent}%`,
            height: `${marker.heightPercent}%`,
            left: 0,
            width: '3px',
            minHeight: '2px',
            background: 'oklch(0.78 0.18 295)',
          }}
        />
      ))}

      {/* Change markers (right side) */}
      {markers.map((marker, i) => (
        <div
          key={i}
          className={marker.type === 'addition' ? 'bg-green-800' : 'bg-red-800'}
          style={{
            position: 'absolute',
            top: `${marker.startPercent}%`,
            height: `${marker.heightPercent}%`,
            left: commentMarkers.length > 0 ? '4px' : 0,
            right: 0,
            minHeight: '2px',
          }}
        />
      ))}

      {/* Viewport indicator */}
      {viewportIndicator && (
        <div
          className="border-ink-1/80 bg-ink-2/20 pointer-events-none absolute right-0 left-0 rounded border"
          style={{
            top: `${viewportIndicator.topPercent}%`,
            height: `${viewportIndicator.heightPercent}%`,
            minHeight: '8px',
          }}
        />
      )}
    </div>
  );
}

export const DiffMinimapOverlay = memo(function DiffMinimapOverlay({
  lines,
  scrollContainerRef,
  commentedLines,
}: {
  lines: DiffLine[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  commentedLines?: Set<number>;
}) {
  const [viewport, setViewport] = useState<ViewportInfo | undefined>();
  const rafRef = useRef<number | null>(null);

  const updateViewport = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setViewport({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateViewport();

    const handleScroll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        updateViewport();
        rafRef.current = null;
      });
    };

    const observer = new ResizeObserver(updateViewport);
    container.addEventListener('scroll', handleScroll, { passive: true });
    observer.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [scrollContainerRef, updateViewport]);

  return (
    <DiffMinimap
      lines={lines}
      viewport={viewport}
      commentedLines={commentedLines}
    />
  );
});
