import {
  ClipboardList,
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
import { api } from '@/lib/api';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { ActivityButton } from './activity-button';
import { CompletionCostDisplay } from './completion-cost-display';
import { NextMeetingButton } from './next-meeting-button';
import { RamUsageDisplay } from './ram-usage-display';
import { UsageDisplay } from './usage-display';

export function Header() {
  const isMac = api.platform === 'darwin';
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isReloadingPreview, setIsReloadingPreview] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
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
                    onConfirm: () => {
                      setReloadError(null);
                      setIsReloadingPreview(true);
                      api.app.reloadPreview().catch((error) => {
                        setReloadError(
                          error instanceof Error
                            ? error.message
                            : 'Reload failed. Check logs for details.',
                        );
                      });
                    },
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
        className="flex shrink-0 items-center gap-1 px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <NextMeetingButton />
        <RamUsageDisplay />
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>

      {isReloadingPreview && (
        <div
          className="bg-bg-0/95 fixed inset-0 z-[9999] flex items-center justify-center px-6 backdrop-blur-md"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <div className="border-glass-border bg-bg-1/90 flex w-full max-w-md flex-col items-center rounded-3xl border px-8 py-10 text-center shadow-2xl shadow-black/50">
            <div className="border-glass-border bg-bg-2 mb-6 rounded-full border p-4 shadow-inner">
              <RefreshCw className="text-acc h-8 w-8 animate-spin" />
            </div>
            <h2 className="text-ink-1 text-lg font-semibold">
              Preparing app reload
            </h2>
            <p className="text-ink-3 mt-3 text-sm leading-6">
              Running pnpm install and rebuilding the preview. The window will
              close only when the updated app is ready to launch.
            </p>
            {reloadError && (
              <>
                <p className="text-status-fail mt-5 text-sm">{reloadError}</p>
                <Button
                  className="mt-6"
                  variant="secondary"
                  onClick={() => {
                    setIsReloadingPreview(false);
                    setReloadError(null);
                  }}
                >
                  Back to app
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
