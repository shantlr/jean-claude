import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  Loader2,
  Play,
  Trash2,
  ExternalLink,
  RefreshCw,
  Settings,
  GitBranch,
  GitCompare,
  GitPullRequest,
  MoreHorizontal,
  FolderTree,
  Bug,
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef, memo } from 'react';

import { useModal } from '@/common/context/modal';
import { useCommands } from '@/common/hooks/use-commands';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import {
  Dropdown,
  DropdownItem,
  DropdownDivider,
  DropdownInfo,
} from '@/common/ui/dropdown';
import { Kbd } from '@/common/ui/kbd';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ContextUsageDisplay } from '@/features/agent/ui-context-usage-display';
import { FilePreviewPane } from '@/features/agent/ui-file-preview-pane';
import { MessageInput } from '@/features/agent/ui-message-input';
import { MessageStream } from '@/features/agent/ui-message-stream';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { PermissionBar } from '@/features/agent/ui-permission-bar';
import { PrBadge } from '@/features/agent/ui-pr-badge';
import { QuestionOptions } from '@/features/agent/ui-question-options';
import { RunButton } from '@/features/agent/ui-run-button';
import { WorktreeDiffView } from '@/features/agent/ui-worktree-diff-view';
import { StepFlowBar } from '@/features/task/ui-step-flow-bar';
import { TaskPrView } from '@/features/task/ui-task-pr-view';
import { useAgentStream, useAgentControls } from '@/hooks/use-agent';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useContextUsage, type ContextUsage } from '@/hooks/use-context-usage';
import { useModel, formatModelName } from '@/hooks/use-model';
import { useProject } from '@/hooks/use-projects';
import { useEditorSetting } from '@/hooks/use-settings';
import { useSkills } from '@/hooks/use-skills';
import {
  useCreateStep,
  useStep,
  useSteps,
  useUpdateStep,
} from '@/hooks/use-steps';
import {
  useTask,
  useDeleteTask,
  useDeleteWorktree,
  useSetTaskMode,
  useClearTaskUserCompleted,
  useAddSessionAllowedTool,
  useRemoveSessionAllowedTool,
  useAllowForProject,
  useAllowForProjectWorktrees,
  useToggleTaskUserCompleted,
} from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import { getBranchFromWorktreePath } from '@/lib/worktree';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import {
  useNavigationStore,
  useTaskState,
  useDiffViewState,
  usePrViewState,
} from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useTaskPrompt } from '@/stores/task-prompts';
import { useToastStore } from '@/stores/toasts';
import type {
  AgentBackendType,
  PromptImagePart,
  PromptPart,
} from '@shared/agent-backend-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type ModelPreference,
  type EditorSetting,
} from '@shared/types';

import { AddStepDialog } from './add-step-dialog';
import { CommandLogsPane } from './command-logs-pane';
import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';
import { DebugMessagesPane } from './debug-messages-pane';
import { DeleteTaskDialog } from './delete-task-dialog';
import { FileExplorerPane } from './file-explorer-pane';
import { TaskPendingNoteInput } from './task-pending-note-input';
import { TaskSettingsPane } from './task-settings-pane';

const LAST_ASSISTANT_MESSAGE_MAX_LENGTH = 1200;

function getLastAssistantMessage(messages: NormalizedEntry[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type !== 'assistant-message') {
      continue;
    }

    const trimmed = message.value.trim();
    if (!trimmed) {
      continue;
    }

    return trimmed.slice(-LAST_ASSISTANT_MESSAGE_MAX_LENGTH);
  }

  return '';
}

