import clsx from 'clsx';
import { useMemo } from 'react';

import { Sparkline } from '@/common/ui/sparkline';
import { useUsageHistory } from '@/hooks/use-usage-history';
import type { UsageProviderType } from '@shared/usage-types';

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

/** Last N hours of usage history as a sparkline. */
export function UsageHistoryChart({
  provider,
  limitKey,
  hours = 6,
}: {
  provider: UsageProviderType;
  limitKey: string;
  hours?: number;
}) {
  const since = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - hours);
    return d.toISOString();
  }, [hours]);

  const { data: history } = useUsageHistory({
    provider,
    limitKey,
    since,
  });

  const chartData = useMemo(() => {
    if (!history || history.length < 2) return null;
    return history.map((s) => s.utilization);
  }, [history]);

  if (!chartData) {
    return (
      <div className="text-ink-3 py-1 text-[10px]">Not enough history yet</div>
    );
  }

  const latest = chartData[chartData.length - 1];
  const color = getColorForUtilization(latest);
  const minVal = Math.min(...chartData);
  const maxVal = Math.max(...chartData);

  return (
    <div className="space-y-1">
      <div className="text-ink-3 flex items-center justify-between text-[10px]">
        <span>{hours}h history</span>
        <span>
          {minVal.toFixed(0)}% – {maxVal.toFixed(0)}%
        </span>
      </div>
      <Sparkline
        data={chartData}
        width={200}
        height={36}
        color={color}
        max={100}
        fillOpacity={0.15}
        className={clsx('w-full')}
      />
      <div className="text-ink-3 flex justify-between text-[10px]">
        <span>{formatTimeLabel(hours)}</span>
        <span>now</span>
      </div>
    </div>
  );
}

function formatTimeLabel(hours: number): string {
  return `${hours}h ago`;
}
