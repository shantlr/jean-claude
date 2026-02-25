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

/** Returns true if any range (primary or secondary) has raw utilization >= threshold. */
function hasAnyRangeOver(data: UsageDisplayData, threshold: number): boolean {
  if (data.fiveHour && data.fiveHour.utilization >= threshold) return true;
  if (data.sevenDay && data.sevenDay.utilization >= threshold) return true;
  return false;
}

/** Returns true if any secondary (non-primary) range has raw utilization >= threshold. */
function hasSecondaryRangeOver(
  data: UsageDisplayData,
  threshold: number,
): boolean {
  if (data.sevenDay && data.sevenDay.utilization >= threshold) return true;
  return false;
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

function TooltipContent({
  providerType,
  data,
}: {
  providerType: UsageProviderType;
  data: UsageDisplayData;
}) {
  const meta = getProviderMeta(providerType);

  return (
    <div className="space-y-1.5">
      <div className="font-medium text-neutral-200">{meta.label}</div>
      {data.fiveHour && (
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-400">5-hour</span>
            <span
              className={clsx(
                'font-medium',
                data.fiveHour.utilization >= 100
                  ? 'text-red-400'
                  : data.fiveHour.utilization >= 90
                    ? 'text-orange-400'
                    : undefined,
              )}
            >
              {data.fiveHour.utilization.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-neutral-500">
            <span>
              Ratio:{' '}
              {(() => {
                const r = getUsageRatio({
                  utilization: data.fiveHour!.utilization,
                  resetsAt: data.fiveHour!.resetsAt,
                  windowDurationMs: data.fiveHour!.windowDurationMs,
                });
                return Number.isFinite(r) ? r.toFixed(1) : '∞';
              })()}
            </span>
            <span>Resets {data.fiveHour.timeUntilReset}</span>
          </div>
        </div>
      )}
      {data.sevenDay && (
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-400">7-day</span>
            <span
              className={clsx(
                'font-medium',
                data.sevenDay.utilization >= 100
                  ? 'text-red-400'
                  : data.sevenDay.utilization >= 90
                    ? 'text-orange-400'
                    : undefined,
              )}
            >
              {data.sevenDay.utilization.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-neutral-500">
            <span>
              Ratio:{' '}
              {(() => {
                const r = getUsageRatio({
                  utilization: data.sevenDay!.utilization,
                  resetsAt: data.sevenDay!.resetsAt,
                  windowDurationMs: data.sevenDay!.windowDurationMs,
                });
                return Number.isFinite(r) ? r.toFixed(1) : '∞';
              })()}
            </span>
            <span>Resets {data.sevenDay.timeUntilReset}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderUsageChip({
  providerType,
  result,
}: {
  providerType: UsageProviderType;
  result: UsageResult;
}) {
  const meta = getProviderMeta(providerType);
  const Icon = PROVIDER_ICONS[providerType];

  if (!result.data?.fiveHour) {
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

  const { fiveHour } = result.data;
  const usageRatio = getUsageRatio({
    utilization: fiveHour.utilization,
    resetsAt: fiveHour.resetsAt,
    windowDurationMs: fiveHour.windowDurationMs,
  });
  const level = getUsageLevel(usageRatio);

  const isExhausted = hasAnyRangeOver(result.data, 100);
  const hasSecondaryWarning =
    !isExhausted && hasSecondaryRangeOver(result.data, 90);

  const textColor = isExhausted ? 'text-red-400' : LEVEL_TEXT_COLORS[level];
  const dotColor = isExhausted ? 'bg-red-400' : LEVEL_DOT_COLORS[level];
  const ringClass = isExhausted
    ? 'ring-1 ring-red-400/60'
    : hasSecondaryWarning
      ? 'ring-1 ring-orange-400/50'
      : '';

  const displayPercentage = isExhausted
    ? '100'
    : Math.min(fiveHour.utilization, 100).toFixed(0);

  return (
    <Tooltip
      content={
        <TooltipContent providerType={providerType} data={result.data} />
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
  const { data: usageMap, isLoading } = useBackendUsage();

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
        />
      ))}
    </div>
  );
}
