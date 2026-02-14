import { useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { SidebarContentTabs } from '@/features/project/ui-sidebar-content-tabs';
import { PrSidebarList } from '@/features/pull-request/ui-pr-sidebar-list';
import { TaskSummaryCard } from '@/features/task/ui-task-summary-card';
import { useProjects } from '@/hooks/use-projects';
import { useAllActiveTasks, useAllCompletedTasks } from '@/hooks/use-tasks';
import { useCurrentVisibleProject, useSidebarTab } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';

const COMPLETED_TASKS_PAGE_SIZE = 5;

export function TaskList() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;

  const { data: projects = [] } = useProjects();
  const { data: activeTasks = [] } = useAllActiveTasks();
  const {
    data: completedTasksData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllCompletedTasks({ limit: COMPLETED_TASKS_PAGE_SIZE });
  const { projectId } = useCurrentVisibleProject();
  const { sidebarTab } = useSidebarTab();
  const toggleSettings = useOverlaysStore((s) => s.toggle);

  // Flatten completed tasks from paginated data
  const completedTasks = useMemo(
    () => completedTasksData?.pages.flatMap((page) => page.tasks) ?? [],
    [completedTasksData],
  );

  // Filter tasks by selected project
  const filteredActiveTasks = useMemo(
    () =>
      projectId === 'all'
        ? activeTasks
        : activeTasks.filter((t) => t.projectId === projectId),
    [activeTasks, projectId],
  );

  const filteredCompletedTasks = useMemo(
    () =>
      projectId === 'all'
        ? completedTasks
        : completedTasks.filter((t) => t.projectId === projectId),
    [completedTasks, projectId],
  );

  // Navigation helpers
  const navigateToTask = useCallback(
    (index: number) => {
      const task = filteredActiveTasks[index];
      if (task) {
        // If we're in "all" view, stay in all view
        if (projectId === 'all') {
          navigate({
            to: '/all/$taskId',
            params: { taskId: task.id },
          });
        } else {
          navigate({
            to: '/projects/$projectId/tasks/$taskId',
            params: { projectId: task.projectId, taskId: task.id },
          });
        }
      }
    },
    [filteredActiveTasks, navigate, projectId],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next') => {
      if (filteredActiveTasks.length === 0) return;
      const currentIndex = filteredActiveTasks.findIndex(
        (t) => t.id === currentTaskId,
      );
      let newIndex: number;
      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : filteredActiveTasks.length - 1;
      } else {
        newIndex =
          direction === 'next'
            ? (currentIndex + 1) % filteredActiveTasks.length
            : (currentIndex - 1 + filteredActiveTasks.length) %
              filteredActiveTasks.length;
      }
      navigateToTask(newIndex);
    },
    [filteredActiveTasks, currentTaskId, navigateToTask],
  );

  const selectedTask = useMemo(() => {
    return (
      activeTasks.find((t) => t.id === currentTaskId) ??
      completedTasks.find((t) => t.id === currentTaskId)
    );
  }, [activeTasks, completedTasks, currentTaskId]);

  // Get selected project for settings button
  // Show project settings based on:
  // 1. If a specific project filter is active, use that project
  // 2. If "all" filter is active and a task is selected, use that task's project
  const selectedProject = useMemo(() => {
    if (projectId !== 'all') {
      return projects.find((p) => p.id === projectId) ?? null;
    }
    // In "all" view, derive from selected task
    if (currentTaskId) {
      if (selectedTask) {
        return projects.find((p) => p.id === selectedTask.projectId) ?? null;
      }
    }
    return null;
  }, [projectId, currentTaskId, projects, selectedTask]);

  // Determine if we should show the Tasks/PRs tabs
  // Show only in "all" view OR when selected project has a repo
  const showContentTabs = useMemo(() => {
    if (projectId === 'all') {
      // In "all" view, show tabs if any project has a repo
      return projects.some((p) => p.repoId);
    }
    // In specific project view, show tabs if that project has a repo
    const project = projects.find((p) => p.id === projectId);
    return !!project?.repoId;
  }, [projectId, projects]);

  // Keyboard bindings for task navigation
  useCommands('task-list-navigation', [
    {
      label: 'Go to Task 1',
      shortcut: 'cmd+1',
      handler: () => {
        navigateToTask(0);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 2',
      shortcut: 'cmd+2',
      handler: () => {
        navigateToTask(1);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 3',
      shortcut: 'cmd+3',
      handler: () => {
        navigateToTask(2);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 4',
      shortcut: 'cmd+4',
      handler: () => {
        navigateToTask(3);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 5',
      shortcut: 'cmd+5',
      handler: () => {
        navigateToTask(4);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 6',
      shortcut: 'cmd+6',
      handler: () => {
        navigateToTask(5);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 7',
      shortcut: 'cmd+7',
      handler: () => {
        navigateToTask(6);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 8',
      shortcut: 'cmd+8',
      handler: () => {
        navigateToTask(7);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Task 9',
      shortcut: 'cmd+9',
      handler: () => {
        navigateToTask(8);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Previous Task',
      shortcut: 'cmd+up',
      handler: () => {
        navigateRelative('prev');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Next Task',
      shortcut: 'cmd+down',
      handler: () => {
        navigateRelative('next');
      },
      hideInCommandPalette: true,
    },
    !!selectedProject && {
      label: 'Open Project Settings',
      handler: () => {
        toggleSettings('settings');
      },
    },
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Task/PR content tabs - only show when applicable */}
      {showContentTabs && <SidebarContentTabs />}

      {/* Divider */}
      <div className="mx-2 border-b border-neutral-800" />

      {/* Content area - show tasks or PRs based on selected tab */}
      {sidebarTab === 'prs' && showContentTabs ? (
        <PrSidebarList />
      ) : (
        <>
          {/* Task cards */}
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {/* Active tasks section */}
            {filteredActiveTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-500">
                No active tasks
              </div>
            ) : (
              filteredActiveTasks.map((task, index) => (
                <TaskSummaryCard
                  key={task.id}
                  task={task}
                  index={index}
                  projectName={task.projectName}
                  isSelected={task.id === currentTaskId}
                />
              ))
            )}

            {/* Completed tasks section */}
            {filteredCompletedTasks.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-4 pb-1">
                  <span className="text-xs font-medium text-neutral-500">
                    Completed
                  </span>
                  <div className="h-px flex-1 bg-neutral-800" />
                </div>
                {filteredCompletedTasks.map((task) => (
                  <TaskSummaryCard
                    key={task.id}
                    task={task}
                    projectName={task.projectName}
                    isSelected={task.id === currentTaskId}
                  />
                ))}
                {hasNextPage && (
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      'Loading...'
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        <span>Load more</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Settings button */}
          <div className="mx-2 border-t border-neutral-800" />
          <div className="flex items-center gap-1 p-2">
            <button
              onClick={() => toggleSettings('settings')}
              className="flex grow items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <SlidersHorizontal size={14} />
              <span>Settings</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
