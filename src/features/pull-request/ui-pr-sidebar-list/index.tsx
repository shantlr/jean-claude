import { useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitPullRequest, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useProjects } from '@/hooks/use-projects';
import {
  usePullRequests,
  useAllProjectsPullRequests,
  type PullRequestWithProject,
} from '@/hooks/use-pull-requests';
import { useCurrentAzureUser } from '@/hooks/use-work-items';
import type { AzureDevOpsPullRequest } from '@/lib/api';
import { useProjectFilter, useSidebarTab } from '@/stores/navigation';

import { PrListItem } from '../ui-pr-list-item';

type PrTab = 'my-prs' | 'to-review' | 'completed' | 'abandoned' | 'all';
const PR_TABS: PrTab[] = [
  'my-prs',
  'to-review',
  'completed',
  'abandoned',
  'all',
];

// Display labels for each tab
const TAB_LABELS: Record<PrTab, string> = {
  'my-prs': 'My PRs',
  'to-review': 'To Review',
  completed: 'Completed',
  abandoned: 'Abandoned',
  all: 'All',
};

// Map tab to API status (my-prs and to-review both fetch active PRs)
function getApiStatus(
  tab: PrTab,
): 'active' | 'completed' | 'abandoned' | 'all' {
  if (tab === 'my-prs' || tab === 'to-review') {
    return 'active';
  }
  return tab;
}

// Helper to check if current user is the PR author
function isCurrentUserAuthor(
  pr: AzureDevOpsPullRequest,
  currentUserEmail: string | undefined,
): boolean {
  if (!currentUserEmail) return false;
  // uniqueName is typically the email address
  return (
    pr.createdBy.uniqueName.toLowerCase() === currentUserEmail.toLowerCase()
  );
}

// Section header component for grouping
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-1 py-1.5 text-xs font-medium text-neutral-500">
      {title}
    </div>
  );
}

export function PrSidebarList() {
  const params = useParams({ strict: false });
  const currentPrId = params.prId as string | undefined;
  const { projectFilter } = useProjectFilter();
  const { sidebarTab } = useSidebarTab();
  const { data: projects = [] } = useProjects();

  const [tab, setTab] = useState<PrTab>('my-prs');

  // Navigation helper for PR tabs
  const navigateTab = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = PR_TABS.indexOf(tab);
      const newIndex =
        direction === 'next'
          ? (currentIndex + 1) % PR_TABS.length
          : (currentIndex - 1 + PR_TABS.length) % PR_TABS.length;
      setTab(PR_TABS[newIndex]);
    },
    [tab],
  );

  // Keyboard bindings for PR tab navigation (only when PR sidebar is active)
  useCommands('pr-tab-navigation', [
    sidebarTab === 'prs' && {
      label: 'Next PR Tab',
      shortcut: ']',
      handler: () => navigateTab('next'),
      hideInCommandPalette: true,
    },
    sidebarTab === 'prs' && {
      label: 'Previous PR Tab',
      shortcut: '[',
      handler: () => navigateTab('prev'),
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

  // Determine which data to use
  const isAllView = projectFilter === 'all';

  // Get API status for fetching
  const apiStatus = getApiStatus(tab);

  // Use different hooks based on view mode
  const allProjectsPrs = useAllProjectsPullRequests(
    isAllView ? projectsWithRepo : [],
    apiStatus,
  );

  const singleProjectPrs = usePullRequests(
    !isAllView ? (selectedProject?.id ?? '') : '',
    apiStatus,
  );

  const isLoading = isAllView
    ? allProjectsPrs.isLoading
    : singleProjectPrs.isLoading;

  // Get the provider ID to fetch current user (for "My PRs" vs "To Review" filtering)
  const providerIdForUser = useMemo(() => {
    if (isAllView) {
      // Use the first project with a repo
      return projectsWithRepo[0]?.repoProviderId ?? null;
    }
    return selectedProject?.repoProviderId ?? null;
  }, [isAllView, projectsWithRepo, selectedProject]);

  const { data: currentUser } = useCurrentAzureUser(providerIdForUser);

  // Filter PRs based on selected tab
  const filteredPrs = useMemo(() => {
    const prs = isAllView
      ? (allProjectsPrs.data ?? [])
      : (singleProjectPrs.data ?? []);

    // For my-prs and to-review, filter by author
    if (tab === 'my-prs') {
      return prs.filter((pr) =>
        isCurrentUserAuthor(pr, currentUser?.emailAddress),
      );
    }
    if (tab === 'to-review') {
      return prs.filter(
        (pr) => !isCurrentUserAuthor(pr, currentUser?.emailAddress),
      );
    }

    // For other tabs, return all PRs (already filtered by API status)
    return prs;
  }, [
    tab,
    isAllView,
    allProjectsPrs.data,
    singleProjectPrs.data,
    currentUser?.emailAddress,
  ]);

  // Split PRs into draft and published groups
  const { draftPrs, publishedPrs } = useMemo(() => {
    const draft: typeof filteredPrs = [];
    const published: typeof filteredPrs = [];

    for (const pr of filteredPrs) {
      if (pr.isDraft) {
        draft.push(pr);
      } else {
        published.push(pr);
      }
    }

    return { draftPrs: draft, publishedPrs: published };
  }, [filteredPrs]);

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

  // Get empty state message based on tab
  const getEmptyMessage = () => {
    switch (tab) {
      case 'my-prs':
        return 'No PRs created by you';
      case 'to-review':
        return 'No PRs to review';
      case 'completed':
        return 'No completed PRs';
      case 'abandoned':
        return 'No abandoned PRs';
      case 'all':
        return 'No PRs';
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab filter */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 py-1.5">
        {PR_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
              tab === t
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-2 border-b border-neutral-800" />

      {/* PR list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : filteredPrs.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-neutral-500">
            <GitPullRequest className="h-6 w-6" />
            <p className="text-sm">{getEmptyMessage()}</p>
          </div>
        ) : (
          <>
            {/* Draft PRs section */}
            {draftPrs.length > 0 && (
              <div className="mb-2">
                <SectionHeader title="Draft" />
                <div className="space-y-1">
                  {draftPrs.map((pr) =>
                    isAllView ? (
                      <PrListItem
                        key={`${(pr as PullRequestWithProject).projectId}-${pr.id}`}
                        pr={pr}
                        projectId={(pr as PullRequestWithProject).projectId}
                        isActive={currentPrId === String(pr.id)}
                        basePath="all"
                        projectName={(pr as PullRequestWithProject).projectName}
                        projectColor={
                          (pr as PullRequestWithProject).projectColor
                        }
                      />
                    ) : (
                      <PrListItem
                        key={pr.id}
                        pr={pr}
                        projectId={selectedProject!.id}
                        isActive={currentPrId === String(pr.id)}
                        basePath="project"
                      />
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Published PRs section */}
            {publishedPrs.length > 0 && (
              <div>
                <SectionHeader title="Published" />
                <div className="space-y-1">
                  {publishedPrs.map((pr) =>
                    isAllView ? (
                      <PrListItem
                        key={`${(pr as PullRequestWithProject).projectId}-${pr.id}`}
                        pr={pr}
                        projectId={(pr as PullRequestWithProject).projectId}
                        isActive={currentPrId === String(pr.id)}
                        basePath="all"
                        projectName={(pr as PullRequestWithProject).projectName}
                        projectColor={
                          (pr as PullRequestWithProject).projectColor
                        }
                      />
                    ) : (
                      <PrListItem
                        key={pr.id}
                        pr={pr}
                        projectId={selectedProject!.id}
                        isActive={currentPrId === String(pr.id)}
                        basePath="project"
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
