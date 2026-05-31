import { MemoryStick } from 'lucide-react';

import { Tooltip } from '@/common/ui/tooltip';
import {
  MAX_MEMORY_USAGE_SAMPLES,
  useMemoryUsage,
  type MemoryUsageSample,
} from '@/hooks/use-memory-usage';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1_024).toFixed(0)} KB`;
}

function formatCpu(percent: number): string {
  return `${Math.max(0, percent).toFixed(1)}%`;
}

function getSparklinePath({
  values,
  width,
  height,
  expectedSampleCount,
}: {
  values: number[];
  width: number;
  height: number;
  expectedSampleCount: number;
}) {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const xStep = expectedSampleCount > 1 ? width / (expectedSampleCount - 1) : 0;

  return values
    .map((value, index) => {
      const samplesFromLatest = values.length - 1 - index;
      const x = width - samplesFromLatest * xStep;
      const normalized = range === 0 ? 0.5 : (value - min) / range;
      const y = height - normalized * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function ResourceMetricRow({
  label,
  value,
  values,
  formatValue,
}: {
  label: string;
  value: number;
  values: number[];
  formatValue: (value: number) => string;
}) {
  const width = 96;
  const height = 22;
  const path = getSparklinePath({
    values,
    width,
    height,
    expectedSampleCount: MAX_MEMORY_USAGE_SAMPLES,
  });

  return (
    <div className="grid grid-cols-[74px_66px_96px] items-center gap-2 text-[11px]">
      <div className="text-ink-3 truncate">{label}</div>
      <div className="text-ink-1 text-right font-mono">
        {formatValue(value)}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-hidden
      >
        <path
          d={`M 0 ${height - 0.5} H ${width}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-ink-4/25"
        />
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            className="text-accent-1"
          />
        ) : null}
      </svg>
    </div>
  );
}

export function RamUsageDisplay() {
  const { data, history } = useMemoryUsage();

  if (!data) return null;

  const metrics = [
    {
      label: 'Total RSS',
      value: data.totalRssBytes,
      values: history.map((sample) => sample.totalRssBytes),
      formatValue: formatBytes,
    },
    {
      label: 'Main RSS',
      value: data.mainProcess.rssBytes,
      values: history.map((sample) => sample.mainProcess.rssBytes),
      formatValue: formatBytes,
    },
    {
      label: 'Main Heap',
      value: data.mainProcess.heapUsedBytes,
      values: history.map((sample) => sample.mainProcess.heapUsedBytes),
      formatValue: formatBytes,
    },
    {
      label: 'Main CPU',
      value: data.mainProcess.cpuPercent,
      values: history.map((sample) => sample.mainProcess.cpuPercent),
      formatValue: formatCpu,
    },
    {
      label: 'Renderer RSS',
      value: data.rendererProcess.rssBytes,
      values: history.map((sample) => sample.rendererProcess.rssBytes),
      formatValue: formatBytes,
    },
    {
      label: 'Renderer Private',
      value: data.rendererProcess.privateBytes,
      values: history.map((sample) => sample.rendererProcess.privateBytes),
      formatValue: formatBytes,
    },
    {
      label: 'Renderer CPU',
      value: data.rendererProcess.cpuPercent,
      values: history.map((sample) => sample.rendererProcess.cpuPercent),
      formatValue: formatCpu,
    },
  ] satisfies Array<{
    label: string;
    value: number;
    values: number[];
    formatValue: (value: number) => string;
  }>;

  const oldestSample = history[0] as MemoryUsageSample | undefined;
  const historyMinutes = oldestSample
    ? Math.max(1, Math.round((Date.now() - oldestSample.sampledAt) / 60_000))
    : 0;

  return (
    <Tooltip
      content={
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-5">
            <div className="text-ink-1 font-medium">Jean-Claude Resources</div>
            <div className="text-ink-4 font-mono text-[10px]">
              {history.length}/{MAX_MEMORY_USAGE_SAMPLES} samples ·{' '}
              {historyMinutes}m
            </div>
          </div>
          <div className="space-y-1.5">
            {metrics.map((metric) => (
              <ResourceMetricRow key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      }
      side="bottom"
      minWidth={270}
    >
      <div className="text-ink-2 flex cursor-default items-center gap-1.5 rounded px-1.5 py-0.5">
        <MemoryStick size={14} />
        <span className="text-xs">
          {formatBytes(data.totalRssBytes)} ·{' '}
          {formatCpu(
            data.mainProcess.cpuPercent + data.rendererProcess.cpuPercent,
          )}
        </span>
      </div>
    </Tooltip>
  );
}