export function TaskPanel({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const modal = useModal();
  const { data: task } = useTask(taskId);
  const projectId = task?.projectId;
  const { data: project } = useProject(projectId ?? '');
  const { data: editorSetting } = useEditorSetting();
  const deleteTask = useDeleteTask();
  const deleteWorktree = useDeleteWorktree();
  const setTaskMode = useSetTaskMode();
  const addSessionAllowedTool = useAddSessionAllowedTool();
  const removeSessionAllowedTool = useRemoveSessionAllowedTool();
  const allowForProject = useAllowForProject();
  const allowForProjectWorktrees = useAllowForProjectWorktrees();
  const unloadStep = useTaskMessagesStore((state) => state.unloadStep);
  const clearAllRunCommandLogs = useTaskMessagesStore(
    (state) => state.clearAllRunCommandLogs,
  );
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  // Navigation tracking
  const setLastLocation = useNavigationStore((s) => s.setLastLocation);
  const setLastTaskForProject = useNavigationStore(
    (s) => s.setLastTaskForProject,
  );
  const clearTaskNavHistoryState = useNavigationStore(
    (s) => s.clearTaskNavHistoryState,
  );

  // Task state from store (replaces useState for pane state)
  const {
    rightPane,
    activeStepId,
    setActiveStepId,
    openFilePreview,
    openFileExplorer,
    openCommandLogs,
    selectCommandLogsTab,
    openSettings,
    openDebugMessages,
    closeRightPane,
    toggleRightPane,
  } = useTaskState(taskId);

  // Steps data for auto-selection
  const { data: steps } = useSteps(taskId);
  const { data: activeStep } = useStep(activeStepId ?? '');
  console.log(steps);

  // Diff view state
  const {
    isOpen: isDiffViewOpen,
    selectedFilePath: diffSelectedFile,
    toggleDiffView,
    selectFile: selectDiffFile,
  } = useDiffViewState(taskId);

  // PR view state
  const {
    isOpen: isPrViewOpen,
    openPrView,
    togglePrView,
    closePrView,
  } = usePrViewState(taskId);

  const agentState = useAgentStream({ taskId, stepId: activeStepId });
  const contextUsage = useContextUsage(agentState.messages);
  const model = useModel(agentState.messages);
  const {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    queuePrompt,
    cancelQueuedPrompt,
    isStopping,
  } = useAgentControls({ taskId, stepId: activeStepId });

  const addToast = useToastStore((s) => s.addToast);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false);
  const createStep = useCreateStep();
  // Ref for the task panel container (used by shrink-to-target animation)
  const taskPanelRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<{ toggle: () => void } | null>(null);
  const { triggerAnimation } = useShrinkToTarget({
    panelRef: taskPanelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  // Track this location for navigation restoration
  useEffect(() => {
    if (projectId) {
      setLastLocation({ type: 'project', projectId, taskId });
      setLastTaskForProject(projectId, taskId);
    }
  }, [projectId, taskId, setLastLocation, setLastTaskForProject]);

  // Notify backend this task is focused (dismisses completion notifications, etc.)
  useEffect(() => {
    api.tasks.focused(taskId);

    const handleFocus = () => api.tasks.focused(taskId);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [taskId]);

  useEffect(() => {
    if (task?.status === 'completed') {
      clearAllRunCommandLogs(taskId);
    }
  }, [task?.status, taskId, clearAllRunCommandLogs]);

  // Auto-select an active step when none is selected
  useEffect(() => {
    if (!steps || steps.length === 0) return;
    // If the currently selected step still exists, keep it
    if (activeStepId && steps.some((s) => s.id === activeStepId)) return;

    // Priority: first running → first ready → last completed → first step
    const running = steps.find((s) => s.status === 'running');
    if (running) {
      setActiveStepId(running.id);
      return;
    }
    const ready = steps.find((s) => s.status === 'ready');
    if (ready) {
      setActiveStepId(ready.id);
      return;
    }
    const completedSteps = steps.filter((s) => s.status === 'completed');
    if (completedSteps.length > 0) {
      setActiveStepId(completedSteps[completedSteps.length - 1]!.id);
      return;
    }
    setActiveStepId(steps[0]!.id);
  }, [steps, activeStepId, setActiveStepId]);

  const handleCopySessionId = useCallback(async () => {
    if (activeStep?.sessionId) {
      await navigator.clipboard.writeText(activeStep.sessionId);
    }
  }, [activeStep?.sessionId]);

  const handleFilePathClick = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      openFilePreview(filePath, lineStart, lineEnd);
    },
    [openFilePreview],
  );

  const handleStop = async () => {
    await stop();
  };

  const handleDeleteConfirm = useCallback(
    ({ deleteWorktree }: { deleteWorktree: boolean }) => {
      if (!task || !project) return;

      const jobId = addRunningJob({
        type: 'task-deletion',
        title: `Deleting "${task.name ?? task.prompt.slice(0, 40)}"`,
        taskId,
        projectId: task.projectId,
        details: {
          taskName: task.name ?? task.prompt.slice(0, 40),
          projectName: project.name,
          deleteWorktree,
        },
      });

      // Close modal
      setIsDeleteDialogOpen(false);

      // Trigger shrink-to-target animation (fire-and-forget)
      void triggerAnimation();

      // Clean up stores immediately
      if (activeStepId) {
        unloadStep(activeStepId);
      }
      clearTaskNavHistoryState(taskId);

      // Navigate away
      navigate({ to: '/all' });

      // Run deletion in background
      void deleteTask
        .mutateAsync({ id: taskId, deleteWorktree })
        .then(() => {
          markJobSucceeded(jobId);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Failed to delete task';
          markJobFailed(jobId, message);
        });
    },
    [
      task,
      project,
      taskId,
      activeStepId,
      addRunningJob,
      triggerAnimation,
      unloadStep,
      clearTaskNavHistoryState,
      navigate,
      deleteTask,
      markJobSucceeded,
      markJobFailed,
    ],
  );

  const handleOpenInEditor = () => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  };

  const handleOpenWorktreeInEditor = useCallback(async () => {
    if (!task?.worktreePath) return;
    try {
      await api.shell.openInEditor(task.worktreePath);
    } catch {
      modal.error({
        title: 'Worktree Not Found',
        content: `The worktree path no longer exists:\n${task.worktreePath}\n\nThe worktree may have been deleted or moved.`,
      });
    }
  }, [task?.worktreePath, modal]);

  const handleDeleteWorktree = useCallback(() => {
    if (!task?.worktreePath) return;

    const branchName =
      task.branchName ?? getBranchFromWorktreePath(task.worktreePath);

    modal.confirm({
      title: 'Delete Worktree',
      content: (
        <div className="space-y-2">
          <p>
            This will remove the worktree directory and delete branch{' '}
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
              {branchName}
            </code>
            .
          </p>
          <p className="text-neutral-400">This action cannot be undone.</p>
        </div>
      ),
      confirmLabel: 'Delete Worktree',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteWorktree.mutateAsync({ taskId });
        } catch (error) {
          modal.error({
            title: 'Failed to Delete Worktree',
            content:
              error instanceof Error
                ? error.message
                : 'An unknown error occurred while deleting the worktree.',
          });
        }
      },
    });
  }, [task?.worktreePath, task?.branchName, taskId, deleteWorktree, modal]);

  const handleAllowToolsForSession = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      addSessionAllowedTool.mutate({ id: taskId, toolName, input });
    },
    [taskId, addSessionAllowedTool],
  );

  const handleRemoveSessionAllowedTool = useCallback(
    (toolName: string) => {
      removeSessionAllowedTool.mutate({ id: taskId, toolName });
    },
    [taskId, removeSessionAllowedTool],
  );

  const handleAllowForProject = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      allowForProject.mutate({ id: taskId, toolName, input });
    },
    [taskId, allowForProject],
  );

  const handleAllowForProjectWorktrees = useCallback(
    (toolName: string, input: Record<string, unknown>) => {
      allowForProjectWorktrees.mutate({ id: taskId, toolName, input });
    },
    [taskId, allowForProjectWorktrees],
  );

  const getEditorLabel = (setting: EditorSetting): string => {
    if (setting.type === 'preset') {
      const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
      return editor?.label ?? setting.id;
    }
    if (setting.type === 'command') {
      return setting.command;
    }
    return setting.name;
  };

  const handleToggleSettingsPane = useCallback(() => {
    if (rightPane?.type === 'settings') {
      closeRightPane();
    } else {
      openSettings();
    }
  }, [rightPane, closeRightPane, openSettings]);

  const handleToggleDebugMessagesPane = useCallback(() => {
    if (rightPane?.type === 'debugMessages') {
      closeRightPane();
      return;
    }
    openDebugMessages();
  }, [rightPane, closeRightPane, openDebugMessages]);

  const handleAddStep = useCallback(
    async (data: {
      promptTemplate: string;
      interactionMode: InteractionMode;
      agentBackend: AgentBackendType;
      modelPreference: ModelPreference;
      images: PromptImagePart[];
    }) => {
      const name = data.promptTemplate.split('\n')[0]?.slice(0, 40) ?? 'Step';
      try {
        const step = await createStep.mutateAsync({
          taskId,
          name,
          promptTemplate: data.promptTemplate,
          interactionMode: data.interactionMode,
          agentBackend: data.agentBackend,
          modelPreference: data.modelPreference,
          images: data.images.length > 0 ? data.images : null,
          dependsOn: [],
        });
        setIsAddStepDialogOpen(false);
        setActiveStepId(step.id);
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to create step',
        });
      }
    },
    [taskId, createStep, setActiveStepId, addToast],
  );

  const handleMergeStarted = useCallback(() => {
    // Close the diff view when merge is dispatched (worktree will be deleted)
    if (isDiffViewOpen) {
      toggleDiffView();
    }
  }, [isDiffViewOpen, toggleDiffView]);

  const toggleUserCompleted = useToggleTaskUserCompleted();
  useCommands('task-panel', [
    {
      label: 'Task Menu',
      shortcut: 'cmd+m',
      section: 'Task',
      handler: () => {
        overflowMenuRef.current?.toggle();
      },
    },
    {
      label:
        rightPane?.type === 'fileExplorer'
          ? 'Close File Explorer'
          : 'Open File Explorer',
      shortcut: 'cmd+e',
      section: 'Task',
      handler: () => {
        if (rightPane?.type === 'fileExplorer') {
          closeRightPane();
        } else {
          openFileExplorer();
        }
      },
    },
    {
      label: 'Toggle Diff View',
      shortcut: 'cmd+d',
      section: 'Task',
      handler: () => {
        toggleDiffView();
      },
    },
    {
      label: 'Toggle Task Settings',
      section: 'Task',
      handler: () => {
        toggleRightPane();
      },
    },
    {
      label:
        rightPane?.type === 'debugMessages'
          ? 'Close Raw Message Pane'
          : 'Open Raw Message Pane',
      section: 'Task',
      handler: () => {
        handleToggleDebugMessagesPane();
      },
    },
    {
      label: 'Open Project in Editor',
      shortcut: 'cmd+shift+e',
      section: 'Task',
      handler: () => {
        handleOpenInEditor();
      },
    },
    !!task?.worktreePath && {
      label: 'Open Worktree in Editor',
      shortcut: 'cmd+w',
      section: 'Task',
      handler: () => {
        handleOpenWorktreeInEditor();
      },
    },
    task?.status !== 'running' &&
      agentState.status !== 'running' &&
      !!task?.worktreePath && {
        label: 'Delete Worktree',
        section: 'Task',
        handler: () => {
          handleDeleteWorktree();
        },
      },
    !!task?.pullRequestUrl && {
      label: 'Open Pull Request in Browser',
      section: 'Task',
      handler: () => {
        if (task?.pullRequestUrl) {
          window.open(task.pullRequestUrl!, '_blank');
        }
      },
    },
    {
      label: task?.userCompleted
        ? 'Mark Task as Active'
        : 'Mark Task as Complete',
      section: 'Task',
      handler: () => {
        toggleUserCompleted.mutate(taskId);
      },
    },
    {
      label: 'Copy Session ID',
      section: 'Task',
      handler: () => {
        handleCopySessionId();
      },
    },
    task?.status !== 'running' &&
      agentState.status !== 'running' && {
        label: 'Delete Task',
        section: 'Task',
        handler: () => {
          setIsDeleteDialogOpen(true);
        },
      },
    {
      label: 'Add Step',
      shortcut: 'cmd+shift+n',
      section: 'Task',
      handler: () => {
        setIsAddStepDialogOpen(true);
      },
    },
  ]);

  console.log({
    agentState,
  });
  if (!task || !project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  const isRunning =
    agentState.status === 'running' || task.status === 'running';
  const isWaiting =
    agentState.status === 'waiting' || task.status === 'waiting';
  const taskRootPath = task.worktreePath ?? project.path;
  const hasMessages = agentState.messages.length > 0;
  const getCompletionContextBeforePrompt = () =>
    getLastAssistantMessage(agentState.messages);
  const canSendMessage = !isRunning && hasMessages && !!activeStep?.sessionId;
  const hasRepoLink =
    !!project.repoProviderId && !!project.repoProjectId && !!project.repoId;
  const backendLabel =
    AVAILABLE_BACKENDS.find(
      (backend) => backend.value === activeStep?.agentBackend,
    )?.label ?? 'Claude Code';

  return (
    <div ref={taskPanelRef} className="flex h-full w-full overflow-hidden">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className={clsx(
            'flex items-center gap-3 border-b border-neutral-700 px-3',
            TASK_PANEL_HEADER_HEIGHT_CLS,
          )}
        >
          {/* Left: Task title and note input */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="min-w-0 shrink truncate text-sm font-semibold text-neutral-200">
              {task.name ?? task.prompt.split('\n')[0]}
            </h1>
            <TaskPendingNoteInput
              taskId={taskId}
              pendingMessage={task.pendingMessage}
            />
          </div>

          {/* Center: Branch, PR badge, Work items */}
          <div className="flex shrink items-center gap-2">
            {/* Backend chip */}
            <span className="flex max-w-40 min-w-0 items-center rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              <span className="truncate">{backendLabel}</span>
            </span>

            {/* Branch chip */}
            {task.worktreePath ? (
              <button
                type="button"
                onClick={() => {
                  void handleOpenWorktreeInEditor();
                }}
                className="flex max-w-48 min-w-0 items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
                title="Open worktree in editor"
              >
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {task.branchName ??
                    getBranchFromWorktreePath(task.worktreePath)}
                </span>
              </button>
            ) : task.branchName ? (
              <span className="flex max-w-48 min-w-0 items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.branchName}</span>
              </span>
            ) : null}

            {/* PR badge */}
            {task.pullRequestId && task.pullRequestUrl && (
              <PrBadge
                pullRequestId={task.pullRequestId}
                pullRequestUrl={task.pullRequestUrl}
              />
            )}

            {/* Work item badges */}
            {task.workItemIds &&
              task.workItemIds.length > 0 &&
              task.workItemIds.map((workItemId, index) => {
                const workItemUrl = task.workItemUrls?.[index];
                return (
                  <button
                    key={workItemId}
                    onClick={() => {
                      if (workItemUrl) {
                        window.open(workItemUrl, '_blank');
                      }
                    }}
                    disabled={!workItemUrl}
                    className="flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-blue-400 transition-colors hover:bg-neutral-700 hover:text-blue-300 disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent"
                    title={
                      workItemUrl
                        ? `Open work item #${workItemId} in browser`
                        : `Work item #${workItemId}`
                    }
                  >
                    #{workItemId}
                  </button>
                );
              })}
          </div>

          {/* Right: Run + Overflow menu */}
          <div className="flex shrink-0 items-center gap-2">
            <RunButton
              taskId={taskId}
              projectId={project.id}
              workingDir={taskRootPath}
              onToggleLogs={() => {
                if (rightPane?.type === 'commandLogs') {
                  closeRightPane();
                } else {
                  openCommandLogs();
                }
              }}
              onRunCommand={(runCommandId) => {
                openCommandLogs(runCommandId);
              }}
              isLogsPaneOpen={rightPane?.type === 'commandLogs'}
            />

            {/* Overflow menu */}
            <Dropdown
              trigger={
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
                  title="Task menu (\u2318M)"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <Kbd shortcut="cmd+m" />
                </button>
              }
              align="right"
              dropdownRef={overflowMenuRef}
            >
              {/* Group 1: View toggles */}
              <DropdownItem
                icon={<FolderTree />}
                onClick={() => {
                  if (rightPane?.type === 'fileExplorer') {
                    closeRightPane();
                  } else {
                    openFileExplorer();
                  }
                }}
                checked={rightPane?.type === 'fileExplorer'}
                shortcut="cmd+e"
              >
                Files
              </DropdownItem>
              {task.worktreePath && (
                <DropdownItem
                  icon={<GitCompare />}
                  onClick={toggleDiffView}
                  checked={isDiffViewOpen}
                  shortcut="cmd+d"
                >
                  Diff
                </DropdownItem>
              )}
              {task.worktreePath && hasRepoLink && (
                <DropdownItem
                  icon={<GitPullRequest />}
                  onClick={togglePrView}
                  checked={isPrViewOpen}
                >
                  Pull Request
                </DropdownItem>
              )}

              <DropdownDivider />

              {/* Group 2: Actions */}
              <DropdownItem
                icon={<ExternalLink />}
                onClick={handleOpenInEditor}
                shortcut="cmd+shift+e"
              >
                Open in{' '}
                {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
              </DropdownItem>
              {task.worktreePath && (
                <DropdownItem
                  icon={<ExternalLink />}
                  onClick={handleOpenWorktreeInEditor}
                  shortcut="cmd+w"
                >
                  Open Worktree in Editor
                </DropdownItem>
              )}
              <DropdownItem
                icon={<Settings />}
                onClick={handleToggleSettingsPane}
                checked={rightPane?.type === 'settings'}
              >
                Task Settings
              </DropdownItem>
              <DropdownItem
                icon={<Bug />}
                onClick={handleToggleDebugMessagesPane}
                checked={rightPane?.type === 'debugMessages'}
              >
                Raw Messages
              </DropdownItem>
              {task.worktreePath && !isRunning && (
                <DropdownItem
                  icon={<Trash2 />}
                  variant="danger"
                  onClick={handleDeleteWorktree}
                >
                  Delete Worktree
                </DropdownItem>
              )}
              {!isRunning && (
                <DropdownItem
                  icon={<Trash2 />}
                  variant="danger"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete Task
                </DropdownItem>
              )}

              {/* Group 3: Info (only when session data exists) */}
              {(activeStep?.sessionId || model) && (
                <>
                  <DropdownDivider />
                  {model && (
                    <DropdownInfo
                      label="Model"
                      value={formatModelName(model)}
                    />
                  )}
                  {activeStep?.sessionId && (
                    <DropdownInfo
                      label="Session"
                      value={`${activeStep.sessionId.slice(0, 8)}...`}
                      onClick={handleCopySessionId}
                    />
                  )}
                </>
              )}
            </Dropdown>
          </div>
        </div>

        {/* Step flow bar */}
        <StepFlowBar
          taskId={taskId}
          onAddStep={() => setIsAddStepDialogOpen(true)}
        />

        {/* Main content area: PR view OR Diff view OR Message stream */}
        <div className="min-h-0 flex-1">
          {isPrViewOpen ? (
            <TaskPrView
              taskId={taskId}
              projectId={project.id}
              onClose={closePrView}
            />
          ) : isDiffViewOpen && task.worktreePath ? (
            <WorktreeDiffView
              taskId={taskId}
              projectId={project.id}
              selectedFilePath={diffSelectedFile}
              onSelectFile={selectDiffFile}
              branchName={
                task.branchName ?? getBranchFromWorktreePath(task.worktreePath)
              }
              sourceBranch={task.sourceBranch}
              defaultBranch={project.defaultBranch}
              taskName={task.name}
              hasRepoLink={hasRepoLink}
              onMergeStarted={handleMergeStarted}
              onOpenPrView={openPrView}
            />
          ) : agentState.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : hasMessages ? (
            <MessageStream
              messages={agentState.messages}
              isRunning={isRunning}
              queuedPrompts={agentState.queuedPrompts}
              onFilePathClick={handleFilePathClick}
              onCancelQueuedPrompt={cancelQueuedPrompt}
            />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              <div className="mb-2 text-sm font-medium text-neutral-400">
                {activeStep?.name ?? 'Prompt'}
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
                <pre className="overflow-x-hidden font-sans text-xs whitespace-pre-wrap">
                  {activeStep?.promptTemplate ?? task.prompt}
                </pre>
              </div>
              {isRunning ? (
                <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 p-8">
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  <p className="text-neutral-400">Starting agent...</p>
                </div>
              ) : activeStep?.status === 'ready' ? (
                <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-700 p-8">
                  <button
                    onClick={() => void start()}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                  >
                    <Play className="h-4 w-4" />
                    Start Step
                  </button>
                </div>
              ) : activeStep?.status === 'pending' ? (
                <div className="mt-6 flex items-center justify-center rounded-lg border border-dashed border-neutral-700 p-8">
                  <p className="text-sm text-neutral-500">
                    Waiting for dependencies to complete
                  </p>
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-700 p-8">
                  <p className="text-neutral-400">No messages loaded</p>
                  <button
                    onClick={agentState.refetch}
                    className="flex items-center gap-2 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reload messages
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error display */}
        {agentState.error && (
          <div className="flex items-center justify-between border-t border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            <span>Error: {agentState.error}</span>
            <button
              onClick={agentState.refetch}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-red-300 transition-colors hover:bg-red-900/50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Permission bar */}
        {agentState.pendingPermission && (
          <PermissionBar
            request={agentState.pendingPermission}
            onRespond={respondToPermission}
            onAllowForSession={handleAllowToolsForSession}
            onAllowForProject={handleAllowForProject}
            onAllowForProjectWorktrees={handleAllowForProjectWorktrees}
            onSetMode={(mode) =>
              activeStepId
                ? setTaskMode.mutate({ stepId: activeStepId, mode })
                : undefined
            }
            worktreePath={task.worktreePath}
          />
        )}

        {/* Question options */}
        {agentState.pendingQuestion && (
          <QuestionOptions
            request={agentState.pendingQuestion}
            onRespond={respondToQuestion}
          />
        )}

        {/* Message input */}
        {(canSendMessage || isWaiting || hasMessages) &&
          !agentState.pendingPermission &&
          !agentState.pendingQuestion && (
            <TaskInputFooter
              taskId={taskId}
              activeStepId={activeStepId}
              isRunning={isRunning}
              isStopping={isStopping}
              canSendMessage={!!canSendMessage}
              onSend={sendMessage}
              onQueue={queuePrompt}
              onStop={handleStop}
              contextUsage={contextUsage}
              projectRoot={taskRootPath}
              getCompletionContextBeforePrompt={
                getCompletionContextBeforePrompt
              }
            />
          )}
      </div>

      {/* File preview pane */}
      {rightPane?.type === 'filePreview' && (
        <FilePreviewPane
          filePath={rightPane.filePath}
          projectPath={project.path}
          lineStart={rightPane.lineStart}
          lineEnd={rightPane.lineEnd}
          onClose={closeRightPane}
        />
      )}

      {/* Task settings pane */}
      {rightPane?.type === 'settings' && (
        <TaskSettingsPane
          sessionAllowedTools={task.sessionAllowedTools}
          sourceBranch={task.sourceBranch}
          sourceCommit={task.startCommitHash}
          taskId={taskId}
          onRemoveTool={handleRemoveSessionAllowedTool}
          onClose={closeRightPane}
          onOpenDebugMessages={openDebugMessages}
        />
      )}

      {/* Debug messages pane */}
      {rightPane?.type === 'debugMessages' && (
        <DebugMessagesPane
          taskId={taskId}
          stepId={activeStepId}
          onClose={closeRightPane}
        />
      )}

      {/* File explorer pane */}
      {rightPane?.type === 'fileExplorer' && (
        <FileExplorerPane taskId={taskId} onClose={closeRightPane} />
      )}

      {/* Command logs pane */}
      {rightPane?.type === 'commandLogs' && (
        <CommandLogsPane
          taskId={taskId}
          projectId={project.id}
          selectedCommandId={rightPane.selectedCommandId}
          onSelectCommand={selectCommandLogsTab}
          onClose={closeRightPane}
        />
      )}

      {/* Add step modal */}
      <AddStepDialog
        isOpen={isAddStepDialogOpen}
        onClose={() => setIsAddStepDialogOpen(false)}
        onConfirm={(data) => void handleAddStep(data)}
        defaultBackend={activeStep?.agentBackend ?? 'claude-code'}
        defaultModel={activeStep?.modelPreference ?? 'default'}
      />

      {/* Delete confirmation modal */}
      <DeleteTaskDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        taskName={task.name ?? task.prompt.split('\n')[0]}
        hasWorktree={!!task.worktreePath}
        isPending={false}
      />
    </div>
  );
}

/** Whether a backend supports image attachments in prompts.
 *  All Claude models support vision. OpenCode models generally do too,
 *  but per-model capability detection requires SDK support (not yet available). */
function backendSupportsImages(backend?: AgentBackendType | null): boolean {
  // Both claude-code and opencode backends support image input.
  // When per-model capability data becomes available from the BackendModel type,
  // this should additionally check the selected model's capabilities.
  return backend !== undefined && backend !== null;
}

/**
 * Extracted input footer that owns the prompt draft state.
 * This isolates the rapidly-changing prompt text from the rest of TaskPanel,
 * preventing full tree re-renders on every keystroke.
 */
const TaskInputFooter = memo(function TaskInputFooter({
  taskId,
  activeStepId,
  isRunning,
  isStopping,
  canSendMessage,
  onSend,
  onQueue,
  onStop,
  contextUsage,
  projectRoot,
  getCompletionContextBeforePrompt,
}: {
  taskId: string;
  activeStepId: string | null;
  isRunning: boolean;
  isStopping: boolean;
  canSendMessage: boolean;
  onSend: (parts: PromptPart[]) => void;
  onQueue: (parts: PromptPart[]) => void;
  onStop: () => Promise<void>;
  contextUsage: ContextUsage;
  projectRoot: string | null;
  getCompletionContextBeforePrompt: () => string;
}) {
  const { data: task } = useTask(taskId);
  const { data: activeStep } = useStep(activeStepId ?? '');
  const { data: skills } = useSkills(taskId);

  // Use step values for backend/mode/model (these live on steps now)
  const effectiveBackend = activeStep?.agentBackend ?? 'claude-code';
  const effectiveMode = activeStep?.interactionMode ?? 'ask';
  const effectiveModel = activeStep?.modelPreference ?? 'default';

  const { data: dynamicModels } = useBackendModels(effectiveBackend);
  const setStepMode = useSetTaskMode();
  const clearUserCompleted = useClearTaskUserCompleted();

  const {
    text: promptDraft,
    setDraft: setPromptDraft,
    clearDraft: clearPromptDraft,
  } = useTaskPrompt(taskId);

  const handleModeChange = useCallback(
    (mode: InteractionMode) => {
      if (activeStepId) {
        setStepMode.mutate({ stepId: activeStepId, mode });
      }
    },
    [activeStepId, setStepMode],
  );

  const updateStep = useUpdateStep();
  const handleModelChange = useCallback(
    (modelPreference: ModelPreference) => {
      if (activeStepId) {
        updateStep.mutate({ stepId: activeStepId, data: { modelPreference } });
      }
    },
    [activeStepId, updateStep],
  );

  const handleSendMessage = useCallback(
    (parts: PromptPart[]) => {
      if (task?.userCompleted) {
        clearUserCompleted.mutate(taskId);
      }
      clearPromptDraft();
      onSend(parts);
    },
    [task?.userCompleted, taskId, clearUserCompleted, clearPromptDraft, onSend],
  );

  const handleQueuePrompt = useCallback(
    (parts: PromptPart[]) => {
      clearPromptDraft();
      onQueue(parts);
    },
    [clearPromptDraft, onQueue],
  );

  return (
    <div className="flex items-center gap-2 border-t border-neutral-700 bg-neutral-800 px-4 py-3">
      <ContextUsageDisplay contextUsage={contextUsage} />
      <ModeSelector
        value={effectiveMode}
        onChange={handleModeChange}
        backend={effectiveBackend}
        disabled={isRunning}
      />
      <ModelSelector
        value={effectiveModel}
        onChange={handleModelChange}
        disabled={isRunning}
        models={getModelsForBackend(effectiveBackend, dynamicModels)}
      />
      <MessageInput
        onSend={handleSendMessage}
        onQueue={handleQueuePrompt}
        onStop={onStop}
        disabled={!canSendMessage}
        placeholder="Send a follow-up message..."
        isRunning={isRunning}
        isStopping={isStopping}
        skills={skills}
        projectRoot={projectRoot}
        value={promptDraft}
        onValueChange={setPromptDraft}
        supportsImages={backendSupportsImages(activeStep?.agentBackend)}
        projectId={task?.projectId}
        getCompletionContextBeforePrompt={getCompletionContextBeforePrompt}
      />
    </div>
  );
});
