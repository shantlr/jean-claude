import clsx from 'clsx';
import {
  ClipboardList,
  Loader2,
  Menu,
  SlidersHorizontal,
  Terminal,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@/common/ui/button';
import { Dropdown, DropdownItem } from '@/common/ui/dropdown';
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
import { useTaskMessagesStore } from '@/stores/task-messages';

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

  const runCommandRunning = useTaskMessagesStore((s) => s.runCommandRunning);
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

      <div
        className="flex min-w-0 flex-1 px-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <Dropdown
          trigger={
            <Button
              variant="ghost"
              size="sm"
              icon={<Menu />}
              title="Menu"
              aria-label="Open menu"
            >
              Menu
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
        </Dropdown>
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
          variant="ghost"
          size="sm"
          data-animation-target="jobs-button"
          onClick={() => openOverlay('background-jobs')}
          className={clsx(
            'relative transition-all duration-500',
            runningJobsCount > 0
              ? 'jobs-running-border text-bg-0'
              : 'text-ink-2 hover:border-glass-border-strong hover:text-bg-0 border border-white/[0.08] bg-white/5 hover:bg-white/10',
          )}
        >
          {runningJobsCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Loader2 className="h-3.5 w-3.5" />
          )}
          <span>Jobs</span>
          <Kbd shortcut="cmd+j" className="text-[9px]" />
          {runningJobsCount > 0 && (
            <span className="bg-acc text-bg-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none shadow-[0_0_6px_oklch(0.6_0.2_264)]">
              {runningJobsCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
