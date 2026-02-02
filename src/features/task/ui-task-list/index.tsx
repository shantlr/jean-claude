import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { ProjectFilterTabs } from '@/features/project/ui-project-filter-tabs';
import { TaskSummaryCard } from '@/features/task/ui-task-summary-card';
import { useProjects } from '@/hooks/use-projects';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useKeyboardBindings } from '@/lib/keyboard-bindings';
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
        navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: { projectId: task.projectId, taskId: task.id },
        });
      }
    },
    [filteredTasks, navigate],
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

  // Keyboard bindings for task navigation
  useKeyboardBindings('task-list-navigation', {
    'cmd+1': () => {
      navigateToTask(0);
      return true;
    },
    'cmd+2': () => {
      navigateToTask(1);
      return true;
    },
    'cmd+3': () => {
      navigateToTask(2);
      return true;
    },
    'cmd+4': () => {
      navigateToTask(3);
      return true;
    },
    'cmd+5': () => {
      navigateToTask(4);
      return true;
    },
    'cmd+6': () => {
      navigateToTask(5);
      return true;
    },
    'cmd+7': () => {
      navigateToTask(6);
      return true;
    },
    'cmd+8': () => {
      navigateToTask(7);
      return true;
    },
    'cmd+9': () => {
      navigateToTask(8);
      return true;
    },
    'cmd+up': () => {
      navigateRelative('prev');
      return true;
    },
    'cmd+down': () => {
      navigateRelative('next');
      return true;
    },
    'cmd+tab': () => {
      navigateTab('next');
      return true;
    },
    'cmd+shift+tab': () => {
      navigateTab('prev');
      return true;
    },
  });

  // Get selected project for settings button
  const selectedProject = useMemo(
    () =>
      projectFilter !== 'all'
        ? projects.find((p) => p.id === projectFilter)
        : null,
    [projects, projectFilter],
  );

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
