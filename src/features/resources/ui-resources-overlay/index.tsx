import { Cpu, X } from 'lucide-react';
import FocusLock from 'react-focus-lock';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';



import {
  type AgentResourceSample,
  useAgentResourceSnapshots,
} from '@/hooks/use-agent-resource-snapshots';
import type { AgentResourceSnapshot } from '@shared/agent-resource-types';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useCommands } from '@/common/hooks/use-commands';
import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useMemoryUsage } from '@/hooks/use-memory-usage';



function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / 1_048_576;
  if (megabytes > 1000) return `${(megabytes / 1000).toFixed(1)} GB`;
  if (megabytes >= 1) return `${megabytes.toFixed(0)} MB`;
  return `${(bytes / 1_024).toFixed(0)} KB`;
}

function formatCpu(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function formatElapsed(sampledAt: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(sampledAt)) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function formatCompactBytes(bytes: number): string {
  return formatBytes(bytes).replace(' ', '');
}

function snapshotRootKey(snapshot: AgentResourceSnapshot): string {
  return snapshot.rootPid === null
    ? `step:${snapshot.stepId}`
    : `pid:${snapshot.rootPid}`;
}

function getUniqueProcessSamples(snapshots: AgentResourceSnapshot[]) {
  const latestByRoot = new Map<string, AgentResourceSnapshot>();

  for (const snapshot of snapshots) {
    const key = snapshotRootKey(snapshot);
    const existing = latestByRoot.get(key);
    if (
      existing === undefined ||
      Date.parse(snapshot.sampledAt) > Date.parse(existing.sampledAt)
    ) {
      latestByRoot.set(key, snapshot);
    }
  }

  const totals = Array.from(latestByRoot.values()).reduce(
    (acc, snapshot) => ({
      cpu: acc.cpu + snapshot.cpuPercent,
      rss: acc.rss + snapshot.rssBytes,
    }),
    { cpu: 0, rss: 0 },
  );

  return { latestByRoot, totals };
}

function sparkPath(values: number[], width: number, height: number) {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function Sparkline({
  className,
  fillClassName,
  values,
  width = 144,
  height = 34,
}: {
  values: number[];
  className: string;
  fillClassName?: string;
  width?: number;
  height?: number;
}) {
  const path = sparkPath(values, width, height);
  const areaPath = path ? `${path} L ${width} ${height} L 0 ${height} Z` : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="w-full overflow-hidden"
    >
      {areaPath ? <path d={areaPath} className={fillClassName} /> : null}
      {path ? (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          className={className}
        />
      ) : null}
    </svg>
  );
}

function LoadBar({
  className,
  percent,
}: {
  percent: number;
  className: string;
}) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
      <div
        className={`h-full min-w-0.5 rounded-full ${className}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

function AppResourceChart({
  colorClass,
  fillClass,
  label,
  value,
  values,
}: {
  label: string;
  value: string;
  values: number[];
  colorClass: string;
  fillClass: string;
}) {
  return (
    <div className="min-w-0 py-1">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-ink-4 text-[9px] tracking-[0.08em] uppercase">
          {label}
        </span>
        <span className="text-ink-1 text-xs font-semibold tabular-nums">
          {value}
        </span>
      </div>
      <Sparkline
        values={values}
        width={228}
        height={30}
        className={colorClass}
        fillClassName={fillClass}
      />
    </div>
  );
}

function Gauge({
  children,
  percent,
}: {
  percent: number;
  children: ReactNode;
}) {
  const size = 132;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.76;
  const fill = arc * Math.max(0, Math.min(1, percent / 100));
  const activeDash = `${fill} ${circumference}`;

  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[137deg]"
        aria-hidden
      >
        <defs>
          <filter
            id="resources-gauge-glow"
            x="-35%"
            y="-35%"
            width="170%"
            height="170%"
          >
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={stroke}
          className="text-white/8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeDasharray={activeDash}
          strokeLinecap="round"
          strokeWidth={stroke + 3}
          filter="url(#resources-gauge-glow)"
          className="text-[oklch(0.74_0.19_295)] opacity-55"
          style={{ transition: 'stroke-dasharray 420ms ease-out' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeDasharray={activeDash}
          strokeLinecap="round"
          strokeWidth={stroke}
          className="text-[oklch(0.74_0.19_295)]"
          style={{ transition: 'stroke-dasharray 420ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function SessionRow({
  history,
  rootCpu,
  snapshot,
  sharedRootCount,
  stepName,
  taskName,
  totalCpu,
}: {
  snapshot: AgentResourceSnapshot;
  history: AgentResourceSample[];
  rootCpu: number;
  sharedRootCount: number;
  taskName: string;
  stepName: string;
  totalCpu: number;
}) {
  const samples = history.length > 0 ? history : [snapshot];
  const cpuValues = samples.map((sample) => sample.cpuPercent);
  const rssValues = samples.map((sample) => sample.rssBytes);
  const attributedCpu = rootCpu / sharedRootCount;
  const loadShare = totalCpu > 0 ? (attributedCpu / totalCpu) * 100 : 0;

  return (
    <div className="grid items-center gap-4 border-t border-white/7 px-1 py-3 lg:grid-cols-[minmax(0,1fr)_84px_132px_84px_132px_56px]">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="resource-status-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.74_0.19_295)] shadow-[0_0_8px_oklch(0.74_0.19_295)]" />
          <span className="text-ink-0 truncate text-[13px] font-semibold tracking-[-0.01em]">
            {taskName}
          </span>
          <span className="text-ink-3 shrink-0 rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium">
            {snapshot.backend}
          </span>
        </div>
        <div className="text-ink-4 mt-1 ml-3.5 truncate text-[10px]">
          {stepName} · PID {snapshot.rootPid ?? '?'} · {snapshot.pids.length}{' '}
          pids · {formatElapsed(snapshot.sampledAt)}
          {sharedRootCount > 1 ? ` · shared by ${sharedRootCount}` : ''}
        </div>
        <div className="mt-2 ml-3.5 max-w-60">
          <LoadBar
            percent={loadShare}
            className="bg-[oklch(0.74_0.19_295)] shadow-[0_0_10px_oklch(0.74_0.19_295/0.55)]"
          />
        </div>
      </div>

      <span className="text-ink-1 text-sm font-semibold tabular-nums lg:text-right">
        <span className="text-ink-4 mr-2 text-[10px] tracking-[0.08em] uppercase lg:hidden">
          CPU
        </span>
        {snapshot.cpuPercent.toFixed(1)}
        <span className="text-ink-4 text-[10px]">%</span>
      </span>
      <div className="overflow-hidden rounded-md">
        <Sparkline
          values={cpuValues}
          width={132}
          height={30}
          className="text-[oklch(0.74_0.19_295)]"
          fillClassName="fill-[oklch(0.74_0.19_295/0.13)]"
        />
      </div>
      <span className="text-ink-1 text-sm font-semibold tabular-nums lg:text-right">
        <span className="text-ink-4 mr-2 text-[10px] tracking-[0.08em] uppercase lg:hidden">
          RSS
        </span>
        {formatCompactBytes(snapshot.rssBytes)}
      </span>
      <div className="overflow-hidden rounded-md">
        <Sparkline
          values={rssValues}
          width={132}
          height={30}
          className="text-[oklch(0.78_0.16_155)]"
          fillClassName="fill-[oklch(0.78_0.16_155/0.12)]"
        />
      </div>
      <span className="text-ink-2 text-sm tabular-nums lg:text-right">
        <span className="text-ink-4 mr-2 text-[10px] tracking-[0.08em] uppercase lg:hidden">
          Procs
        </span>
        {snapshot.pids.length}
      </span>
    </div>
  );
}

function MeterRow({
  colorClass,
  label,
  percent,
  value,
}: {
  label: string;
  value: string;
  percent: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-3 text-[11px]">{label}</span>
        <span className="text-ink-1 text-xs font-semibold tabular-nums">
          {value}
        </span>
      </div>
      <LoadBar percent={percent} className={colorClass} />
    </div>
  );
}

function AppMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ink-4 truncate text-[9px] tracking-[0.08em] uppercase">
        {label}
      </div>
      <div className="text-ink-1 mt-1 text-xs font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function ResourcesOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  const { data: memory, history: memoryHistory } = useMemoryUsage();
  const { data: snapshots = [], historyByStepId } = useAgentResourceSnapshots();

  const supportedSnapshots = useMemo(
    () =>
      snapshots
        .filter((snapshot) => !snapshot.unsupportedReason)
        .sort((a, b) => b.cpuPercent - a.cpuPercent || b.rssBytes - a.rssBytes),
    [snapshots],
  );
  const taskQueries = useQueries({
    queries: supportedSnapshots.map((snapshot) => ({
      queryKey: ['tasks', snapshot.taskId],
      queryFn: () => api.tasks.findById(snapshot.taskId),
      staleTime: 10_000,
    })),
  });
  const stepQueries = useQueries({
    queries: supportedSnapshots.map((snapshot) => ({
      queryKey: ['steps', snapshot.stepId],
      queryFn: () => api.steps.findById(snapshot.stepId),
      staleTime: 10_000,
    })),
  });

  const rootSessionCounts = useMemo(
    () =>
      supportedSnapshots.reduce((counts, snapshot) => {
        const key = snapshotRootKey(snapshot);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    [supportedSnapshots],
  );
  const uniqueProcessSamples = useMemo(
    () => getUniqueProcessSamples(supportedSnapshots),
    [supportedSnapshots],
  );
  const totalCpu = uniqueProcessSamples.totals.cpu;
  const totalRss = uniqueProcessSamples.totals.rss;
  const sharedRootCount = Array.from(rootSessionCounts.values()).filter(
    (count) => count > 1,
  ).length;
  const appCpu = memory
    ? memory.mainProcess.cpuPercent + memory.rendererProcess.cpuPercent
    : 0;
  const appRss = memory?.totalRssBytes ?? 0;
  const trackedRss = Math.max(totalRss + appRss, 1);
  const logicalCpuCount =
    memory?.logicalCpuCount ?? window.navigator.hardwareConcurrency ?? 1;
  const totalCpuGaugePercent =
    (totalCpu / Math.max(1, logicalCpuCount * 100)) * 100;
  const unsupportedSnapshots = snapshots.filter(
    (snapshot) => snapshot.unsupportedReason,
  );
  const appCpuValues = memoryHistory.map(
    (sample) =>
      sample.mainProcess.cpuPercent + sample.rendererProcess.cpuPercent,
  );
  const appRssValues = memoryHistory.map((sample) => sample.totalRssBytes);

  useCommands(
    'resources-overlay',
    [
      {
        shortcut: 'escape',
        label: 'Close Resources Overlay',
        handler: onClose,
        hideInCommandPalette: true,
      },
    ],
    { layer },
  );

  return (
    <FocusLock returnFocus>
      <div
        className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/55 px-4 pt-[54px] backdrop-blur-md sm:px-6"
        onClick={onClose}
      >
        <div
          className="border-glass-border shadow-modal text-ink-0 relative flex h-[min(860px,calc(100vh-70px))] w-full max-w-6xl flex-col overflow-hidden rounded-[18px] border bg-[linear-gradient(180deg,#171721_0%,#101018_100%)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resources-overlay-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-glass-border relative flex items-center gap-3 border-b px-4 py-3 sm:px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/12 text-sky-200">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                id="resources-overlay-title"
                className="text-ink-0 text-base font-semibold tracking-[-0.03em]"
              >
                Running Session Resources
              </div>
              <div className="text-ink-3 text-xs">
                System monitor - agent trees + Jean-Claude app
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.16_155/0.3)] bg-[oklch(0.78_0.16_155/0.12)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.78_0.16_155)]">
              <span className="resource-status-pulse h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.16_155)] shadow-[0_0_8px_oklch(0.78_0.16_155)]" />
              live
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close resources overlay"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto lg:overflow-hidden">
            <div className="grid min-h-full lg:h-full lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="border-glass-border space-y-4 border-r bg-black/16 p-5 lg:min-h-0 lg:overflow-auto">
                <div className="flex flex-col items-center pb-2">
                  <Gauge percent={totalCpuGaugePercent}>
                    <span className="text-ink-0 text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                      {totalCpu.toFixed(1)}
                    </span>
                    <span className="text-ink-3 mt-1 text-[11px]">
                      % agent cpu
                    </span>
                  </Gauge>
                  <div className="text-ink-3 mt-3 text-center text-[11px]">
                    <span className="text-ink-1 font-semibold">
                      {formatNumber(supportedSnapshots.length)}
                    </span>{' '}
                    sessions
                    {sharedRootCount > 0 ? (
                      <span className="text-ink-4">
                        {' '}
                        · {formatNumber(sharedRootCount)} shared PID
                        {sharedRootCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-white/8 pt-4">
                  <div className="space-y-4">
                    <MeterRow
                      label="Agent memory"
                      value={formatBytes(totalRss)}
                      percent={(totalRss / trackedRss) * 100}
                      colorClass="bg-[oklch(0.78_0.16_155)] shadow-[0_0_10px_oklch(0.78_0.16_155/0.55)]"
                    />
                    <MeterRow
                      label="App memory"
                      value={memory ? formatBytes(memory.totalRssBytes) : '-'}
                      percent={(appRss / trackedRss) * 100}
                      colorClass="bg-[oklch(0.78_0.16_205)] shadow-[0_0_10px_oklch(0.78_0.16_205/0.55)]"
                    />
                    <MeterRow
                      label="App CPU"
                      value={memory ? formatCpu(appCpu) : '-'}
                      percent={appCpu}
                      colorClass="bg-[oklch(0.78_0.16_205)] shadow-[0_0_10px_oklch(0.78_0.16_205/0.55)]"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                  <div className="text-ink-4 mb-3 text-[10px] tracking-[0.1em] uppercase">
                    Jean-Claude app · main + renderer
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <AppMetric
                      label="Main CPU"
                      value={
                        memory ? formatCpu(memory.mainProcess.cpuPercent) : '-'
                      }
                    />
                    <AppMetric
                      label="Main RSS"
                      value={
                        memory ? formatBytes(memory.mainProcess.rssBytes) : '-'
                      }
                    />
                    <AppMetric
                      label="Main heap"
                      value={
                        memory
                          ? formatBytes(memory.mainProcess.heapUsedBytes)
                          : '-'
                      }
                    />
                    <AppMetric
                      label="Renderer CPU"
                      value={
                        memory
                          ? formatCpu(memory.rendererProcess.cpuPercent)
                          : '-'
                      }
                    />
                    <AppMetric
                      label="Renderer RSS"
                      value={
                        memory
                          ? formatBytes(memory.rendererProcess.rssBytes)
                          : '-'
                      }
                    />
                    <AppMetric
                      label="Renderer private"
                      value={
                        memory
                          ? formatBytes(memory.rendererProcess.privateBytes)
                          : '-'
                      }
                    />
                  </div>
                  <div className="mt-3 space-y-2">
                    <AppResourceChart
                      label="App CPU"
                      value={memory ? formatCpu(appCpu) : '-'}
                      values={appCpuValues}
                      colorClass="text-[oklch(0.78_0.16_205)]"
                      fillClass="fill-[oklch(0.78_0.16_205/0.12)]"
                    />
                    <AppResourceChart
                      label="App RSS"
                      value={memory ? formatBytes(memory.totalRssBytes) : '-'}
                      values={appRssValues}
                      colorClass="text-[oklch(0.78_0.16_155)]"
                      fillClass="fill-[oklch(0.78_0.16_155/0.12)]"
                    />
                  </div>
                </div>
              </aside>

              <main className="min-w-0 p-5 lg:min-h-0 lg:overflow-auto">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-ink-0 text-sm font-semibold">
                    Running agent sessions
                  </span>
                  <span className="text-ink-4 text-xs">
                    totals count each shared PID once
                  </span>
                </div>

                <div className="text-ink-4 grid grid-cols-[minmax(0,1fr)_84px_132px_84px_132px_56px] gap-4 px-1 pb-2 text-[10px] font-semibold tracking-[0.1em] uppercase max-lg:hidden">
                  <span>
                    Running agent
                    <br />
                    sessions
                  </span>
                  <span className="text-right">CPU</span>
                  <span>CPU · 1h</span>
                  <span className="text-right">RSS</span>
                  <span>RSS · 1h</span>
                  <span className="text-right">Procs</span>
                </div>

                {supportedSnapshots.length === 0 ? (
                  <div className="text-ink-3 py-24 text-center text-sm">
                    No running tracked sessions.
                  </div>
                ) : (
                  <div>
                    {supportedSnapshots.map((snapshot, index) => (
                      <SessionRow
                        key={snapshot.stepId}
                        snapshot={snapshot}
                        history={historyByStepId[snapshot.stepId] ?? []}
                        rootCpu={
                          uniqueProcessSamples.latestByRoot.get(
                            snapshotRootKey(snapshot),
                          )?.cpuPercent ?? snapshot.cpuPercent
                        }
                        sharedRootCount={
                          rootSessionCounts.get(snapshotRootKey(snapshot)) ?? 1
                        }
                        taskName={
                          taskQueries[index]?.data?.name ?? snapshot.taskId
                        }
                        stepName={
                          stepQueries[index]?.data?.name ?? snapshot.stepId
                        }
                        totalCpu={totalCpu}
                      />
                    ))}
                  </div>
                )}

                {unsupportedSnapshots.length > 0 ? (
                  <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="text-ink-4 mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                      Unsupported sessions
                    </div>
                    {unsupportedSnapshots.map((snapshot) => (
                      <div
                        key={snapshot.stepId}
                        className="text-ink-3 flex justify-between gap-4 py-1 text-xs"
                      >
                        <span className="truncate">{snapshot.stepId}</span>
                        <span className="text-ink-4 shrink-0">
                          {snapshot.unsupportedReason}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </main>
            </div>
          </div>

          <div className="border-glass-border text-ink-4 flex items-center border-t bg-black/18 px-5 py-3 text-xs">
            sampled every 2s
            <div className="flex-1" />
            Close <Kbd shortcut="escape" />
          </div>
        </div>
      </div>
    </FocusLock>
  );
}
