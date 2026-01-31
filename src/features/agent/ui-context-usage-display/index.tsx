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

const LEVEL_BG_COLORS: Record<ContextLevel, string> = {
  low: 'bg-blue-500',
  medium: 'bg-green-500',
  high: 'bg-yellow-500',
  critical: 'bg-orange-500',
};

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
      {/* Progress bar */}
      <div className="relative h-1 w-12 overflow-hidden rounded-full bg-neutral-700">
        <div
          className={clsx(
            'absolute top-0 left-0 h-full rounded-full transition-all duration-300',
            LEVEL_BG_COLORS[level],
          )}
          style={{ width: `${contextUsage.percentage}%` }}
        />
      </div>
      {/* Percentage text */}
      <span className={clsx('text-xs font-medium', LEVEL_COLORS[level])}>
        {contextUsage.percentage.toFixed(0)}% (
        {formatNumber(contextUsage.contextTokens)})
      </span>
    </div>
  );
}
