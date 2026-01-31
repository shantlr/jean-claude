import { useMemo } from 'react';

import type { DiffLine } from './diff-utils';

interface MinimapMarker {
  type: 'addition' | 'deletion';
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

export function DiffMinimap({
  lines,
  viewport,
}: {
  lines: DiffLine[];
  viewport?: ViewportInfo;
}) {
  const markers = useMemo(() => computeMarkers(lines), [lines]);

  // Calculate viewport indicator position and size
  const viewportIndicator = useMemo(() => {
    if (!viewport || viewport.scrollHeight <= viewport.clientHeight) {
      return null; // No scrolling needed, don't show indicator
    }

    const topPercent = (viewport.scrollTop / viewport.scrollHeight) * 100;
    const heightPercent = (viewport.clientHeight / viewport.scrollHeight) * 100;

    return { topPercent, heightPercent };
  }, [viewport]);

  if (markers.length === 0) {
    return null;
  }

  return (
    <div className="absolute h-full w-2.5  right-0 top-0 border-b-4">
      {/* Change markers */}
      {markers.map((marker, i) => (
        <div
          key={i}
          className={marker.type === 'addition' ? 'bg-green-500' : 'bg-red-500'}
          style={{
            position: 'absolute',
            top: `${marker.startPercent}%`,
            height: `${marker.heightPercent}%`,
            left: 0,
            right: 0,
            minHeight: '2px',
          }}
        />
      ))}

      {/* Viewport indicator */}
      {viewportIndicator && (
        <div
          className="pointer-events-none absolute left-0 right-0 border border-neutral-400/50 bg-neutral-400/20"
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
