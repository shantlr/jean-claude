import clsx from 'clsx';
import { Clock, AlertCircle, Loader2 } from 'lucide-react';

import { useClaudeUsage } from '@/hooks/use-usage';

import type { UsageLevel } from '../../../shared/usage-types';

function getUsageLevel(utilization: number): UsageLevel {
  if (utilization >= 90) return 'critical';
  if (utilization >= 70) return 'high';
  if (utilization >= 50) return 'medium';
  return 'low';
}

const LEVEL_COLORS: Record<UsageLevel, string> = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

const LEVEL_BG_COLORS: Record<UsageLevel, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

export function UsageDisplay() {
  const { data: result, isLoading, isError } = useClaudeUsage();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  // Error state or no token
  if (isError || !result?.data) {
    const errorType = result?.error?.type;

    // If no token, show nothing (user may not have Claude Code)
    if (errorType === 'no_token') {
      return null;
    }

    return (
      <div
        className="flex items-center gap-1.5 text-neutral-500"
        title={result?.error?.message}
      >
        <AlertCircle className="h-3 w-3" />
        <span className="text-xs">Usage unavailable</span>
      </div>
    );
  }

  const { fiveHour } = result.data;

  // No five hour data available
  if (!fiveHour) {
    return null;
  }

  const level = getUsageLevel(fiveHour.utilization);
  const percentage = Math.min(fiveHour.utilization, 100);

  return (
    <div className="flex items-center gap-3">
      {/* Progress bar visualization */}
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-neutral-700">
          <div
            className={clsx(
              'absolute left-0 top-0 h-full rounded-full transition-all duration-300',
              LEVEL_BG_COLORS[level]
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={clsx('text-xs font-medium', LEVEL_COLORS[level])}>
          {fiveHour.utilization.toFixed(0)}%
        </span>
      </div>

      {/* Reset time */}
      <div className="flex items-center gap-1 text-neutral-400">
        <Clock className="h-3 w-3" />
        <span className="text-xs">{fiveHour.timeUntilReset}</span>
      </div>
    </div>
  );
}
