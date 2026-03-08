import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { IconClaude, IconCodex } from '@/common/ui/icons';
import { Tooltip } from '@/common/ui/tooltip';
import { useBackendUsage } from '@/hooks/use-usage';
import type {
  UsageDisplayData,
  UsageLevel,
  UsageProviderType,
  UsageRange,
  UsageResult,
} from '@shared/usage-types';
import { USAGE_PROVIDERS } from '@shared/usage-types';

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

  const actualUsageRatio = utilization / 100;

  if (timeElapsedRatio === 0) {
    return actualUsageRatio === 0 ? 1 : Number.POSITIVE_INFINITY;
  }

  return actualUsageRatio / timeElapsedRatio;
}

function getUsageLevel(usageRatio: number): UsageLevel {
  if (!Number.isFinite(usageRatio)) return 'critical';
  if (usageRatio >= 1.5) return 'critical';
  if (usageRatio >= 1.3) return 'high';
  if (usageRatio >= 1.0) return 'medium';
  if (usageRatio >= 0.8) return 'low';
  return 'excellent';
}

/** Returns true if any limit has raw utilization >= threshold. */
function hasAnyRangeOver(data: UsageDisplayData, threshold: number): boolean {
  return data.limits.some((l) => l.range.utilization >= threshold);
}

/** Returns true if any non-primary limit has raw utilization >= threshold. */
function hasSecondaryRangeOver(
  data: UsageDisplayData,
  threshold: number,
): boolean {
  return data.limits.some(
    (l) => !l.isPrimary && l.range.utilization >= threshold,
  );
}

const LEVEL_DOT_COLORS: Record<UsageLevel, string> = {
  excellent: 'bg-blue-400',
  low: 'bg-green-400',
  medium: 'bg-yellow-400',
  high: 'bg-orange-400',
  critical: 'bg-red-400',
};

const LEVEL_TEXT_COLORS: Record<UsageLevel, string> = {
  excellent: 'text-blue-400',
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

const PROVIDER_ICONS: Partial<
  Record<UsageProviderType, ComponentType<SVGProps<SVGSVGElement>>>
> = {
  'claude-code': IconClaude,
  codex: IconCodex,
};

function getProviderMeta(providerType: UsageProviderType) {
  return (
    USAGE_PROVIDERS.find((p) => p.value === providerType) ?? {
      label: providerType,
      shortLabel: providerType,
    }
  );
}

function formatFetchedAt(fetchedAtMs: number): string {
  const diffMs = Date.now() - fetchedAtMs;
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes <= 0) return 'just now';
  if (diffMinutes === 1) return '1 min ago';
  return `${diffMinutes} min ago`;
}

function TooltipRangeRow({
  label,
  range,
}: {
  label: string;
  range: UsageRange;
}) {
  const ratio = getUsageRatio({
    utilization: range.utilization,
    resetsAt: range.resetsAt,
    windowDurationMs: range.windowDurationMs,
  });
  const level = getUsageLevel(ratio);
  const ratioColor = LEVEL_TEXT_COLORS[level];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-neutral-400">{label}</span>
        <span className={clsx('font-medium', ratioColor)}>
          {range.utilization.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-neutral-500">
        <span>
          Ratio:{' '}
          <span className={ratioColor}>
            {Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'}
          </span>
        </span>
        <span>Resets {range.timeUntilReset}</span>
      </div>
    </div>
  );
}

function TooltipContent({
  providerType,
  data,
  fetchedAtMs,
}: {
  providerType: UsageProviderType;
  data: UsageDisplayData;
  fetchedAtMs: number;
}) {
  const meta = getProviderMeta(providerType);
  const fetchedAt = new Date(fetchedAtMs);

  return (
    <div className="space-y-1.5">
      <div className="font-medium text-neutral-200">{meta.label}</div>
      <div className="text-xs text-neutral-500">
        Last refreshed {formatFetchedAt(fetchedAtMs)} (
        {fetchedAt.toLocaleTimeString()})
      </div>
      {data.limits.map((limit) => (
        <TooltipRangeRow
          key={limit.key}
          label={limit.label}
          range={limit.range}
        />
      ))}
    </div>
  );
}

function ProviderUsageChip({
  providerType,
  result,
  fetchedAtMs,
}: {
  providerType: UsageProviderType;
  result: UsageResult;
  fetchedAtMs: number;
}) {
  const meta = getProviderMeta(providerType);
  const Icon = PROVIDER_ICONS[providerType];

  const { data } = result;
  const primary = data?.limits.find((l) => l.isPrimary);
  if (!data || !primary) {
    if (result.error?.type === 'no_token') return null;

    return (
      <Tooltip
        content={
          <span className="text-neutral-400">
            {result.error?.message ?? 'No usage data'}
          </span>
        }
        side="bottom"
      >
        <div className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-neutral-500">
          {Icon ? (
            <Icon className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
          )}
          <span className="text-xs">{meta.shortLabel}</span>
        </div>
      </Tooltip>
    );
  }

  const usageRatio = getUsageRatio({
    utilization: primary.range.utilization,
    resetsAt: primary.range.resetsAt,
    windowDurationMs: primary.range.windowDurationMs,
  });
  const level = getUsageLevel(usageRatio);

  const isExhausted = hasAnyRangeOver(data, 100);
  const hasSecondaryWarning = !isExhausted && hasSecondaryRangeOver(data, 90);

  const textColor = isExhausted ? 'text-red-400' : LEVEL_TEXT_COLORS[level];
  const dotColor = isExhausted ? 'bg-red-400' : LEVEL_DOT_COLORS[level];
  const ringClass = isExhausted
    ? 'ring-1 ring-red-400/60'
    : hasSecondaryWarning
      ? 'ring-1 ring-orange-400/50'
      : '';

  const displayPercentage = isExhausted
    ? '100'
    : Math.min(primary.range.utilization, 100).toFixed(0);

  return (
    <Tooltip
      content={
        <TooltipContent
          providerType={providerType}
          data={data}
          fetchedAtMs={fetchedAtMs}
        />
      }
      side="bottom"
    >
      <div
        className={clsx(
          'flex items-center gap-1.5 rounded px-1.5 py-0.5',
          ringClass,
        )}
      >
        {Icon ? (
          <Icon className={clsx('h-3.5 w-3.5 shrink-0', textColor)} />
        ) : (
          <div className={clsx('h-1.5 w-1.5 rounded-full', dotColor)} />
        )}
        <span className={clsx('text-xs font-medium', textColor)}>
          {Icon ? '' : `${meta.shortLabel} `}
          {displayPercentage}%
        </span>
      </div>
    </Tooltip>
  );
}

export function UsageDisplay() {
  const { data: usageMap, isLoading, dataUpdatedAt } = useBackendUsage();
  const fetchedAtMs = dataUpdatedAt || Date.now();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  if (!usageMap || Object.keys(usageMap).length === 0) {
    return null;
  }

  const entries = Object.entries(usageMap) as [
    UsageProviderType,
    UsageResult,
  ][];

  return (
    <div className="flex items-center gap-1">
      {entries.map(([providerType, result]) => (
        <ProviderUsageChip
          key={providerType}
          providerType={providerType}
          result={result}
          fetchedAtMs={fetchedAtMs}
        />
      ))}
    </div>
  );
}
