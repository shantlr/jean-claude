// src/features/command-palette/global-commands.tsx
import { useNavigate, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

import { useProjects } from '@/hooks/use-projects';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import type { Command } from '@/lib/command-palette';
import { useCommands } from '@/lib/command-palette';
import { useNavigationStore } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';

export function GlobalCommands() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;

  const { data: tasks = [] } = useAllActiveTasks();
  const { data: projects = [] } = useProjects();
  const projectFilter = useNavigationStore((s) => s.projectFilter);
  const setProjectFilter = useNavigationStore((s) => s.setProjectFilter);

  // Filter tasks by current project filter for navigation
  const filteredTasks = useMemo(() => {
    const active = tasks.filter((t) => !t.userCompleted);
    if (projectFilter === 'all') return active;
    return active.filter((t) => t.projectId === projectFilter);
  }, [tasks, projectFilter]);

  // Build session commands dynamically from active tasks
  const sessionCommands: Command[] = useMemo(() => {
    return filteredTasks.slice(0, 9).map((task, index) => {
      const project = projects.find((p) => p.id === task.projectId);
      const shortcutNum = index + 1;
      return {
        id: `session-${task.id}`,
        label: task.name || task.prompt.substring(0, 50),
        shortcut: `cmd+${shortcutNum}` as Command['shortcut'],
        section: 'sessions' as const,
        keywords: [
          project?.name ?? '',
          task.prompt.substring(0, 30),
          'task',
          'session',
        ].filter(Boolean),
        onSelect: () => {
          navigate({
            to: '/projects/$projectId/tasks/$taskId',
            params: { projectId: task.projectId, taskId: task.id },
          });
        },
      };
    });
  }, [filteredTasks, projects, navigate]);

  // Navigation commands
  const navigationCommands: Command[] = useMemo(() => {
    const currentIndex = filteredTasks.findIndex((t) => t.id === currentTaskId);

    const goToNext = () => {
      if (filteredTasks.length === 0) return;
      const newIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % filteredTasks.length;
      const task = filteredTasks[newIndex];
      navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: { projectId: task.projectId, taskId: task.id },
      });
    };

    const goToPrev = () => {
      if (filteredTasks.length === 0) return;
      const newIndex =
        currentIndex === -1
          ? filteredTasks.length - 1
          : (currentIndex - 1 + filteredTasks.length) % filteredTasks.length;
      const task = filteredTasks[newIndex];
      navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: { projectId: task.projectId, taskId: task.id },
      });
    };

    return [
      {
        id: 'next-session',
        label: 'Go to Next Session',
        shortcut: 'cmd+down',
        section: 'commands' as const,
        keywords: ['navigate', 'task', 'next'],
        onSelect: goToNext,
      },
      {
        id: 'prev-session',
        label: 'Go to Previous Session',
        shortcut: 'cmd+up',
        section: 'commands' as const,
        keywords: ['navigate', 'task', 'previous'],
        onSelect: goToPrev,
      },
    ];
  }, [filteredTasks, currentTaskId, navigate]);

  // Project filter commands
  const filterCommands: Command[] = useMemo(() => {
    const sortedProjects = [...projects].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const tabOptions: (string | 'all')[] = [
      'all',
      ...sortedProjects.map((p) => p.id),
    ];
    const currentIndex = tabOptions.indexOf(projectFilter);

    const nextTab = () => {
      const newIndex = (currentIndex + 1) % tabOptions.length;
      setProjectFilter(tabOptions[newIndex]);
    };

    const prevTab = () => {
      const newIndex =
        (currentIndex - 1 + tabOptions.length) % tabOptions.length;
      setProjectFilter(tabOptions[newIndex]);
    };

    return [
      {
        id: 'next-project-tab',
        label: 'Next Project Filter',
        shortcut: 'cmd+tab',
        section: 'commands' as const,
        keywords: ['project', 'filter', 'tab', 'switch'],
        onSelect: nextTab,
      },
      {
        id: 'prev-project-tab',
        label: 'Previous Project Filter',
        shortcut: 'cmd+shift+tab',
        section: 'commands' as const,
        keywords: ['project', 'filter', 'tab', 'switch'],
        onSelect: prevTab,
      },
      {
        id: 'show-all-projects',
        label: 'Show All Projects',
        section: 'commands' as const,
        keywords: ['filter', 'all', 'projects'],
        onSelect: () => setProjectFilter('all'),
      },
    ];
  }, [projects, projectFilter, setProjectFilter]);

  // Static commands
  const staticCommands: Command[] = useMemo(
    () => [
      {
        id: 'new-task',
        label: 'New task...',
        shortcut: 'cmd+n',
        section: 'commands',
        keywords: ['create', 'add', 'start', 'spawn'],
        onSelect: () => {
          useOverlaysStore.getState().open('new-task');
        },
      },
      {
        id: 'settings',
        label: 'Settings...',
        shortcut: 'cmd+,',
        section: 'commands',
        keywords: ['preferences', 'config', 'configuration'],
        onSelect: () => navigate({ to: '/settings' }),
      },
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard Shortcuts',
        shortcut: 'cmd+/',
        section: 'commands',
        keywords: ['help', 'keys', 'bindings', 'hotkeys'],
        onSelect: () => {
          useOverlaysStore.getState().open('keyboard-help');
        },
      },
    ],
    [navigate],
  );

  // Combine all commands
  const allCommands = useMemo(
    () => [
      ...sessionCommands,
      ...navigationCommands,
      ...filterCommands,
      ...staticCommands,
    ],
    [sessionCommands, navigationCommands, filterCommands, staticCommands],
  );

  useCommands('global', allCommands);

  return null;
}
