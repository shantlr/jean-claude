import clsx from 'clsx';

import type { ContextUsage } from '@/hooks/use-context-usage';
import { formatNumber } from '@/lib/number';

type ContextLevel = 'low' | 'medium' | 'high' | 'critical';

function getContextLevel(percentage: number): ContextLevel {
  if (percentage >= 85) return 'critical';
  if (percentage >= 70) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
}

const LEVEL_COLORS: Record<ContextLevel, string> = {
  low: 'text-blue-400',
  medium: 'text-green-400',
  high: 'text-yellow-400',
  critical: 'text-orange-400',
};

const LEVEL_STROKE_COLORS: Record<ContextLevel, string> = {
  low: 'stroke-blue-500',
  medium: 'stroke-green-500',
  high: 'stroke-yellow-500',
  critical: 'stroke-orange-500',
};

function PieLoader({
  percentage,
  level,
  size = 16,
}: {
  percentage: number;
  level: ContextLevel;
  size?: number;
}) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-700"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className={clsx(
          'transition-all duration-300',
          LEVEL_STROKE_COLORS[level],
        )}
      />
    </svg>
  );
}

export function ContextUsageDisplay({
  contextUsage,
}: {
  contextUsage: ContextUsage;
}) {
  if (!contextUsage.hasData) {
    return null;
  }

  const level = getContextLevel(contextUsage.percentage);
  const tooltipText = `Context: ${formatNumber(contextUsage.contextTokens)} / ${formatNumber(contextUsage.contextWindow)} tokens`;

  return (
    <div className="flex items-center gap-1.5" title={tooltipText}>
      {/* Pie loader */}
      <PieLoader percentage={contextUsage.percentage} level={level} />
      {/* Percentage text */}
      <span className={clsx('text-xs font-medium', LEVEL_COLORS[level])}>
        {contextUsage.percentage.toFixed(0)}% (
        {formatNumber(contextUsage.contextTokens)})
      </span>
    </div>
  );
}
