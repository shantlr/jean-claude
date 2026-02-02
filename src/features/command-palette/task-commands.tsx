// src/features/command-palette/task-commands.tsx
import { useParams, useNavigate } from '@tanstack/react-router';
import { useMemo, useCallback } from 'react';

import { useProject } from '@/hooks/use-projects';
import { useTask, useToggleTaskUserCompleted } from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import type { Command } from '@/lib/command-palette';
import { useCommands } from '@/lib/command-palette';
import { useDiffViewState, useTaskState } from '@/stores/navigation';

/**
 * Registers task-focused commands when viewing a task page.
 * These commands provide quick access to common task operations.
 */
export function TaskCommands() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const taskId = params.taskId as string | undefined;
  const projectId = params.projectId as string | undefined;

  const { data: task } = useTask(taskId ?? '');
  const { data: project } = useProject(projectId ?? '');
  const toggleUserCompleted = useToggleTaskUserCompleted();

  // Task state hooks
  const { openSettings, closeRightPane, rightPane } = useTaskState(
    taskId ?? '',
  );
  const { isOpen: isDiffViewOpen, toggleDiffView } = useDiffViewState(
    taskId ?? '',
  );

  // Open in editor handler
  const handleOpenInEditor = useCallback(() => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  }, [project?.path]);

  // Open worktree in editor handler
  const handleOpenWorktreeInEditor = useCallback(() => {
    if (task?.worktreePath) {
      api.shell.openInEditor(task.worktreePath);
    }
  }, [task?.worktreePath]);

  // Toggle task completion
  const handleToggleComplete = useCallback(() => {
    if (taskId) {
      toggleUserCompleted.mutate(taskId);
    }
  }, [taskId, toggleUserCompleted]);

  // Navigate to project details
  const handleGoToProjectDetails = useCallback(() => {
    if (projectId) {
      navigate({
        to: '/projects/$projectId/details',
        params: { projectId },
      });
    }
  }, [projectId, navigate]);

  const commands: Command[] = useMemo(() => {
    // If no task or project, return empty array
    if (!task || !project || !taskId) return [];

    const cmds: Command[] = [
      // Task-specific commands
      {
        id: 'open-project-editor',
        label: 'Open Project in Editor',
        shortcut: 'cmd+o',
        section: 'current-task' as const,
        keywords: ['editor', 'open', 'code', 'vscode'],
        onSelect: handleOpenInEditor,
      },
      {
        id: 'toggle-task-complete',
        label: task.userCompleted
          ? 'Mark Task as Active'
          : 'Mark Task as Complete',
        section: 'current-task' as const,
        keywords: ['complete', 'done', 'finish', 'archive'],
        onSelect: handleToggleComplete,
      },
      {
        id: 'task-settings',
        label:
          rightPane?.type === 'settings'
            ? 'Close Task Settings'
            : 'Open Task Settings',
        section: 'current-task' as const,
        keywords: ['settings', 'permissions', 'tools'],
        onSelect: () => {
          if (rightPane?.type === 'settings') {
            closeRightPane();
          } else {
            openSettings();
          }
        },
      },
      {
        id: 'go-to-project-details',
        label: 'Go to Project Details',
        section: 'current-task' as const,
        keywords: ['project', 'settings', 'details'],
        onSelect: handleGoToProjectDetails,
      },
    ];

    // Worktree-specific commands
    if (task.worktreePath) {
      cmds.push(
        {
          id: 'open-worktree-editor',
          label: 'Open Worktree in Editor',
          section: 'current-task' as const,
          keywords: ['editor', 'open', 'worktree', 'branch'],
          onSelect: handleOpenWorktreeInEditor,
        },
        {
          id: 'toggle-diff-view',
          label: isDiffViewOpen ? 'Close Diff View' : 'Open Diff View',
          shortcut: 'cmd+d',
          section: 'current-task' as const,
          keywords: ['diff', 'changes', 'compare', 'git'],
          onSelect: toggleDiffView,
        },
      );
    }

    // Copy session ID if available
    if (task.sessionId) {
      cmds.push({
        id: 'copy-session-id',
        label: 'Copy Session ID',
        section: 'current-task' as const,
        keywords: ['session', 'id', 'copy', 'clipboard'],
        onSelect: () => {
          navigator.clipboard.writeText(task.sessionId!);
        },
      });
    }

    // PR-related command
    if (task.pullRequestUrl) {
      cmds.push({
        id: 'open-pull-request',
        label: 'Open Pull Request',
        section: 'current-task' as const,
        keywords: ['pr', 'pull request', 'review'],
        onSelect: () => {
          window.open(task.pullRequestUrl!, '_blank');
        },
      });
    }

    return cmds;
  }, [
    task,
    project,
    taskId,
    rightPane,
    isDiffViewOpen,
    handleOpenInEditor,
    handleOpenWorktreeInEditor,
    handleToggleComplete,
    handleGoToProjectDetails,
    closeRightPane,
    openSettings,
    toggleDiffView,
  ]);

  useCommands('task', commands);

  return null;
}
