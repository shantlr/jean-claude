import {
  Activity,
  BarChart3,
  ClipboardList,
  History,
  Menu,
  RefreshCw,
  SlidersHorizontal,
  Terminal,
  Workflow,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api, type ReloadPreviewProgress } from '@/lib/api';
import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useBacklogSelectedProjectId } from '@/stores/backlog-overlay-draft';
import { useChangelogStore } from '@/stores/changelog';
import { useCommands } from '@/common/hooks/use-commands';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useModal } from '@/common/context/modal';
import { useOverlaysStore } from '@/stores/overlays';
import { useProjects } from '@/hooks/use-projects';
import { useProjectTodoCount } from '@/hooks/use-project-todos';
import { useTaskMessagesStore } from '@/stores/task-messages';



import { ActivityButton } from './activity-button';
import { CompletionCostDisplay } from './completion-cost-display';
import { NextMeetingButton } from './next-meeting-button';
import { RamUsageDisplay } from './ram-usage-display';
import { UsageDisplay } from './usage-display';

const reloadStepNumbers: Record<ReloadPreviewProgress['step'], number> = {
  starting: 1,
  'stopping-commands': 2,
  pulling: 3,
  building: 4,
  launching: 5,
  restarting: 6,
};

const reloadStepCount = 6;

const initialReloadProgress: ReloadPreviewProgress = {
  step: 'starting',
  label: 'Starting reload',
  detail: 'Preparing preview reload',
};

const reloadSteps: Array<{
  step: ReloadPreviewProgress['step'];
  label: string;
  command: string;
}> = [
  { step: 'starting', label: 'Preparing reload', command: 'preview reload' },
  {
    step: 'stopping-commands',
    label: 'Stopping commands',
    command: 'stop running commands',
  },
  { step: 'pulling', label: 'Pulling latest changes', command: 'git pull' },
  {
    step: 'building',
    label: 'Installing and building',
    command: 'pnpm install && pnpm build',
  },
  {
    step: 'launching',
    label: 'Launching preview',
    command: 'pnpm preview:skip-build',
  },
  { step: 'restarting', label: 'Restarting app', command: 'app exit' },
];

const DEFAULT_ACTIVITY_RESERVE_PX = 220;
const ACTIVITY_GAP_PX = 30;

