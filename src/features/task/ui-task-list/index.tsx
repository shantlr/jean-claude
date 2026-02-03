import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { ProjectFilterTabs } from '@/features/project/ui-project-filter-tabs';
import { TaskSummaryCard } from '@/features/task/ui-task-summary-card';
import { useProjects } from '@/hooks/use-projects';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useProjectFilter } from '@/stores/navigation';

export function TaskList() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;

  const { data: projects = [] } = useProjects();
  const { data: activeTasks = [] } = useAllActiveTasks();
  const { projectFilter, setProjectFilter } = useProjectFilter();

  // Sort projects for tab navigation
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
    [projects],
  );

  // Filter tasks by selected project
  const filteredTasks = useMemo(
    () =>
      projectFilter === 'all'
        ? activeTasks
        : activeTasks.filter((t) => t.projectId === projectFilter),
    [activeTasks, projectFilter],
  );

  // Tab options: 'all' + project IDs (sorted)
  const tabOptions = useMemo<(string | 'all')[]>(
    () => ['all', ...sortedProjects.map((p) => p.id)],
    [sortedProjects],
  );

  // Navigation helpers
  const navigateToTask = useCallback(
    (index: number) => {
      const task = filteredTasks[index];
      if (task) {
        // If we're in "all" view, stay in all view
        if (projectFilter === 'all') {
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
    [filteredTasks, navigate, projectFilter],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next') => {
      if (filteredTasks.length === 0) return;
      const currentIndex = filteredTasks.findIndex(
        (t) => t.id === currentTaskId,
      );
      let newIndex: number;
      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : filteredTasks.length - 1;
      } else {
        newIndex =
          direction === 'next'
            ? (currentIndex + 1) % filteredTasks.length
            : (currentIndex - 1 + filteredTasks.length) % filteredTasks.length;
      }
      navigateToTask(newIndex);
    },
    [filteredTasks, currentTaskId, navigateToTask],
  );

  const navigateTab = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = tabOptions.indexOf(projectFilter);
      const newIndex =
        direction === 'next'
          ? (currentIndex + 1) % tabOptions.length
          : (currentIndex - 1 + tabOptions.length) % tabOptions.length;
      setProjectFilter(tabOptions[newIndex]);
    },
    [tabOptions, projectFilter, setProjectFilter],
  );

  // Get selected project for settings button
  const selectedProject = useMemo(
    () =>
      projectFilter !== 'all'
        ? projects.find((p) => p.id === projectFilter)
        : null,
    [projects, projectFilter],
  );

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
    {
      label: 'Next Tab',
      shortcut: 'tab',
      handler: () => {
        navigateTab('next');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Previous Tab',
      shortcut: 'shift+tab',
      handler: () => {
        navigateTab('prev');
      },
      hideInCommandPalette: true,
    },
    !!selectedProject && {
      label: 'Open Project Settings',
      handler: () => {
        navigate({
          to: '/projects/$projectId/details',
          params: { projectId: selectedProject.id },
        });
      },
    },
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Project filter tabs */}
      <ProjectFilterTabs projects={projects} />

      {/* Divider */}
      <div className="mx-2 border-b border-neutral-800" />

      {/* Task cards */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filteredTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">
            No active tasks
          </div>
        ) : (
          filteredTasks.map((task, index) => (
            <TaskSummaryCard
              key={task.id}
              task={task}
              index={index}
              projectName={task.projectName}
              isSelected={task.id === currentTaskId}
            />
          ))
        )}
      </div>

      {/* Project settings button (when a project is selected) */}
      {selectedProject && (
        <>
          <div className="mx-2 border-t border-neutral-800" />
          <div className="p-2">
            <Link
              to="/projects/$projectId/details"
              params={{ projectId: selectedProject.id }}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <Settings size={14} />
              <span>Project Settings</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
