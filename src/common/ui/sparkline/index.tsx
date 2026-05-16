import clsx from 'clsx';
import { useMemo } from 'react';

/**
 * Lightweight SVG sparkline for inline usage charts.
 * No external dependencies — renders a polyline + optional area fill.
 */
export function Sparkline({
  data,
  width = 180,
  height = 40,
  strokeWidth = 1.5,
  className,
  color = 'currentColor',
  fillOpacity = 0.1,
  max: maxOverride,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  fillOpacity?: number;
  max?: number;
}) {
  const points = useMemo(() => {
    if (data.length === 0) return '';
    const max = maxOverride ?? Math.max(...data, 0.01);
    const padding = strokeWidth;
    const drawHeight = height - padding * 2;
    const drawWidth = width - padding * 2;
    const step = data.length > 1 ? drawWidth / (data.length - 1) : 0;

    return data
      .map((v, i) => {
        const x = padding + i * step;
        const y = padding + drawHeight - (v / max) * drawHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, width, height, strokeWidth, maxOverride]);

  const areaPath = useMemo(() => {
    if (data.length === 0) return '';
    const max = maxOverride ?? Math.max(...data, 0.01);
    const padding = strokeWidth;
    const drawHeight = height - padding * 2;
    const drawWidth = width - padding * 2;
    const step = data.length > 1 ? drawWidth / (data.length - 1) : 0;

    const linePoints = data.map((v, i) => {
      const x = padding + i * step;
      const y = padding + drawHeight - (v / max) * drawHeight;
      return `${x},${y}`;
    });

    const firstX = padding;
    const lastX = padding + (data.length - 1) * step;
    const bottomY = padding + drawHeight;

    return `M ${firstX},${bottomY} L ${linePoints.join(' L ')} L ${lastX},${bottomY} Z`;
  }, [data, width, height, strokeWidth, maxOverride]);

  if (data.length < 2) {
    return null;
  }

  return (
    <svg
      width={width}
      height={height}
      className={clsx('shrink-0', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      {fillOpacity > 0 && (
        <path d={areaPath} fill={color} opacity={fillOpacity} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
