import {
  ClipboardList,
  X,
  Menu,
  RefreshCw,
  SlidersHorizontal,
  Terminal,
  Workflow,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useModal } from '@/common/context/modal';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { Kbd } from '@/common/ui/kbd';
import { useBacklogProjectId } from '@/hooks/use-backlog-project-id';
import { useProjectTodoCount } from '@/hooks/use-project-todos';
import { useProjects } from '@/hooks/use-projects';
import { api, type ReloadPreviewProgress } from '@/lib/api';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { ActivityButton } from './activity-button';
import { CompletionCostDisplay } from './completion-cost-display';
import { NextMeetingButton } from './next-meeting-button';
import { RamUsageDisplay } from './ram-usage-display';
import { UsageDisplay } from './usage-display';

const reloadStepNumbers: Record<ReloadPreviewProgress['step'], number> = {
  starting: 1,
  'stopping-commands': 2,
  building: 3,
  launching: 4,
  restarting: 5,
};

const initialReloadProgress: ReloadPreviewProgress = {
  step: 'starting',
  label: 'Starting reload',
  detail: 'Preparing preview reload',
};

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
    elapsed: formatReloadElapsed(elapsedMs),
  };
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
  const { elapsed } = useReloadTicker(startedAt);
  const stepNumber = reloadStepNumbers[progress.step];

  useEffect(() => {
    setProgress(initialReloadProgress);
    return api.app.onReloadPreviewProgress((nextProgress) => {
      setProgress(nextProgress);
    });
  }, [startedAt]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[oklch(0.08_0.012_280_/_0.62)] px-6 backdrop-blur-[2px]"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(oklch(1_0_0_/_0.02)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0_/_0.02)_1px,transparent_1px)] bg-[size:28px_28px] opacity-50" />
      {error ? (
        <div
          role="alert"
          aria-label="Reload failed"
          className="reload-fade-up bg-bg-1 border-glass-border relative w-full max-w-[380px] overflow-hidden rounded-[9px] border px-4 pt-3.5 pb-2.5 shadow-[0_24px_60px_oklch(0_0_0_/_0.55),0_0_0_1px_oklch(0_0_0_/_0.4)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-status-fail-soft text-status-fail inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full">
              <X className="h-2 w-2" aria-hidden />
            </span>
            <div className="text-ink-0 min-w-0 flex-1 text-[12.5px] font-medium">
              Build failed
            </div>
            <div className="text-ink-4 font-mono text-[10.5px]">
              rebuild preview
            </div>
          </div>

          <div className="bg-status-fail-soft border-status-fail/25 text-status-fail mt-2 rounded-[5px] border px-2.5 py-2 font-mono text-[10.5px] leading-[1.55] break-words">
            {error}
          </div>

          <div className="border-line-soft mt-2.5 flex items-center justify-between border-t pt-2">
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
        </div>
      ) : (
        <div
          role="status"
          aria-label="Reloading preview"
          className="reload-fade-up bg-bg-1 border-glass-border relative w-full max-w-[360px] overflow-hidden rounded-[9px] border px-4 pt-3.5 pb-3 shadow-[0_24px_60px_oklch(0_0_0_/_0.55),0_0_0_1px_oklch(0_0_0_/_0.4)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-acc relative h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_var(--color-acc)]">
              <span className="reload-ring bg-acc absolute -inset-1 rounded-full opacity-40" />
            </span>
            <div className="text-ink-0 min-w-0 flex-1 text-[12.5px] font-medium">
              Reloading preview
            </div>
            <div className="text-ink-3 font-mono text-[10.5px] tabular-nums">
              {elapsed}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5 overflow-hidden pl-[18px] font-mono text-[11px] whitespace-nowrap">
            <span className="text-ink-4">
              {String(stepNumber).padStart(2, '0')}/05
            </span>
            <span className="text-ink-1">{progress.label}</span>
            {progress.detail && (
              <>
                <span className="text-ink-4">·</span>
                <span className="text-ink-3 truncate">{progress.detail}</span>
              </>
            )}
          </div>

          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="bg-acc h-full rounded-full opacity-80 transition-[width] duration-200"
              style={{ width: `${(stepNumber / 5) * 100}%` }}
              aria-hidden
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const isMac = api.platform === 'darwin';
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isReloadingPreview, setIsReloadingPreview] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadStartedAt, setReloadStartedAt] = useState(() => Date.now());
  const { projectId } = useCurrentVisibleProject();
  const { data: projects = [] } = useProjects();
  const openOverlay = useOverlaysStore((state) => state.open);
  const backlogProjectId = useBacklogProjectId();
  const { data: todoCount } = useProjectTodoCount(backlogProjectId);
  const modal = useModal();
  const commitHash = import.meta.env.VITE_COMMIT_HASH;

  const runCommandRunning = useTaskMessagesStore((s) => s.runCommandRunning);
  const menuDropdownRef = useRef<{ toggle: () => void } | null>(null);

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

  const runningCommandsCount = useMemo(() => {
    let count = 0;
    for (const status of Object.values(runCommandRunning)) {
      for (const cmd of status.commands) {
        if (cmd.status === 'running') count++;
      }
    }
    return count;
  }, [runCommandRunning]);

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
          {backlogProjectId && (
            <DropdownItem
              icon={<ClipboardList />}
              onClick={() => openOverlay('project-backlog')}
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
                      'This will run pnpm install, rebuild, and restart the app. Any unsaved state will be lost.',
                    confirmLabel: 'Reload',
                    variant: 'danger',
                    onConfirm: startPreviewReload,
                  });
                }}
              >
                Reload App
              </DropdownItem>
            </>
          )}
          <DropdownDivider />
          <DropdownInfo label="Build" value={commitHash} />
        </Dropdown>
        {api.app.isDevMode && (
          <div
            className="ml-2 flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-amber-200 shadow-[0_0_16px_oklch(0.8_0.18_80_/_0.22)]"
            title="Jean-Claude is running in development mode"
            aria-label="Development mode"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_oklch(0.8_0.18_80)]" />
            DEV
          </div>
        )}
      </div>

      {/* CENTER — Activity (absolutely centered) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
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
            maxWidth: 'max(0px, calc(50vw - 220px))',
          } as CSSProperties
        }
      >
        <NextMeetingButton />
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
