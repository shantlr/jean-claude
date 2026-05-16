import clsx from 'clsx';
import { useMemo } from 'react';

/**
 * Lightweight SVG sparkline for inline usage charts.
 * No external dependencies — renders a polyline + optional area fill.
 */
export function Sparkline({
  data,
  referenceData,
  xData,
  xDomain,
  width = 180,
  height = 40,
  strokeWidth = 1.5,
  className,
  color = 'currentColor',
  fillOpacity = 0.1,
  referenceColor = 'var(--color-ink-3)',
  positiveDeltaFillColor,
  positiveDeltaFillOpacity = 0.2,
  max: maxOverride,
}: {
  data: number[];
  referenceData?: number[];
  xData?: number[];
  xDomain?: readonly [number, number];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  fillOpacity?: number;
  referenceColor?: string;
  positiveDeltaFillColor?: string;
  positiveDeltaFillOpacity?: number;
  max?: number;
}) {
  const { points, referencePoints, areaPath, positiveDeltaPaths } =
    useMemo(() => {
      if (data.length === 0) {
        return {
          points: '',
          referencePoints: '',
          areaPath: '',
          positiveDeltaPaths: [] as string[],
        };
      }

      const max =
        maxOverride ?? Math.max(...data, ...(referenceData ?? []), 0.01);
      const padding = strokeWidth;
      const drawHeight = height - padding * 2;
      const drawWidth = width - padding * 2;
      const defaultXData = data.map((_, index) => index);
      const chartXData = xData?.length === data.length ? xData : defaultXData;
      const minX = xDomain?.[0] ?? Math.min(...chartXData);
      const maxX = xDomain?.[1] ?? Math.max(...chartXData);
      const xRange = Math.max(maxX - minX, 1);

      const toCoordinates = (v: number, i: number) => {
        const x = padding + ((chartXData[i] - minX) / xRange) * drawWidth;
        const y = padding + drawHeight - (v / max) * drawHeight;
        return { x, y };
      };

      const lineCoordinates = data.map(toCoordinates);
      const linePoints = lineCoordinates.map(({ x, y }) => `${x},${y}`);
      const referenceCoordinates =
        referenceData && referenceData.length === data.length
          ? referenceData.map(toCoordinates)
          : null;
      const computedReferencePoints = referenceCoordinates
        ? referenceCoordinates.map(({ x, y }) => `${x},${y}`).join(' ')
        : '';

      const firstX = padding + ((chartXData[0] - minX) / xRange) * drawWidth;
      const lastX =
        padding +
        ((chartXData[chartXData.length - 1] - minX) / xRange) * drawWidth;
      const bottomY = padding + drawHeight;

      const positiveDeltaSegments: string[] = [];

      if (referenceCoordinates) {
        let currentSegment: {
          x: number;
          usageY: number;
          referenceY: number;
        }[] = [];

        const flushSegment = () => {
          if (currentSegment.length < 2) {
            currentSegment = [];
            return;
          }

          const upperPath = currentSegment
            .map(({ x, usageY }) => `${x},${usageY}`)
            .join(' L ');
          const lowerPath = [...currentSegment]
            .reverse()
            .map(({ x, referenceY }) => `${x},${referenceY}`)
            .join(' L ');

          positiveDeltaSegments.push(`M ${upperPath} L ${lowerPath} Z`);
          currentSegment = [];
        };

        for (let index = 0; index < data.length - 1; index += 1) {
          const currentUsageValue = data[index]!;
          const nextUsageValue = data[index + 1]!;
          const currentReferenceValue = referenceData![index]!;
          const nextReferenceValue = referenceData![index + 1]!;
          const currentDiff = currentUsageValue - currentReferenceValue;
          const nextDiff = nextUsageValue - nextReferenceValue;
          const currentUsage = lineCoordinates[index]!;
          const nextUsage = lineCoordinates[index + 1]!;
          const currentReference = referenceCoordinates[index]!;
          const nextReference = referenceCoordinates[index + 1]!;

          if (currentDiff > 0 && currentSegment.length === 0) {
            currentSegment.push({
              x: currentUsage.x,
              usageY: currentUsage.y,
              referenceY: currentReference.y,
            });
          }

          if (currentDiff === 0 && nextDiff > 0) {
            currentSegment.push({
              x: currentUsage.x,
              usageY: currentUsage.y,
              referenceY: currentReference.y,
            });
          }

          if (
            (currentDiff > 0 && nextDiff < 0) ||
            (currentDiff < 0 && nextDiff > 0)
          ) {
            const ratio = currentDiff / (currentDiff - nextDiff);
            const crossX =
              currentUsage.x + (nextUsage.x - currentUsage.x) * ratio;
            const crossY =
              currentUsage.y + (nextUsage.y - currentUsage.y) * ratio;

            currentSegment.push({
              x: crossX,
              usageY: crossY,
              referenceY: crossY,
            });

            if (currentDiff > 0) {
              flushSegment();
            } else {
              currentSegment = [
                {
                  x: crossX,
                  usageY: crossY,
                  referenceY: crossY,
                },
              ];
            }
          }

          if (nextDiff > 0) {
            currentSegment.push({
              x: nextUsage.x,
              usageY: nextUsage.y,
              referenceY: nextReference.y,
            });
          }

          if (nextDiff <= 0) {
            flushSegment();
          }
        }
      }

      return {
        points: linePoints.join(' '),
        referencePoints: computedReferencePoints,
        areaPath: `M ${firstX},${bottomY} L ${linePoints.join(' L ')} L ${lastX},${bottomY} Z`,
        positiveDeltaPaths: positiveDeltaSegments,
      };
    }, [
      data,
      referenceData,
      xData,
      xDomain,
      width,
      height,
      strokeWidth,
      maxOverride,
    ]);

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
      {positiveDeltaFillColor &&
        positiveDeltaPaths.map((path) => (
          <path
            key={path}
            d={path}
            fill={positiveDeltaFillColor}
            opacity={positiveDeltaFillOpacity}
          />
        ))}
      {referencePoints && (
        <polyline
          points={referencePoints}
          fill="none"
          stroke={referenceColor}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 3"
          opacity={0.7}
        />
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
