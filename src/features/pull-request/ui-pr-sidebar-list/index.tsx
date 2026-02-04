import { useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitPullRequest, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useProjects } from '@/hooks/use-projects';
import {
  usePullRequests,
  useAllProjectsPullRequests,
} from '@/hooks/use-pull-requests';
import { useProjectFilter, useSidebarTab } from '@/stores/navigation';

import { PrListItem } from '../ui-pr-list-item';

type PrStatus = 'active' | 'completed' | 'abandoned' | 'all';
const PR_STATUSES: PrStatus[] = ['active', 'completed', 'abandoned', 'all'];

export function PrSidebarList() {
  const params = useParams({ strict: false });
  const currentPrId = params.prId as string | undefined;
  const { projectFilter } = useProjectFilter();
  const { sidebarTab } = useSidebarTab();
  const { data: projects = [] } = useProjects();

  const [status, setStatus] = useState<PrStatus>('active');

  // Navigation helper for PR status
  const navigateStatus = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = PR_STATUSES.indexOf(status);
      const newIndex =
        direction === 'next'
          ? (currentIndex + 1) % PR_STATUSES.length
          : (currentIndex - 1 + PR_STATUSES.length) % PR_STATUSES.length;
      setStatus(PR_STATUSES[newIndex]);
    },
    [status],
  );

  // Keyboard bindings for PR status navigation (only when PR tab is active)
  useCommands('pr-status-navigation', [
    sidebarTab === 'prs' && {
      label: 'Next PR Status',
      shortcut: ']',
      handler: () => navigateStatus('next'),
      hideInCommandPalette: true,
    },
    sidebarTab === 'prs' && {
      label: 'Previous PR Status',
      shortcut: '[',
      handler: () => navigateStatus('prev'),
      hideInCommandPalette: true,
    },
  ]);

  // For "all" view, get all projects with repos
  const projectsWithRepo = useMemo(
    () => projects.filter((p) => p.repoId),
    [projects],
  );

  // Get the selected project (when not in "all" view)
  const selectedProject = useMemo(() => {
    if (projectFilter === 'all') return null;
    return projects.find((p) => p.id === projectFilter) ?? null;
  }, [projectFilter, projects]);

  // Use different hooks based on view mode
  const allProjectsPrs = useAllProjectsPullRequests(
    projectFilter === 'all' ? projectsWithRepo : [],
    status,
  );

  const singleProjectPrs = usePullRequests(
    projectFilter !== 'all' ? (selectedProject?.id ?? '') : '',
    status,
  );

  // Determine which data to use
  const isAllView = projectFilter === 'all';
  const isLoading = isAllView
    ? allProjectsPrs.isLoading
    : singleProjectPrs.isLoading;

  // Check if we have any projects with repo configured
  const hasAnyRepoConfig = projectsWithRepo.length > 0;
  const hasSelectedProjectRepo = !!(
    selectedProject?.repoProviderId &&
    selectedProject?.repoProjectId &&
    selectedProject?.repoId
  );

  // Early return for no repos
  if (isAllView && !hasAnyRepoConfig) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-neutral-500">
        <GitPullRequest className="h-8 w-8" />
        <p className="text-center text-sm">
          No projects with linked repositories
        </p>
      </div>
    );
  }

  if (!isAllView && !hasSelectedProjectRepo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-neutral-500">
        <GitPullRequest className="h-8 w-8" />
        <p className="text-center text-sm">
          This project has no linked repository
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Status filter tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 py-1.5">
        {PR_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={clsx(
              'shrink-0 rounded px-2 py-1 text-xs font-medium capitalize transition-colors',
              status === s
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-neutral-800" />

      {/* PR list */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : isAllView ? (
          // All projects view
          (allProjectsPrs.data?.length ?? 0) === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-neutral-500">
              <GitPullRequest className="h-6 w-6" />
              <p className="text-sm">No {status === 'all' ? '' : status} PRs</p>
            </div>
          ) : (
            allProjectsPrs.data?.map((pr) => (
              <PrListItem
                key={`${pr.projectId}-${pr.id}`}
                pr={pr}
                projectId={pr.projectId}
                isActive={currentPrId === String(pr.id)}
                basePath="all"
                projectName={pr.projectName}
                projectColor={pr.projectColor}
              />
            ))
          )
        ) : // Single project view
        (singleProjectPrs.data?.length ?? 0) === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-neutral-500">
            <GitPullRequest className="h-6 w-6" />
            <p className="text-sm">No {status === 'all' ? '' : status} PRs</p>
          </div>
        ) : (
          singleProjectPrs.data?.map((pr) => (
            <PrListItem
              key={pr.id}
              pr={pr}
              projectId={selectedProject!.id}
              isActive={currentPrId === String(pr.id)}
              basePath="project"
            />
          ))
        )}
      </div>
    </div>
  );
}
