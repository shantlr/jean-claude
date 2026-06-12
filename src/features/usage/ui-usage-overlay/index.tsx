import { BarChart3, X } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useAiUsageDashboard } from '@/hooks/use-ai-usage-dashboard';

type Range = 'today' | '7d' | '30d' | 'all';

const MODEL_COLORS = [
  '#a78bfa',
  '#38bdf8',
  '#2dd4bf',
  '#818cf8',
  '#f472b6',
  '#f59e0b',
];

function formatCost(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function formatOptionalCost(value: number) {
  return value > 0 ? formatCost(value) : '-';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value);
}

function formatFeature(value: string) {
  return value.replaceAll('-', ' ');
}

function maxOf(values: number[]) {
  return Math.max(...values, 0) || 1;
}

function GraphTooltip({
  children,
  rows,
  title,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  return (
    <div className="group relative min-w-0 focus-within:z-30" tabIndex={0}>
      {children}
      <div className="absolute bottom-full left-1/2 z-30 hidden w-56 -translate-x-1/2 pb-2 group-focus-within:block group-hover:block">
        <div className="rounded-xl border border-white/10 bg-[#151521]/95 p-3 text-xs shadow-2xl select-text">
          <div className="text-ink-0 mb-2 truncate font-medium">{title}</div>
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <span className="text-ink-3">{row.label}</span>
                <span className="text-ink-0 text-right tabular-nums">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  children,
  className = '',
  right,
  title,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`border-glass-border bg-bg-1/75 rounded-2xl border p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-ink-0 text-sm font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {right ? <div className="text-ink-4 text-xs">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Sparkline({
  color,
  data,
  formatValue = formatNumber,
  tooltipLabel,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
  formatValue?: (value: number) => string;
  tooltipLabel: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const values = data.map((point) => point.value);
  const max = maxOf(values);
  const points = values.length > 1 ? values : [...values, values[0] ?? 0];
  const hoverPoint = hoverIndex === null ? null : data[hoverIndex];
  const gradientId = `sparkline-${color.replaceAll(/[^a-z0-9]/gi, '')}`;
  const hoverX =
    hoverIndex === null
      ? 0
      : (hoverIndex / Math.max(points.length - 1, 1)) * 92;
  const hoverY = hoverPoint ? 28 - (hoverPoint.value / max) * 24 : 0;
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 92;
      const y = 28 - (value / max) * 24;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${path} L 92 30 L 0 30 Z`;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    setHoverIndex(Math.round(ratio * Math.max(data.length - 1, 0)));
  }

  return (
    <div
      className="relative h-6 w-20"
      onPointerLeave={() => setHoverIndex(null)}
      onPointerMove={handlePointerMove}
    >
      <svg aria-hidden="true" className="h-6 w-20 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2"
        />
        {hoverPoint ? (
          <circle cx={hoverX} cy={hoverY} fill={color} r="3" />
        ) : null}
      </svg>
      {hoverPoint ? (
        <div
          className="absolute bottom-8 z-30 min-w-36 rounded-xl border border-white/10 bg-[#151521]/95 p-2.5 text-xs shadow-2xl select-text"
          style={{ left: `clamp(0px, ${hoverX}px, calc(100% - 144px))` }}
        >
          <div className="text-ink-0 mb-1 font-medium">{hoverPoint.label}</div>
          <div className="flex justify-between gap-4">
            <span className="text-ink-3">{tooltipLabel}</span>
            <span className="text-ink-0 tabular-nums">
              {formatValue(hoverPoint.value)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiTile({
  color,
  formatSparkValue,
  label,
  spark,
  value,
}: {
  label: string;
  value: string;
  spark: Array<{ label: string; value: number }>;
  color: string;
  formatSparkValue?: (value: number) => string;
}) {
  return (
    <div className="border-glass-border bg-glass-light/60 hover:border-acc/35 rounded-2xl border p-3 transition-colors">
      <div className="text-ink-3 text-[11px] font-semibold tracking-[0.16em] uppercase">
        {label}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="text-ink-0 text-xl font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </div>
        <Sparkline
          color={color}
          data={spark}
          formatValue={formatSparkValue}
          tooltipLabel={label}
        />
      </div>
    </div>
  );
}

function SpendChart({
  days,
}: {
  days: Array<{
    date: string;
    estimatedCostUsd: number;
    providerApiCostUsd: number;
    requests: number;
  }>;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points =
    days.length > 1 ? days : [...days, days[0] ?? null].filter(Boolean);
  const max = maxOf(
    points.flatMap((day) => [day.estimatedCostUsd, day.providerApiCostUsd]),
  );
  const width = 620;
  const height = 150;
  const toPath = (key: 'estimatedCostUsd' | 'providerApiCostUsd') =>
    points
      .map((day, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - (day[key] / max) * (height - 20) - 8;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  const area = `${toPath('estimatedCostUsd')} L ${width} ${height} L 0 ${height} Z`;
  const hoverPoint = hoverIndex === null ? null : points[hoverIndex];
  const hoverX =
    hoverIndex === null
      ? 0
      : (hoverIndex / Math.max(points.length - 1, 1)) * width;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    setHoverIndex(Math.round(ratio * Math.max(points.length - 1, 0)));
  }

  if (points.length === 0) {
    return (
      <div className="text-ink-3 flex h-[170px] items-center justify-center text-sm">
        No spend data for this range.
      </div>
    );
  }

  return (
    <div
      className="relative h-[170px] overflow-hidden rounded-xl bg-black/10 p-2"
      onPointerLeave={() => setHoverIndex(null)}
      onPointerMove={handlePointerMove}
    >
      <svg
        aria-label="Spend over time"
        className="h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id="usage-subscription-fill"
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            x1="0"
            x2={width}
            y1={tick * height}
            y2={tick * height}
          />
        ))}
        <path d={area} fill="url(#usage-subscription-fill)" />
        <path
          d={toPath('estimatedCostUsd')}
          fill="none"
          stroke="#a78bfa"
          strokeLinecap="round"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={toPath('providerApiCostUsd')}
          fill="none"
          stroke="#38bdf8"
          strokeLinecap="round"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
        {hoverPoint ? (
          <>
            <line
              stroke="rgba(255,255,255,0.24)"
              strokeDasharray="4 4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1={hoverX}
              x2={hoverX}
              y1="0"
              y2={height}
            />
            <circle
              cx={hoverX}
              cy={
                height - (hoverPoint.estimatedCostUsd / max) * (height - 20) - 8
              }
              fill="#a78bfa"
              r="4"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hoverX}
              cy={
                height -
                (hoverPoint.providerApiCostUsd / max) * (height - 20) -
                8
              }
              fill="#38bdf8"
              r="4"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
      {hoverPoint ? (
        <div
          className="absolute top-3 z-10 min-w-44 rounded-xl border border-white/10 bg-[#151521]/95 p-3 text-xs shadow-2xl backdrop-blur select-text"
          style={{
            left: `clamp(8px, ${(hoverX / width) * 100}%, calc(100% - 184px))`,
          }}
        >
          <div className="text-ink-0 mb-2 font-medium">{hoverPoint.date}</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink-3">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-violet-300" />
                Estimate
              </span>
              <span className="text-ink-0 tabular-nums">
                {formatCost(hoverPoint.estimatedCostUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink-3">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-sky-400" />
                Provider API
              </span>
              <span className="text-ink-0 tabular-nums">
                {formatOptionalCost(hoverPoint.providerApiCostUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink-3">Requests</span>
              <span className="text-ink-0 tabular-nums">
                {formatNumber(hoverPoint.requests)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Donut({
  segments,
  total,
}: {
  total: number;
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const gradient = segments
    .reduce<{ cursor: number; parts: string[] }>(
      (state, segment) => {
        const start = state.cursor;
        const share = total > 0 ? (segment.value / total) * 100 : 0;
        const cursor = start + share;
        return {
          cursor,
          parts: [...state.parts, `${segment.color} ${start}% ${cursor}%`],
        };
      },
      { cursor: 0, parts: [] },
    )
    .parts.join(', ');

  return (
    <div className="flex items-center gap-4">
      <GraphTooltip
        rows={[
          { label: 'Total tokens', value: formatNumber(total) },
          { label: 'Models', value: formatNumber(segments.length) },
        ]}
        title="Tokens by model"
      >
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: gradient ? `conic-gradient(${gradient})` : '#242432',
          }}
        >
          <div className="bg-bg-1 absolute inset-4 flex flex-col items-center justify-center rounded-full border border-white/5">
            <span className="text-ink-0 text-base font-semibold tabular-nums">
              {formatCompact(total)}
            </span>
            <span className="text-ink-4 text-[11px] tracking-[0.14em] uppercase">
              tokens
            </span>
          </div>
        </div>
      </GraphTooltip>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.slice(0, 5).map((segment) => (
          <GraphTooltip
            key={segment.label}
            rows={[
              { label: 'Tokens', value: formatNumber(segment.value) },
              {
                label: 'Share',
                value: `${total > 0 ? ((segment.value / total) * 100).toFixed(1) : '0.0'}%`,
              },
            ]}
            title={segment.label}
          >
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: segment.color }}
              />
              <span className="text-ink-2 min-w-0 flex-1 truncate font-mono">
                {segment.label}
              </span>
              <span className="text-ink-4 tabular-nums">
                {formatCompact(segment.value)}
              </span>
            </div>
          </GraphTooltip>
        ))}
      </div>
    </div>
  );
}

export function UsageOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  const [range, setRange] = useState<Range>('30d');
  const { data, isLoading } = useAiUsageDashboard(range);

  const modelRows = useMemo(
    () =>
      data?.byModel.map((row, index) => ({
        ...row,
        color: MODEL_COLORS[index % MODEL_COLORS.length],
        label: row.model === 'default' ? `${row.backend}/default` : row.model,
      })) ?? [],
    [data?.byModel],
  );
  const topCostModels = useMemo(
    () =>
      [...modelRows]
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
        .slice(0, 6),
    [modelRows],
  );
  const topTokenModels = useMemo(
    () => [...modelRows].sort((a, b) => b.totalTokens - a.totalTokens),
    [modelRows],
  );
  const tokenSpark =
    data?.byDay.map((day) => ({ label: day.date, value: day.totalTokens })) ??
    [];
  const requestSpark =
    data?.byDay.map((day) => ({ label: day.date, value: day.requests })) ?? [];
  const taskSpark = requestSpark;
  const costSpark =
    data?.byDay.map((day) => ({
      label: day.date,
      value: day.requests ? day.estimatedCostUsd / day.requests : 0,
    })) ?? [];
  const maxModelCost = maxOf(topCostModels.map((row) => row.estimatedCostUsd));
  const maxFeatureTokens = maxOf(
    data?.byFeature.map((row) => row.totalTokens) ?? [],
  );
  const maxTaskCost = maxOf(
    data?.topTasks.map((row) => row.estimatedCostUsd) ?? [],
  );
  const avgRequestCost = data?.totals.requests
    ? data.totals.estimatedCostUsd / data.totals.requests
    : 0;

  useCommands(
    'usage-overlay',
    [
      {
        shortcut: 'escape',
        label: 'Close Usage Overlay',
        handler: onClose,
        hideInCommandPalette: true,
      },
    ],
    { layer },
  );

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/55 px-4 pt-[54px] backdrop-blur-md sm:px-6"
      onClick={onClose}
    >
      <div
        className="border-glass-border shadow-modal text-ink-0 relative flex h-[min(760px,calc(100vh-70px))] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border bg-[#101018]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute -top-28 right-8 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute top-28 left-12 h-44 w-44 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="border-glass-border relative flex flex-wrap items-center gap-3 border-b bg-gradient-to-b from-violet-400/10 to-transparent px-4 py-3 sm:px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/15 text-violet-200 shadow-[0_0_30px_rgba(167,139,250,0.22)]">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="text-ink-0 text-base font-semibold tracking-[-0.03em]">
              AI Usage Command Center
            </div>
            <div className="text-ink-3 text-xs">
              Subscription value shown as API estimate, not actual spend.
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-black/15 p-1">
            {(['today', '7d', '30d', 'all'] as Range[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  range === item
                    ? 'bg-violet-300 text-[#100d19]'
                    : 'text-ink-3 hover:text-ink-1 hover:bg-white/5'
                }`}
              >
                {item === 'today' ? 'Today' : item.toUpperCase()}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close usage overlay"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          {isLoading || !data ? (
            <div className="text-ink-3 flex h-full items-center justify-center text-sm">
              Loading usage...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
                <div className="relative overflow-hidden rounded-2xl border border-violet-300/25 bg-gradient-to-br from-violet-400/15 via-violet-400/8 to-sky-400/10 p-4">
                  <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-violet-300/20 blur-2xl" />
                  <div className="text-ink-3 relative text-[11px] font-semibold tracking-[0.16em] uppercase">
                    Total tracked value ·{' '}
                    {range === 'today' ? 'Today' : range.toUpperCase()}
                  </div>
                  <div className="relative mt-2 text-4xl font-bold tracking-[-0.05em] tabular-nums">
                    {formatCost(data.totals.estimatedCostUsd)}
                  </div>
                  <div className="text-ink-3 relative mt-1.5 text-xs">
                    across {formatNumber(data.totals.requests)} requests ·{' '}
                    {formatNumber(data.totals.taskCount)} tasks
                  </div>
                  <div className="relative mt-4 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-violet-300" />
                      <span className="text-ink-3 text-xs">
                        Estimated API value
                      </span>
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        {formatCost(data.totals.estimatedCostUsd)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
                      <span className="text-ink-3 text-xs">
                        Provider API estimate
                      </span>
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        {formatOptionalCost(data.totals.providerApiCostUsd)}
                      </span>
                    </div>
                  </div>
                </div>

                <Panel
                  title="Spend over time"
                  right={
                    <div className="flex gap-4">
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet-300" />
                        Estimate
                      </span>
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400" />
                        Provider API
                      </span>
                    </div>
                  }
                >
                  <SpendChart days={data.byDay} />
                </Panel>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  color="#a78bfa"
                  label="Tokens"
                  spark={tokenSpark}
                  value={formatCompact(data.totals.totalTokens)}
                />
                <KpiTile
                  color="#38bdf8"
                  label="Requests"
                  spark={requestSpark}
                  value={formatNumber(data.totals.requests)}
                />
                <KpiTile
                  color="#2dd4bf"
                  label="Tasks"
                  spark={taskSpark}
                  value={formatNumber(data.totals.taskCount)}
                />
                <KpiTile
                  color="#818cf8"
                  formatSparkValue={formatCost}
                  label="Avg / request"
                  spark={costSpark}
                  value={formatCost(avgRequestCost)}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
                <Panel
                  title="Cost by model"
                  right="top 6 · estimated API value"
                >
                  <div className="space-y-2.5">
                    {topCostModels.length === 0 ? (
                      <div className="text-ink-3 py-10 text-center text-sm">
                        No model data yet.
                      </div>
                    ) : (
                      topCostModels.map((row) => (
                        <div
                          key={`${row.backend}:${row.model}`}
                          className="grid grid-cols-[minmax(0,180px)_1fr_70px] items-center gap-3"
                        >
                          <div className="text-ink-2 truncate font-mono text-xs">
                            {row.label}
                          </div>
                          <GraphTooltip
                            rows={[
                              {
                                label: 'Tokens',
                                value: formatNumber(row.totalTokens),
                              },
                              {
                                label: 'Est. API',
                                value: formatCost(row.estimatedCostUsd),
                              },
                              {
                                label: 'Provider API',
                                value: formatOptionalCost(
                                  row.providerApiCostUsd,
                                ),
                              },
                              {
                                label: 'Requests',
                                value: formatNumber(row.requests),
                              },
                            ]}
                            title={row.label}
                          >
                            <div className="h-2 overflow-hidden rounded-full bg-white/6">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max((row.estimatedCostUsd / maxModelCost) * 100, row.estimatedCostUsd > 0 ? 1 : 0)}%`,
                                  background: row.color,
                                }}
                              />
                            </div>
                          </GraphTooltip>
                          <div className="text-ink-1 text-right text-sm font-medium tabular-nums">
                            {formatCost(row.estimatedCostUsd)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>
                <Panel title="Tokens by model">
                  <Donut
                    segments={topTokenModels.map((row) => ({
                      color: row.color,
                      label: row.label,
                      value: row.totalTokens,
                    }))}
                    total={data.totals.totalTokens}
                  />
                </Panel>
              </div>

              <Panel
                title="Usage by feature"
                right={`${data.byFeature.length} features · token share`}
              >
                <div className="text-ink-4 grid grid-cols-[140px_1fr_88px_78px_78px_70px] gap-3 border-b border-white/8 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase max-lg:hidden">
                  <span>Feature</span>
                  <span>Share</span>
                  <span className="text-right">Tokens</span>
                  <span className="text-right">Est. $</span>
                  <span className="text-right">API $</span>
                  <span className="text-right">Req.</span>
                </div>
                <div className="divide-y divide-white/6">
                  {data.byFeature.map((row, index) => (
                    <div
                      key={row.feature}
                      className="grid items-center gap-3 py-2 lg:grid-cols-[140px_1fr_88px_78px_78px_70px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{
                            background:
                              MODEL_COLORS[index % MODEL_COLORS.length],
                          }}
                        />
                        <span className="text-ink-0 truncate text-xs capitalize">
                          {formatFeature(row.feature)}
                        </span>
                      </div>
                      <GraphTooltip
                        rows={[
                          {
                            label: 'Tokens',
                            value: formatNumber(row.totalTokens),
                          },
                          {
                            label: 'Share',
                            value: `${data.totals.totalTokens > 0 ? ((row.totalTokens / data.totals.totalTokens) * 100).toFixed(1) : '0.0'}%`,
                          },
                          {
                            label: 'Est. API',
                            value: formatCost(row.estimatedCostUsd),
                          },
                          {
                            label: 'Provider API',
                            value: formatOptionalCost(row.providerApiCostUsd),
                          },
                          {
                            label: 'Requests',
                            value: formatNumber(row.requests),
                          },
                        ]}
                        title={formatFeature(row.feature)}
                      >
                        <div className="h-2 overflow-hidden rounded-full bg-white/6">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max((row.totalTokens / maxFeatureTokens) * 100, row.totalTokens > 0 ? 1 : 0)}%`,
                              background:
                                MODEL_COLORS[index % MODEL_COLORS.length],
                            }}
                          />
                        </div>
                      </GraphTooltip>
                      <span className="text-ink-2 text-right text-xs tabular-nums">
                        {formatCompact(row.totalTokens)}
                      </span>
                      <span className="text-ink-2 text-right text-xs tabular-nums">
                        {formatCost(row.estimatedCostUsd)}
                      </span>
                      <span className="text-ink-2 text-right text-xs tabular-nums">
                        {formatOptionalCost(row.providerApiCostUsd)}
                      </span>
                      <span className="text-ink-3 text-right text-xs tabular-nums">
                        {formatNumber(row.requests)}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Top tasks by cost"
                right={`${data.topTasks.length} tracked tasks`}
              >
                <div className="divide-y divide-white/6">
                  {data.topTasks.slice(0, 8).map((row, index) => (
                    <div
                      key={row.taskId}
                      className="grid items-center gap-3 py-2 lg:grid-cols-[32px_minmax(0,1fr)_150px_92px_110px]"
                    >
                      <span className="text-ink-4 text-center text-xs tabular-nums">
                        {index + 1}
                      </span>
                      <span className="text-ink-0 min-w-0 truncate text-xs">
                        {row.taskName ?? row.taskId}
                      </span>
                      <span className="text-ink-3 min-w-0 truncate rounded-md border border-white/8 bg-white/4 px-2 py-1 font-mono text-xs">
                        {row.projectName ?? row.projectId}
                      </span>
                      <span className="text-ink-3 text-right text-xs tabular-nums">
                        {formatCompact(row.totalTokens)}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        <GraphTooltip
                          rows={[
                            {
                              label: 'Project',
                              value: row.projectName ?? row.projectId,
                            },
                            {
                              label: 'Tokens',
                              value: formatNumber(row.totalTokens),
                            },
                            {
                              label: 'Est. API',
                              value: formatCost(row.estimatedCostUsd),
                            },
                            {
                              label: 'Provider API',
                              value: formatOptionalCost(row.providerApiCostUsd),
                            },
                            {
                              label: 'Requests',
                              value: formatNumber(row.requests),
                            },
                          ]}
                          title={row.taskName ?? row.taskId}
                        >
                          <span className="block h-1 w-9 overflow-hidden rounded-full bg-white/6">
                            <span
                              className="block h-full rounded-full bg-violet-300"
                              style={{
                                width: `${Math.max((row.estimatedCostUsd / maxTaskCost) * 100, row.estimatedCostUsd > 0 ? 1 : 0)}%`,
                              }}
                            />
                          </span>
                        </GraphTooltip>
                        <span className="text-ink-0 min-w-14 text-right text-xs font-semibold tabular-nums">
                          {formatCost(row.estimatedCostUsd)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <div className="text-ink-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <span>
                  Retention: <span className="text-ink-3">forever</span>
                  {data.unknownPricing.length > 0 ? (
                    <span className="group focus-within:text-ink-2 relative inline-flex items-center">
                      <span className="mx-1">·</span>
                      <span
                        className="cursor-help underline decoration-white/20 underline-offset-2"
                        tabIndex={0}
                      >
                        {data.unknownPricing.length} model
                        {data.unknownPricing.length === 1 ? '' : 's'} need
                        pricing
                      </span>
                      <span className="absolute bottom-full left-0 z-20 hidden w-72 pb-2 group-focus-within:block group-hover:block">
                        <span className="block rounded-xl border border-white/10 bg-[#151521]/95 p-3 text-xs shadow-2xl select-text">
                          <span className="text-ink-0 mb-2 block font-medium">
                            Missing pricing
                          </span>
                          <span className="block space-y-1.5">
                            {data.unknownPricing.map((row) => (
                              <span
                                key={`${row.backend}:${row.model}`}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="text-ink-2 min-w-0 truncate font-mono">
                                  {row.backend}/{row.model}
                                </span>
                                <span className="text-ink-4 shrink-0 tabular-nums">
                                  {formatNumber(row.requests)} req
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1">
                  Close <Kbd shortcut="escape" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