function formatReloadElapsed(ms: number) {
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function useReloadTicker(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const elapsedMs = Math.max(0, now - startedAt);

  return {
    elapsedMs,
    elapsed: formatReloadElapsed(elapsedMs),
    now,
  };
}

function ReloadStatusGlyph({
  state,
}: {
  state: 'done' | 'run' | 'fail' | 'pending';
}) {
  if (state === 'done') {
    return (
      <span className="bg-status-done-soft text-status-done inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full">
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <path
            d="M1.5 4.2 L3.3 6 L6.7 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (state === 'run') {
    return (
      <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full">
        <span className="reload-ring bg-acc absolute inset-0 rounded-full opacity-55" />
        <span className="bg-acc h-[7px] w-[7px] rounded-full" />
      </span>
    );
  }

  if (state === 'fail') {
    return (
      <span className="bg-status-fail-soft text-status-fail inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full">
        <X className="h-2 w-2" aria-hidden />
      </span>
    );
  }

  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full">
      <span className="border-ink-4 h-1.5 w-1.5 rounded-full border" />
    </span>
  );
}

function ReloadPreviewModal({
  error,
  startedAt,
  onBack,
  onRetry,
}: {
  error: string | null;
  startedAt: number;
  onBack: () => void;
  onRetry: () => void;
}) {
  useKeyboardLayer('dialog', { exclusive: true });

  const [progress, setProgress] = useState<ReloadPreviewProgress>(
    initialReloadProgress,
  );
  const progressRef = useRef<ReloadPreviewProgress>(initialReloadProgress);
  const [stepStartedAt, setStepStartedAt] = useState(startedAt);
  const stepStartedAtRef = useRef(startedAt);
  const [stepDurations, setStepDurations] = useState<
    Partial<Record<ReloadPreviewProgress['step'], number>>
  >({});
  const { elapsed, now } = useReloadTicker(startedAt);
  const stepNumber = reloadStepNumbers[progress.step];
  const activeStepIndex = Math.max(0, stepNumber - 1);
  const failedStepIndex = error ? activeStepIndex : -1;
  const connectorFillSteps = error
    ? failedStepIndex
    : Math.min(reloadStepCount - 1, activeStepIndex);

  useEffect(() => {
    startTransition(() => setProgress(initialReloadProgress));
    progressRef.current = initialReloadProgress;
    startTransition(() => setStepStartedAt(startedAt));
    stepStartedAtRef.current = startedAt;
    startTransition(() => setStepDurations({}));
    return api.app.onReloadPreviewProgress((nextProgress) => {
      const currentProgress = progressRef.current;
      if (currentProgress.step !== nextProgress.step) {
        const nextStartedAt = Date.now();
        setStepDurations((durations) => ({
          ...durations,
          [currentProgress.step]: nextStartedAt - stepStartedAtRef.current,
        }));
        stepStartedAtRef.current = nextStartedAt;
        setStepStartedAt(nextStartedAt);
      }
      progressRef.current = nextProgress;
      setProgress(nextProgress);
    });
  }, [startedAt]);

  const activeStepElapsed = now - stepStartedAt;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[oklch(0.08_0.012_280_/_0.62)] px-6 backdrop-blur-[2px]"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(oklch(1_0_0_/_0.02)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0_/_0.02)_1px,transparent_1px)] bg-[size:28px_28px] opacity-50" />
      <div
        role={error ? 'alert' : 'status'}
        aria-label={error ? 'Reload failed' : 'Reloading preview'}
        className="reload-fade-up bg-bg-1 border-glass-border relative w-full max-w-[420px] overflow-hidden rounded-[9px] border shadow-[0_24px_60px_oklch(0_0_0_/_0.55),0_0_0_1px_oklch(0_0_0_/_0.4)]"
      >
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
          <ReloadStatusGlyph state={error ? 'fail' : 'run'} />
          <div className="text-ink-0 min-w-0 flex-1 text-[12.5px] font-medium">
            {error ? 'Reload failed' : 'Reloading preview'}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10.5px] tabular-nums">
            <span className="text-ink-4">
              {String(stepNumber).padStart(2, '0')}/
              {String(reloadStepCount).padStart(2, '0')}
            </span>
            <span className="text-ink-3">{elapsed}</span>
          </div>
        </div>

        <div className="relative px-4 pt-1.5 pb-2.5">
          <div
            className="absolute top-[19px] bottom-[23px] left-6 w-px bg-white/[0.07]"
            aria-hidden
          />
          <div
            className={`absolute top-[19px] left-6 w-px opacity-50 ${
              error ? 'bg-status-fail' : 'bg-acc'
            }`}
            style={{ height: `${connectorFillSteps * 26}px` }}
            aria-hidden
          />

          {reloadSteps.map((step, index) => {
            const isActive = index === activeStepIndex;
            const isFailed = index === failedStepIndex;
            const isDone = index < activeStepIndex && !isFailed;
            const isPending = index > activeStepIndex;
            const state = isFailed
              ? 'fail'
              : isDone
                ? 'done'
                : isActive
                  ? 'run'
                  : 'pending';
            const detail =
              isActive && progress.detail ? progress.detail : step.command;
            const rowElapsed = isDone
              ? formatReloadElapsed(stepDurations[step.step] ?? 0)
              : isActive && !error
                ? formatReloadElapsed(activeStepElapsed)
                : isFailed
                  ? 'failed'
                  : '';

            return (
              <div
                key={step.step}
                className={`relative z-10 grid h-[26px] grid-cols-[16px_18px_minmax(0,1fr)_42px] items-center gap-2 ${
                  isPending ? 'opacity-50' : ''
                }`}
              >
                <span className="bg-bg-1 inline-flex items-center justify-center rounded-full">
                  <ReloadStatusGlyph state={state} />
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    isFailed
                      ? 'text-status-fail'
                      : isActive
                        ? 'text-acc-ink'
                        : 'text-ink-4'
                  }`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
                  <span
                    className={`shrink-0 text-[12px] ${
                      isFailed
                        ? 'text-status-fail font-medium'
                        : isActive
                          ? 'text-ink-0 font-medium'
                          : isDone
                            ? 'text-ink-1'
                            : 'text-ink-3'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-ink-4 text-[11px]">·</span>
                  <span
                    className={`truncate font-mono text-[10.5px] ${
                      isFailed
                        ? 'text-status-fail/75'
                        : isActive
                          ? 'text-ink-2'
                          : 'text-ink-4'
                    }`}
                  >
                    {detail}
                  </span>
                </div>
                <span
                  className={`text-right font-mono text-[10px] tabular-nums ${
                    isFailed
                      ? 'text-status-fail'
                      : isActive
                        ? 'text-acc-ink'
                        : isDone
                          ? 'text-ink-3'
                          : 'text-ink-4'
                  }`}
                >
                  {rowElapsed}
                </span>
              </div>
            );
          })}
        </div>

        {error ? (
          <>
            <div className="bg-status-fail-soft border-status-fail/25 text-status-fail mx-4 mb-3 rounded-[5px] border px-2.5 py-2 font-mono text-[10.5px] leading-[1.55] break-words">
              {error}
            </div>
            <div className="border-line-soft flex items-center justify-between border-t bg-white/[0.012] px-4 py-2.5">
              <span className="text-ink-4 text-[10.5px]">
                Previous preview still running
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onBack}
                  className="text-ink-3 hover:bg-glass-medium rounded px-2 py-1 text-[11px]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="border-acc-line bg-acc-soft text-acc-ink rounded border px-2.5 py-1 text-[11px] font-medium"
                >
                  Retry
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 pb-3">
            <div className="h-0.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="bg-acc h-full rounded-full opacity-90 transition-[width] duration-300"
                style={{ width: `${(stepNumber / reloadStepCount) * 100}%` }}
                aria-hidden
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Header() {
  const isMac = api.platform === 'darwin';
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isReloadingPreview, setIsReloadingPreview] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadUpdateCount, setReloadUpdateCount] = useState<number | null>(
    null,
  );
  const [reloadStartedAt, setReloadStartedAt] = useState(() => Date.now());
  const { projectId } = useCurrentVisibleProject();
  const { data: projects = [] } = useProjects();
  const openOverlay = useOverlaysStore((state) => state.open);
  const openChangelog = useChangelogStore((state) => state.open);
  const persistedBacklogProjectId = useBacklogSelectedProjectId();
  const backlogProjectId = projects.some(
    (project) => project.id === persistedBacklogProjectId,
  )
    ? persistedBacklogProjectId
    : projects[0]?.id;
  const { data: todoCount } = useProjectTodoCount(backlogProjectId);
  const modal = useModal();
  const commitHash = import.meta.env.VITE_COMMIT_HASH;
  const devBadgeLabel = api.app.devBadgeLabel ?? 'DEV';

  const runningCommandsCount = useTaskMessagesStore((s) => {
    let count = 0;
    for (const status of Object.values(s.runCommandRunning)) {
      for (const cmd of status.commands) {
        if (cmd.status === 'running') count++;
      }
    }
    return count;
  });
  const menuDropdownRef = useRef<{ toggle: () => void } | null>(null);
  const activityButtonRef = useRef<HTMLDivElement | null>(null);
  const reloadUpdateRequestRef = useRef(0);
  const [activityWidth, setActivityWidth] = useState(0);

  useLayoutEffect(() => {
    const element = activityButtonRef.current;
    if (!element) return;

    const updateActivityWidth = () => {
      setActivityWidth(Math.ceil(element.getBoundingClientRect().width));
    };

    updateActivityWidth();

    const resizeObserver = new ResizeObserver(updateActivityWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  const activityReservePx = activityWidth
    ? activityWidth / 2 + ACTIVITY_GAP_PX
    : DEFAULT_ACTIVITY_RESERVE_PX;

  useCommands('header-menu-trigger', [
    {
      shortcut: 'cmd+\\',
      label: 'Toggle Menu',
      section: 'General',
      handler: () => {
        menuDropdownRef.current?.toggle();
      },
    },
  ]);

  const startPreviewReload = () => {
    setReloadError(null);
    setReloadStartedAt(Date.now());
    setIsReloadingPreview(true);
    api.app.reloadPreview().catch((error) => {
      setReloadError(
        error instanceof Error ? error.message : 'Reload failed. Check logs.',
      );
    });
  };

  const refreshReloadUpdateInfo = useCallback(() => {
    if (!isPreviewMode || !commitHash) return;

    const requestId = reloadUpdateRequestRef.current + 1;
    reloadUpdateRequestRef.current = requestId;
    setReloadUpdateCount(null);
    api.app
      .getReloadUpdateInfo({ builtCommitHash: commitHash })
      .then((info) => {
        if (reloadUpdateRequestRef.current === requestId) {
          setReloadUpdateCount(info.commitCount);
        }
      })
      .catch(() => {
        if (reloadUpdateRequestRef.current === requestId) {
          setReloadUpdateCount(null);
        }
      });
  }, [commitHash, isPreviewMode]);

  const selectedProjectLabel = useMemo(() => {
    if (projectId === 'all') {
      return 'All Projects';
    }

    const project = projects.find((entry) => entry.id === projectId);
    return project?.name ?? 'Unknown Project';
  }, [projectId, projects]);

  useEffect(() => {
    let isCancelled = false;

    const syncFullscreenState = async () => {
      const isFullscreen = await api.windowState.getIsFullscreen();
      if (!isCancelled) {
        setIsWindowFullscreen(isFullscreen);
      }
    };

    syncFullscreenState().catch(() => {
      if (!isCancelled) {
        setIsWindowFullscreen(false);
      }
    });

    api.app.getIsPreviewMode().then((preview) => {
      if (!isCancelled) setIsPreviewMode(preview);
    });

    const unsubscribe = api.windowState.onFullscreenChange((isFullscreen) => {
      setIsWindowFullscreen(isFullscreen);
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <header
      className="relative flex h-10 items-center"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* LEFT — traffic lights + menu */}
      {isMac && !isWindowFullscreen && <div className="w-[70px] shrink-0" />}
      <div
        className="flex min-w-0 items-center px-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <Dropdown
          dropdownRef={menuDropdownRef}
          onOpen={refreshReloadUpdateInfo}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              icon={<Menu />}
              title="Menu"
              aria-label="Open menu"
            >
              Menu
              <Kbd shortcut="cmd+\" className="text-[9px]" />
            </Button>
          }
          align="left"
        >
          <DropdownItem
            icon={<SlidersHorizontal />}
            onClick={() => openOverlay('settings')}
            shortcut="cmd+,"
          >
            Settings
          </DropdownItem>
          <DropdownItem
            onClick={() => openOverlay('project-switcher')}
            shortcut="cmd+o"
          >
            {selectedProjectLabel}
          </DropdownItem>
          {projects.length > 0 && (
            <DropdownItem
              icon={<ClipboardList />}
              onClick={() => openOverlay('backlog')}
              shortcut="cmd+b"
            >
              Backlog
              {typeof todoCount === 'number' && todoCount > 0 && (
                <span className="bg-glass-medium text-ink-2 ml-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                  {todoCount}
                </span>
              )}
            </DropdownItem>
          )}
          <DropdownItem
            icon={<Workflow />}
            onClick={() => openOverlay('pipelines')}
            shortcut="cmd+shift+y"
          >
            Pipelines
          </DropdownItem>
          <DropdownItem icon={<History />} onClick={openChangelog}>
            Changelog
          </DropdownItem>
          <DropdownItem
            icon={<Terminal />}
            onClick={() => openOverlay('running-commands')}
            shortcut="cmd+shift+r"
          >
            Commands
            {runningCommandsCount > 0 && (
              <span className="bg-acc text-bg-0 ml-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none shadow-[0_0_6px_oklch(0.6_0.2_264)]">
                {runningCommandsCount}
              </span>
            )}
          </DropdownItem>
          {isPreviewMode && (
            <>
              <DropdownDivider />
              <DropdownItem
                icon={<RefreshCw />}
                onClick={() => {
                  modal.confirm({
                    title: 'Reload App',
                    content:
                      'This will pull latest changes, run pnpm install, rebuild, and restart the app. Any unsaved state will be lost.',
                    confirmLabel: 'Reload',
                    variant: 'danger',
                    onConfirm: startPreviewReload,
                  });
                }}
              >
                <span className="flex w-full items-center">
                  Reload App
                  {typeof reloadUpdateCount === 'number' &&
                    reloadUpdateCount > 0 && (
                      <span className="bg-acc text-bg-0 ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none shadow-[0_0_6px_oklch(0.6_0.2_264)]">
                        {reloadUpdateCount}
                      </span>
                    )}
                </span>
              </DropdownItem>
            </>
          )}
          <DropdownDivider />
          <DropdownInfo label="Build" value={commitHash} />
        </Dropdown>
        <Button
          variant="ghost"
          size="sm"
          icon={<BarChart3 />}
          title="AI usage"
          aria-label="Open AI usage"
          onClick={() => openOverlay('usage')}
          className="ml-1 px-2"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Activity />}
          title="Work activity"
          aria-label="Open work activity"
          onClick={() => openOverlay('work-activity')}
          className="px-2"
        />
        <NextMeetingButton />
        {api.app.isDevMode && (
          <div
            className="group relative ml-2 flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-amber-200 shadow-[0_0_16px_oklch(0.8_0.18_80_/_0.22)]"
            aria-label="Development mode"
            aria-describedby="dev-mode-tooltip"
            title={devBadgeLabel}
            tabIndex={0}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_oklch(0.8_0.18_80)]" />
            <span className="max-w-24 truncate">{devBadgeLabel}</span>
            <span
              id="dev-mode-tooltip"
              role="tooltip"
              className="bg-bg-1 pointer-events-none absolute top-[calc(100%+0.5rem)] left-1/2 z-50 w-64 -translate-x-1/2 rounded-lg border border-amber-400/40 px-3 py-2 text-center text-[11px] leading-snug font-medium tracking-normal text-amber-100 opacity-0 shadow-[0_12px_32px_oklch(0_0_0_/_0.35),0_0_18px_oklch(0.8_0.18_80_/_0.18)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <span className="mb-1 block text-[12px] font-bold tracking-[0.08em] text-amber-200 uppercase">
                {devBadgeLabel}
              </span>
              Jean-Claude is running in dev mode. Use pnpm preview instead if
              you want to use the app.
            </span>
          </div>
        )}
      </div>

      {/* CENTER — Activity (absolutely centered) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={activityButtonRef}
          className="pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <ActivityButton />
        </div>
      </div>

      {/* Spacer to push telemetry right */}
      <div className="flex-1" />

      {/* RIGHT — telemetry */}
      <div
        className="flex min-w-0 items-center justify-end gap-1 overflow-hidden px-4"
        style={
          {
            WebkitAppRegion: 'no-drag',
            maxWidth: `max(0px, calc(50vw - ${activityReservePx}px))`,
          } as CSSProperties
        }
      >
        <RamUsageDisplay />
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>

      {isReloadingPreview && (
        <ReloadPreviewModal
          error={reloadError}
          startedAt={reloadStartedAt}
          onBack={() => {
            setIsReloadingPreview(false);
            setReloadError(null);
          }}
          onRetry={startPreviewReload}
        />
      )}
    </header>
  );
}
