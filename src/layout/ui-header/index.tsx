import { Link } from '@tanstack/react-router';
import { Loader2, Settings } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';

import { useProjects } from '@/hooks/use-projects';
import { api } from '@/lib/api';
import {
  getRunningJobsCount,
  useBackgroundJobsStore,
} from '@/stores/background-jobs';
import { useProjectFilter } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';

import { UsageDisplay } from './usage-display';

export function Header() {
  const isMac = api.platform === 'darwin';
  const { projectFilter } = useProjectFilter();
  const { data: projects = [] } = useProjects();
  const openOverlay = useOverlaysStore((state) => state.open);
  const jobs = useBackgroundJobsStore((state) => state.jobs);

  const runningJobsCount = useMemo(() => getRunningJobsCount(jobs), [jobs]);

  const selectedProjectLabel = useMemo(() => {
    if (projectFilter === 'all') {
      return 'All Projects';
    }

    const project = projects.find((entry) => entry.id === projectFilter);
    return project?.name ?? 'Unknown Project';
  }, [projectFilter, projects]);

  return (
    <header
      className="flex h-10 items-center"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* Traffic light padding on macOS */}
      {isMac && <div className="w-[70px]" />}

      <div className="flex min-w-0 flex-1 px-2">
        <button
          type="button"
          onClick={() => openOverlay('project-switcher')}
          className="max-w-[320px] cursor-pointer truncate rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-left text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          title={selectedProjectLabel}
        >
          {selectedProjectLabel}
        </button>
      </div>

      {/* Usage display */}
      <div
        className="px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <UsageDisplay />
      </div>

      {/* Background jobs */}
      <div
        className="pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <button
          type="button"
          onClick={() => openOverlay('background-jobs')}
          className="relative flex h-6 items-center gap-1 rounded px-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          {runningJobsCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Loader2 className="h-3.5 w-3.5" />
          )}
          <span>Jobs</span>
          {runningJobsCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
              {runningJobsCount}
            </span>
          )}
        </button>
      </div>

      {/* Settings button */}
      <div
        className="pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <Link
          to="/settings"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <Settings size={16} />
        </Link>
      </div>
    </header>
  );
}
