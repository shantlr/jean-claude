import clsx from 'clsx';
import { ClipboardList, Loader2, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { useBacklogProjectId } from '@/hooks/use-backlog-project-id';
import { useProjectTodoCount } from '@/hooks/use-project-todos';
import { useProjects } from '@/hooks/use-projects';
import { api } from '@/lib/api';
import {
  getRunningJobsCount,
  useBackgroundJobsStore,
} from '@/stores/background-jobs';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';

import { CompletionCostDisplay } from './completion-cost-display';
import { NotificationBar } from './notification-bar';
import { RamUsageDisplay } from './ram-usage-display';
import { UsageDisplay } from './usage-display';

export function Header() {
  const isMac = api.platform === 'darwin';
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const { projectId } = useCurrentVisibleProject();
  const { data: projects = [] } = useProjects();
  const openOverlay = useOverlaysStore((state) => state.open);
  const jobs = useBackgroundJobsStore((state) => state.jobs);
  const backlogProjectId = useBacklogProjectId();
  const { data: todoCount } = useProjectTodoCount(backlogProjectId);

  const runningJobsCount = useMemo(() => getRunningJobsCount(jobs), [jobs]);

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
      className="flex h-10 items-center"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* Traffic light padding on macOS */}
      {isMac && !isWindowFullscreen && <div className="w-[70px]" />}

      <div className="flex min-w-0 flex-1 px-2">
        <Button
          type="button"
          onClick={() => openOverlay('settings')}
          className="mr-2 flex h-7 shrink-0 items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          title="Settings"
          aria-label="Open settings"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-xs">Settings</span>
          <Kbd shortcut="cmd+," className="text-[9px]" />
        </Button>

        <Button
          type="button"
          onClick={() => openOverlay('project-switcher')}
          className="flex max-w-[320px] cursor-pointer items-center gap-1.5 truncate rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-left text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          title={selectedProjectLabel}
        >
          <span className="truncate">{selectedProjectLabel}</span>
          <Kbd shortcut="cmd+o" className="text-[9px]" />
        </Button>

        {backlogProjectId && (
          <Button
            type="button"
            onClick={() => openOverlay('project-backlog')}
            className="ml-2 flex h-7 shrink-0 items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            title="Backlog"
            aria-label="Open backlog"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="text-xs">Backlog</span>
            {typeof todoCount === 'number' && todoCount > 0 && (
              <span className="rounded-full bg-neutral-700/60 px-1.5 py-0.5 text-[10px] leading-none text-neutral-400">
                {todoCount}
              </span>
            )}
            <Kbd shortcut="cmd+b" className="text-[9px]" />
          </Button>
        )}
      </div>

      {/* Notification bar + Usage display */}
      <div
        className="flex items-center gap-1 px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <NotificationBar />
        <RamUsageDisplay />
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>

      {/* Background jobs */}
      <div
        className="pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <Button
          type="button"
          data-animation-target="jobs-button"
          onClick={() => openOverlay('background-jobs')}
          className={clsx(
            'relative flex h-6 items-center gap-1 rounded-lg px-2 text-xs transition-all duration-500',
            runningJobsCount > 0
              ? 'jobs-running-border text-white'
              : 'border border-white/[0.08] bg-white/5 text-neutral-400 hover:border-white/[0.15] hover:bg-white/10 hover:text-white',
          )}
        >
          {runningJobsCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Loader2 className="h-3.5 w-3.5" />
          )}
          <span>Jobs</span>
          {runningJobsCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white shadow-[0_0_6px_rgba(59,130,246,0.4)]">
              {runningJobsCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
