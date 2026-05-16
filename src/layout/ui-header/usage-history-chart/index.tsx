import clsx from 'clsx';
import { useMemo } from 'react';

import { Sparkline } from '@/common/ui/sparkline';
import { useUsageHistory } from '@/hooks/use-usage-history';
import type { UsageProviderType } from '@shared/usage-types';

const HISTORY_LOOKBACK_MS = 10 * 60 * 60 * 1000;
const OVER_PACE_COLOR = 'var(--color-status-fail)';

const LEVEL_COLORS: Record<string, string> = {
  excellent: 'var(--color-acc)',
  low: 'var(--color-status-done)',
  medium: 'var(--color-yellow-400, #facc15)',
  high: 'var(--color-status-run)',
  critical: 'var(--color-status-fail)',
};

function getColorForUtilization(utilization: number): string {
  if (utilization >= 90) return LEVEL_COLORS.critical;
  if (utilization >= 75) return LEVEL_COLORS.high;
  if (utilization >= 50) return LEVEL_COLORS.medium;
  if (utilization >= 25) return LEVEL_COLORS.low;
  return LEVEL_COLORS.excellent;
}

/** Current rate-limit window usage history as a sparkline. */
export function UsageHistoryChart({
  provider,
  limitKey,
  windowDurationMs,
}: {
  provider: UsageProviderType;
  limitKey: string;
  windowDurationMs: number;
}) {
  const nowMs = Date.now();
  const windowStartMs = nowMs - HISTORY_LOOKBACK_MS;

  const since = useMemo(() => {
    const d = new Date(windowStartMs);
    return d.toISOString();
  }, [windowStartMs]);

  const { data: history } = useUsageHistory({
    provider,
    limitKey,
    since,
  });

  const chartData = useMemo(() => {
    if (!history || history.length < 2) return null;
    return {
      timestamps: history.map((snapshot) =>
        new Date(snapshot.recordedAt).getTime(),
      ),
      usage: history.map((snapshot) => snapshot.utilization),
      linear: history.map((snapshot) =>
        getLinearUtilization(snapshot, windowDurationMs),
      ),
    };
  }, [history, windowDurationMs]);

  if (!chartData) {
    return (
      <div className="text-ink-3 py-1 text-[10px]">Not enough history yet</div>
    );
  }

  const latest = chartData.usage[chartData.usage.length - 1];
  const color = getColorForUtilization(latest);
  const minVal = Math.min(...chartData.usage);
  const maxVal = Math.max(...chartData.usage);

  return (
    <div className="space-y-1">
      <div className="text-ink-3 flex items-center justify-between text-[10px]">
        <span>{formatHistoryWindowLabel(HISTORY_LOOKBACK_MS)}</span>
        <span>
          {minVal.toFixed(0)}% – {maxVal.toFixed(0)}%
        </span>
      </div>
      <Sparkline
        data={chartData.usage}
        referenceData={chartData.linear}
        xData={chartData.timestamps}
        xDomain={[windowStartMs, nowMs]}
        width={200}
        height={36}
        color={color}
        max={100}
        fillOpacity={0.1}
        referenceColor={OVER_PACE_COLOR}
        positiveDeltaFillColor={OVER_PACE_COLOR}
        positiveDeltaFillOpacity={0.25}
        className={clsx('w-full')}
      />
      <div className="text-ink-3 flex items-center justify-between text-[10px]">
        <span>Solid: actual</span>
        <span>Dashed: linear pace</span>
      </div>
      <div className="text-ink-3 flex justify-between text-[10px]">
        <span>window start</span>
        <span>now</span>
      </div>
    </div>
  );
}

function formatHistoryWindowLabel(windowDurationMs: number): string {
  const totalHours = windowDurationMs / (60 * 60 * 1000);

  if (totalHours >= 24) {
    const totalDays = totalHours / 24;
    return Number.isInteger(totalDays)
      ? `${totalDays}d window`
      : `${totalDays.toFixed(1)}d window`;
  }

  return Number.isInteger(totalHours)
    ? `${totalHours}h window`
    : `${totalHours.toFixed(1)}h window`;
}

function getLinearUtilization(
  snapshot: { recordedAt: string; resetsAt: string },
  windowDurationMs: number,
): number {
  const resetTimeMs = new Date(snapshot.resetsAt).getTime();
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();
  const windowStartMs = resetTimeMs - windowDurationMs;
  const elapsedMs = recordedAtMs - windowStartMs;

  return Math.min(Math.max((elapsedMs / windowDurationMs) * 100, 0), 100);
}
