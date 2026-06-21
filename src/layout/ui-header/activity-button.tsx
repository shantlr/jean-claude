import { Check, Loader2, X } from 'lucide-react';
import { type ReactNode, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';


import {
  initNotificationsStore,
  useNotificationsStore,
} from '@/stores/notifications';
import { Kbd } from '@/common/ui/kbd';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useDebugLogsListener } from '@/stores/debug-logs';
import { useOverlaysStore } from '@/stores/overlays';
import { useProjects } from '@/hooks/use-projects';


const CYCLE_INTERVAL_MS = 3000;

export function ActivityButton() {
  const toggle = useOverlaysStore((s) => s.toggle);
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'activity-center');

  const jobs = useBackgroundJobsStore((s) => s.jobs);
  const notifications = useNotificationsStore((s) => s.notifications);

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === 'running'),
    [jobs],
  );
  const runningCount = runningJobs.length;
  const isRunning = runningCount > 0;

  // Cycle through running job titles
  const [cycleIndex, setCycleIndex] = useState(0);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning) {
      startTransition(() => setCycleIndex(0));
      return;
    }
    cycleRef.current = setInterval(() => {
      setCycleIndex((prev) => prev + 1);
    }, CYCLE_INTERVAL_MS);
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [isRunning]);

  // Init notifications + debug logs listener
  useEffect(() => {
    initNotificationsStore();
  }, []);
  useDebugLogsListener();

  const { data: projects } = useProjects();
  const projectMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    if (projects) {
      for (const p of projects) map.set(p.id, { name: p.name, color: p.color });
    }
    return map;
  }, [projects]);

  // Determine left-side content
  let leftIcon: ReactNode;
  let leftLabel: string;
  let leftProject: { name: string; color: string } | null = null;

  if (isRunning) {
    const currentJob = runningJobs[cycleIndex % runningJobs.length];
    leftIcon = <Loader2 className="text-acc h-3 w-3 shrink-0 animate-spin" />;
    leftLabel = currentJob?.title ?? 'Working...';
    if (currentJob?.projectId) {
      leftProject = projectMap.get(currentJob.projectId) ?? null;
    }
  } else {
    // Find latest notification or finished job
    const latestNotification = notifications[0];
    const latestFinishedJob = jobs.find(
      (j) => j.status === 'succeeded' || j.status === 'failed',
    );

    if (latestFinishedJob) {
      const isFailed = latestFinishedJob.status === 'failed';
      leftIcon = isFailed ? (
        <X className="text-status-fail h-3 w-3 shrink-0" />
      ) : (
        <Check className="text-status-done h-3 w-3 shrink-0" />
      );
      leftLabel = latestFinishedJob.title;
      if (latestFinishedJob.projectId) {
        leftProject = projectMap.get(latestFinishedJob.projectId) ?? null;
      }
    } else if (latestNotification) {
      const isFailed = latestNotification.type.includes('failed');
      leftIcon = isFailed ? (
        <X className="text-status-fail h-3 w-3 shrink-0" />
      ) : (
        <Check className="text-status-done h-3 w-3 shrink-0" />
      );
      leftLabel = latestNotification.title;
      if (latestNotification.projectId) {
        leftProject = projectMap.get(latestNotification.projectId) ?? null;
      }
    } else {
      leftIcon = null;
      leftLabel = 'No activity';
    }
  }

  return (
    <button
      type="button"
      data-animation-target="jobs-button"
      onClick={() => toggle('activity-center')}
      className={clsx(
        'flex h-6 max-w-[380px] items-center overflow-hidden rounded-[5px] border text-[11px] transition-colors',
        isOpen
          ? 'bg-bg-2 border-glass-border-strong'
          : 'bg-glass-subtle border-glass-border hover:bg-glass-light',
        isRunning && !isOpen && 'border-acc/50 bg-acc/8 animate-activity-glow',
      )}
    >
      {/* Left side - live state */}
      <div className="flex min-w-0 items-center gap-1.5 px-2">
        {leftIcon}
        {leftProject && (
          <span
            className="shrink-0 rounded-[3px] px-1 py-px font-mono text-[9px]"
            style={{
              background: `color-mix(in oklch, ${leftProject.color} 14%, transparent)`,
              color: leftProject.color,
            }}
          >
            {leftProject.name}
          </span>
        )}
        <span className="text-ink-1 max-w-[180px] truncate">{leftLabel}</span>
      </div>

      {/* Divider */}
      <div className="bg-glass-border h-3.5 w-px shrink-0" />

      {/* Right side - count + label + shortcut */}
      <div
        className={clsx(
          'flex items-center gap-1.5 px-2',
          isRunning && 'bg-acc/12 rounded-r-[4px]',
        )}
      >
        {isRunning && (
          <>
            <span className="bg-acc relative h-1.5 w-1.5 rounded-full">
              <span className="bg-acc absolute inset-0 animate-ping rounded-full opacity-75" />
            </span>
            <span className="text-acc text-[11px] font-medium tabular-nums">
              {runningCount}
            </span>
          </>
        )}
        <span className="text-ink-3 text-[11px]">Activity</span>
        <Kbd shortcut="cmd+j" className="ml-0.5" />
      </div>
    </button>
  );
}
