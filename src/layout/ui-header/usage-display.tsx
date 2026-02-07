import clsx from 'clsx';
import { Clock, AlertCircle, Loader2 } from 'lucide-react';

import { useClaudeUsage } from '@/hooks/use-usage';

import type { UsageLevel } from '../../../shared/usage-types';

/**
 * Calculates the usage ratio (actual usage / expected usage based on elapsed time).
 *
 * @param utilization - Current usage percentage (0-100)
 * @param resetsAt - When the usage window resets
 * @param windowDurationMs - Total duration of the usage window in milliseconds
 */
function getUsageRatio({
  utilization,
  resetsAt,
  windowDurationMs,
}: {
  utilization: number;
  resetsAt: Date;
  windowDurationMs: number;
}): number {
  const now = new Date();
  const timeRemainingMs = Math.max(0, resetsAt.getTime() - now.getTime());
  const timeElapsedMs = windowDurationMs - timeRemainingMs;
  const timeElapsedRatio = Math.min(
    Math.max(timeElapsedMs / windowDurationMs, 0),
    1,
  );

  // Compare actual usage percent to linear expected usage percent.
  // Both are converted to [0,1] so 1.0 means exactly on pace.
  const actualUsageRatio = utilization / 100;

  if (timeElapsedRatio === 0) {
    return actualUsageRatio === 0 ? 1 : Number.POSITIVE_INFINITY;
  }

  return actualUsageRatio / timeElapsedRatio;
}

/**
 * Determines usage level based on the ratio of utilization to elapsed time.
 * If usage is ahead of pace (using more than expected for elapsed time), it shows warning colors.
 */
function getUsageLevel(usageRatio: number): UsageLevel {
  if (!Number.isFinite(usageRatio)) return 'critical';

  // If ratio > 1, we're ahead of pace (using more than expected)
  if (usageRatio >= 1.5) return 'critical'; // 50%+ ahead of pace
  if (usageRatio >= 1.3) return 'high'; // 30%+ ahead of pace
  if (usageRatio >= 1.0) return 'medium'; // At or slightly ahead of pace
  if (usageRatio >= 0.8) return 'low'; // Slightly below pace
  return 'excellent'; // Well below pace
}

const LEVEL_COLORS: Record<UsageLevel, string> = {
  excellent: 'text-blue-400',
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

const LEVEL_BG_COLORS: Record<UsageLevel, string> = {
  excellent: 'bg-blue-500',
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

/**
 * Fun fire effect shown when rate limit usage is critical (ratio >= 1.5).
 * More fire emojis and faster animation as the ratio gets worse.
 */
function FireIndicator({ ratio }: { ratio: number }) {
  // Scale the intensity: 1.5 = mild, 2.0 = moderate, 2.5+ = inferno
  const flames = ratio >= 2.5 ? '🔥🔥🔥' : ratio >= 2.0 ? '🔥🔥' : '🔥';
  const label =
    ratio >= 2.5
      ? 'This is fine 🙃'
      : ratio >= 2.0
        ? 'Getting toasty...'
        : 'Running hot!';
  // Faster flicker at higher ratios
  const duration = ratio >= 2.5 ? '0.3s' : ratio >= 2.0 ? '0.5s' : '0.8s';

  return (
    <span
      className="inline-flex cursor-default items-center select-none"
      title={label}
      style={{
        animation: `fire-flicker ${duration} ease-in-out infinite`,
        transformOrigin: 'bottom center',
      }}
    >
      <span className="text-xs">{flames}</span>
    </span>
  );
}

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

  const usageRatio = getUsageRatio({
    utilization: fiveHour.utilization,
    resetsAt: fiveHour.resetsAt,
    windowDurationMs: fiveHour.windowDurationMs,
  });
  const level = getUsageLevel(usageRatio);
  const percentage = Math.min(fiveHour.utilization, 100);
  // Format ratio to max 2 digits (e.g., 1.2, 0.8)
  const formattedRatio = Number.isFinite(usageRatio)
    ? usageRatio.toFixed(1)
    : '∞';
  const isCritical = level === 'critical';

  return (
    <div className="flex items-center gap-3">
      {/* Progress bar visualization */}
      <div className="flex items-center gap-2">
        <div
          className={clsx(
            'relative h-1.5 w-20 overflow-hidden rounded-full bg-neutral-700',
            isCritical && 'fire-bar',
          )}
        >
          <div
            className={clsx(
              'absolute top-0 left-0 h-full rounded-full transition-all duration-300',
              LEVEL_BG_COLORS[level],
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={clsx('text-xs font-medium', LEVEL_COLORS[level])}>
          {fiveHour.utilization.toFixed(0)}% ({formattedRatio})
        </span>
        {/* Fire indicators at critical usage */}
        {isCritical && <FireIndicator ratio={usageRatio} />}
      </div>

      {/* Reset time */}
      <div className="flex items-center gap-1 text-neutral-400">
        <Clock className="h-3 w-3" />
        <span className="text-xs">{fiveHour.timeUntilReset}</span>
      </div>
    </div>
  );
}
