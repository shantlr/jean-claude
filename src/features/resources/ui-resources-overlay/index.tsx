import { useQueries } from '@tanstack/react-query';
import { Activity, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import FocusLock from 'react-focus-lock';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import {
  useAgentResourceSnapshots,
  type AgentResourceSample,
} from '@/hooks/use-agent-resource-snapshots';
import { useMemoryUsage } from '@/hooks/use-memory-usage';
import { api } from '@/lib/api';
import type { AgentResourceSnapshot } from '@shared/agent-resource-types';

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

function Panel({
  children,
  right,
  title,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-glass-border bg-bg-1/75 rounded-2xl border p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
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

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2">
      <div className="text-ink-4 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <div className="text-ink-0 mt-1 text-sm font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
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
  values,
}: {
  values: number[];
  className: string;
}) {
  const width = 104;
  const height = 24;
  const path = sparkPath(values, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
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
          strokeWidth="1.6"
          className={className}
        />
      ) : null}
    </svg>
  );
}

function SessionRow({
  history,
  snapshot,
  stepName,
  taskName,
}: {
  snapshot: AgentResourceSnapshot;
  history: AgentResourceSample[];
  taskName: string;
  stepName: string;
}) {
  const samples = history.length > 0 ? history : [snapshot];
  const cpuValues = samples.map((sample) => sample.cpuPercent);
  const rssValues = samples.map((sample) => sample.rssBytes);

  return (
    <div className="grid items-center gap-3 py-2 lg:grid-cols-[minmax(0,1.4fr)_92px_92px_104px_104px_80px_70px]">
      <div className="min-w-0">
        <div className="text-ink-0 truncate text-xs font-medium">
          {taskName}
        </div>
        <div className="text-ink-4 truncate text-[10px]">
          {stepName} · {snapshot.backend} · PID {snapshot.rootPid ?? '?'}
        </div>
      </div>
      <span className="text-ink-1 text-right text-xs font-semibold tabular-nums">
        {formatCpu(snapshot.cpuPercent)}
      </span>
      <span className="text-ink-1 text-right text-xs font-semibold tabular-nums">
        {formatBytes(snapshot.rssBytes)}
      </span>
      <Sparkline values={cpuValues} className="text-[oklch(0.74_0.19_295)]" />
      <Sparkline values={rssValues} className="text-[oklch(0.78_0.16_155)]" />
      <span className="text-ink-4 text-right text-xs tabular-nums">
        {snapshot.pids.length} pids
      </span>
      <span className="text-ink-4 text-right text-xs tabular-nums">
        {formatElapsed(snapshot.sampledAt)}
      </span>
    </div>
  );
}

export function ResourcesOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  const { data: memory } = useMemoryUsage();
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

  const totalCpu = supportedSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.cpuPercent,
    0,
  );
  const totalRss = supportedSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.rssBytes,
    0,
  );
  const appCpu = memory
    ? memory.mainProcess.cpuPercent + memory.rendererProcess.cpuPercent
    : 0;

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
          className="border-glass-border shadow-modal text-ink-0 relative flex h-[min(620px,calc(100vh-70px))] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border bg-[#101018]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resources-overlay-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-glass-border relative flex items-center gap-3 border-b bg-gradient-to-b from-sky-400/10 to-transparent px-4 py-3 sm:px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/15 text-sky-200">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                id="resources-overlay-title"
                className="text-ink-0 text-base font-semibold tracking-[-0.03em]"
              >
                Running Session Resources
              </div>
              <div className="text-ink-3 text-xs">
                Live CPU/RAM for tracked agent process trees.
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close resources overlay"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <MetricPill
                  label="Running sessions"
                  value={formatNumber(supportedSnapshots.length)}
                />
                <MetricPill label="Agent CPU" value={formatCpu(totalCpu)} />
                <MetricPill label="Agent RSS" value={formatBytes(totalRss)} />
                <MetricPill
                  label="App CPU"
                  value={memory ? formatCpu(appCpu) : '-'}
                />
                <MetricPill
                  label="App RSS"
                  value={memory ? formatBytes(memory.totalRssBytes) : '-'}
                />
              </div>

              <Panel
                title="Jean-Claude process resources"
                right="main + renderer"
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <MetricPill
                    label="Main CPU"
                    value={
                      memory ? formatCpu(memory.mainProcess.cpuPercent) : '-'
                    }
                  />
                  <MetricPill
                    label="Main RSS"
                    value={
                      memory ? formatBytes(memory.mainProcess.rssBytes) : '-'
                    }
                  />
                  <MetricPill
                    label="Main heap"
                    value={
                      memory
                        ? formatBytes(memory.mainProcess.heapUsedBytes)
                        : '-'
                    }
                  />
                  <MetricPill
                    label="Renderer CPU"
                    value={
                      memory
                        ? formatCpu(memory.rendererProcess.cpuPercent)
                        : '-'
                    }
                  />
                  <MetricPill
                    label="Renderer RSS"
                    value={
                      memory
                        ? formatBytes(memory.rendererProcess.rssBytes)
                        : '-'
                    }
                  />
                  <MetricPill
                    label="Renderer private"
                    value={
                      memory
                        ? formatBytes(memory.rendererProcess.privateBytes)
                        : '-'
                    }
                  />
                </div>
              </Panel>

              <Panel title="Running agent sessions" right="sampled every 2s">
                {supportedSnapshots.length === 0 ? (
                  <div className="text-ink-3 py-10 text-center text-sm">
                    No running tracked sessions.
                  </div>
                ) : (
                  <>
                    <div className="text-ink-4 grid grid-cols-[minmax(0,1.4fr)_92px_92px_104px_104px_80px_70px] gap-3 border-b border-white/8 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase max-lg:hidden">
                      <span>Session</span>
                      <span className="text-right">CPU</span>
                      <span className="text-right">RSS</span>
                      <span>CPU 1h</span>
                      <span>RSS 1h</span>
                      <span className="text-right">Procs</span>
                      <span className="text-right">Sample</span>
                    </div>
                    <div className="divide-y divide-white/6">
                      {supportedSnapshots.map((snapshot, index) => (
                        <SessionRow
                          key={snapshot.stepId}
                          snapshot={snapshot}
                          history={historyByStepId[snapshot.stepId] ?? []}
                          taskName={
                            taskQueries[index]?.data?.name ?? snapshot.taskId
                          }
                          stepName={
                            stepQueries[index]?.data?.name ?? snapshot.stepId
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </Panel>

              {snapshots.some((snapshot) => snapshot.unsupportedReason) ? (
                <Panel title="Unsupported sessions">
                  <div className="space-y-1.5">
                    {snapshots
                      .filter((snapshot) => snapshot.unsupportedReason)
                      .map((snapshot) => (
                        <div
                          key={snapshot.stepId}
                          className="text-ink-3 flex justify-between gap-4 text-xs"
                        >
                          <span className="truncate">{snapshot.stepId}</span>
                          <span className="text-ink-4 shrink-0">
                            {snapshot.unsupportedReason}
                          </span>
                        </div>
                      ))}
                  </div>
                </Panel>
              ) : null}

              <div className="text-ink-4 flex justify-end px-1 text-xs">
                Close <Kbd shortcut="escape" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </FocusLock>
  );
}
