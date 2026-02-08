import clsx from 'clsx';
import {
  Loader2,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  RefreshCw,
  Settings,
  GitBranch,
  GitCompare,
  GitPullRequest,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { useCommands } from '@/common/hooks/use-commands';
import { getModelsForBackend } from '@/features/agent/ui-backend-selector';
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
import { StatusIndicator } from '@/features/task/ui-status-indicator';
import { TaskPrView } from '@/features/task/ui-task-pr-view';
import { TaskSettingsPane } from '@/features/task/ui-task-settings-pane';
import { useAgentStream, useAgentControls } from '@/hooks/use-agent';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useContextUsage } from '@/hooks/use-context-usage';
import { useModel, formatModelName } from '@/hooks/use-model';
import { useProject } from '@/hooks/use-projects';
import { useEditorSetting } from '@/hooks/use-settings';
import { useSkills } from '@/hooks/use-skills';
import {
  useTask,
  useMarkTaskAsRead,
  useDeleteTask,
  useSetTaskMode,
  useSetTaskModelPreference,
  useClearTaskUserCompleted,
  useAddSessionAllowedTool,
  useRemoveSessionAllowedTool,
  useAllowForProject,
  useAllowForProjectWorktrees,
  useToggleTaskUserCompleted,
} from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import { getBranchFromWorktreePath } from '@/lib/worktree';
import {
  useNavigationStore,
  useTaskState,
  useDiffViewState,
  usePrViewState,
} from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import { useTaskPrompt } from '@/stores/task-prompts';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type ModelPreference,
  type EditorSetting,
} from '@shared/types';

export function TaskPanel({
  taskId,
  onNavigateAfterDelete,
}: {
  taskId: string;
  onNavigateAfterDelete: () => void;
}) {
  const { data: task } = useTask(taskId);
  const projectId = task?.projectId;
  const { data: project } = useProject(projectId ?? '');
  const { data: editorSetting } = useEditorSetting();
  const { data: skills } = useSkills(taskId);
  const { data: dynamicModels } = useBackendModels(
    task?.agentBackend ?? 'claude-code',
  );
  const markAsRead = useMarkTaskAsRead();
  const deleteTask = useDeleteTask();
  const setTaskMode = useSetTaskMode();
  const setTaskModelPreference = useSetTaskModelPreference();
  const clearUserCompleted = useClearTaskUserCompleted();
  const addSessionAllowedTool = useAddSessionAllowedTool();
  const removeSessionAllowedTool = useRemoveSessionAllowedTool();
  const allowForProject = useAllowForProject();
  const allowForProjectWorktrees = useAllowForProjectWorktrees();
  const unloadTask = useTaskMessagesStore((state) => state.unloadTask);

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
    openFilePreview,
    openSettings,
    closeRightPane,
    toggleRightPane,
  } = useTaskState(taskId);

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
    togglePrView,
    closePrView,
  } = usePrViewState(taskId);

  const agentState = useAgentStream(taskId);
  const contextUsage = useContextUsage(agentState.messages);
  const model = useModel(agentState.messages);
  const {
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    queuePrompt,
    cancelQueuedPrompt,
    isStopping,
  } = useAgentControls(taskId);

  const {
    text: promptDraft,
    setDraft: setPromptDraft,
    clearDraft: clearPromptDraft,
  } = useTaskPrompt(taskId);

  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Track this location for navigation restoration
  useEffect(() => {
    if (projectId) {
      setLastLocation({ type: 'project', projectId, taskId });
      setLastTaskForProject(projectId, taskId);
    }
  }, [projectId, taskId, setLastLocation, setLastTaskForProject]);

  const handleCopySessionId = useCallback(async () => {
    if (task?.sessionId) {
      await navigator.clipboard.writeText(task.sessionId);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    }
  }, [task?.sessionId]);

  // Mark task as read when viewing (except when running)
  const markAsReadMutate = markAsRead.mutate;
  const taskStatus = task?.status;
  const lastReadIndex = task?.lastReadIndex ?? -1;
  useEffect(() => {
    if (
      taskStatus !== 'running' &&
      lastReadIndex < agentState.messages.length - 1
    ) {
      markAsReadMutate({
        id: taskId,
        lastReadIndex: agentState.messages.length - 1,
      });
    }
  }, [
    taskId,
    taskStatus,
    agentState.messages.length,
    markAsReadMutate,
    lastReadIndex,
  ]);

  const handleFilePathClick = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      openFilePreview(filePath, lineStart, lineEnd);
    },
    [openFilePreview],
  );

  const handleStop = async () => {
    await stop();
  };

  const handleDelete = async () => {
    // Clean up the task from stores
    unloadTask(taskId);
    clearTaskNavHistoryState(taskId);
    // Delete from database
    await deleteTask.mutateAsync(taskId);
    // Navigate using the provided callback
    onNavigateAfterDelete();
  };

  const handleModeChange = (mode: InteractionMode) => {
    setTaskMode.mutate({ id: taskId, mode });
  };

  const handleModelChange = (modelPreference: ModelPreference) => {
    setTaskModelPreference.mutate({ id: taskId, modelPreference });
  };

  const handleSendMessage = useCallback(
    (message: string) => {
      // Clear userCompleted when sending a follow-up message
      if (task?.userCompleted) {
        clearUserCompleted.mutate(taskId);
      }
      clearPromptDraft();
      sendMessage(message);
    },
    [
      task?.userCompleted,
      taskId,
      clearUserCompleted,
      clearPromptDraft,
      sendMessage,
    ],
  );

  const handleQueuePrompt = useCallback(
    (message: string) => {
      clearPromptDraft();
      queuePrompt(message);
    },
    [clearPromptDraft, queuePrompt],
  );

  const handleOpenInEditor = () => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  };

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

  const handleMergeComplete = useCallback(() => {
    // Close the diff view after successful merge (worktree is deleted)
    if (isDiffViewOpen) {
      toggleDiffView();
    }
  }, [isDiffViewOpen, toggleDiffView]);

  const toggleUserCompleted = useToggleTaskUserCompleted();
  useCommands('task-panel', [
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
      label: 'Open Project in Editor',
      shortcut: 'cmd+o',
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
        if (task?.worktreePath) {
          api.shell.openInEditor(task.worktreePath);
        }
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
  ]);

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
  const hasMessages = agentState.messages.length > 0;
  const canSendMessage = !isRunning && hasMessages && task.sessionId;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex flex-col border-b border-neutral-700 p-2">
          {/* Top row: Status, title, and action buttons */}
          <div className="flex items-center gap-3">
            <StatusIndicator
              status={
                agentState.status !== 'waiting'
                  ? agentState.status
                  : task.status
              }
              className="h-3 w-3"
            />
            <h1
              className={clsx(
                'grow truncate overflow-hidden font-semibold text-ellipsis whitespace-nowrap',
                !task.worktreePath ? 'text-lg' : 'text-sm',
              )}
            >
              {task.name ?? task.prompt.split('\n')[0]}
            </h1>

            {/* Run button */}
            <RunButton
              projectId={project.id}
              workingDir={task.worktreePath ?? project.path}
            />

            {/* Open in editor button */}
            <button
              onClick={handleOpenInEditor}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
              title={`Open project in editor (${formatKeyForDisplay('cmd+o')})`}
            >
              <ExternalLink className="h-4 w-4" />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
              </span>
            </button>

            {/* Delete button */}
            {!isRunning && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-red-400"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            {/* Settings button */}
            <button
              onClick={handleToggleSettingsPane}
              className={clsx(
                'flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                rightPane?.type === 'settings'
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200',
              )}
              title="Task settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="flex justify-between">
            <div className="flex items-center gap-2">
              {task.worktreePath && (
                <>
                  <button
                    onClick={() => api.shell.openInEditor(task.worktreePath!)}
                    className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
                    title={`Open in ${editorSetting ? getEditorLabel(editorSetting) : 'editor'}`}
                  >
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {task.branchName ??
                        getBranchFromWorktreePath(task.worktreePath)}
                    </span>
                  </button>
                  <button
                    onClick={toggleDiffView}
                    className={clsx(
                      'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                      isDiffViewOpen
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
                    )}
                    title={`Toggle diff view (${formatKeyForDisplay('cmd+d')})`}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Diff
                  </button>
                </>
              )}
              {/* PR button - visible when repo is linked */}
              {project.repoProviderId && task.worktreePath && (
                <button
                  onClick={togglePrView}
                  className={clsx(
                    'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                    isPrViewOpen
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
                  )}
                  title="View or link pull request"
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  PR
                </button>
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
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-blue-400 transition-colors hover:bg-neutral-700 hover:text-blue-300 disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent"
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
              {task.pullRequestId && task.pullRequestUrl && (
                <PrBadge
                  pullRequestId={task.pullRequestId}
                  pullRequestUrl={task.pullRequestUrl}
                />
              )}
            </div>
            {(task.sessionId || contextUsage.hasData || model) && (
              <div className="flex items-center gap-3 pl-6">
                {/* Model display */}
                {model && (
                  <span
                    className="font-mono text-xs text-neutral-500"
                    title={model}
                  >
                    {formatModelName(model)}
                  </span>
                )}

                {/* Context usage display */}
                <ContextUsageDisplay contextUsage={contextUsage} />

                {/* Session ID */}
                {task.sessionId && (
                  <button
                    onClick={handleCopySessionId}
                    className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
                    title="Click to copy session ID"
                  >
                    {copiedSessionId ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {task.sessionId.slice(0, 8)}...
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="border-b border-red-900 bg-red-950/50 px-6 py-4">
            <p className="mb-3 text-sm text-neutral-300">
              Are you sure you want to delete this task? This action cannot be
              undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteTask.isPending}
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTask.isPending ? 'Deleting...' : 'Delete Task'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
              selectedFilePath={diffSelectedFile}
              onSelectFile={selectDiffFile}
              branchName={
                task.branchName ?? getBranchFromWorktreePath(task.worktreePath)
              }
              sourceBranch={task.sourceBranch}
              defaultBranch={project.defaultBranch}
              taskName={task.name}
              taskPrompt={task.prompt}
              workItemId={task.workItemIds?.[0] ?? null}
              repoProviderId={project.repoProviderId}
              repoProjectId={project.repoProjectId}
              repoId={project.repoId}
              onMergeComplete={handleMergeComplete}
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
            <div className="p-6">
              <div className="mb-2 text-sm font-medium text-neutral-400">
                Prompt
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
                <pre className="font-sans text-sm whitespace-pre-wrap">
                  {task.prompt}
                </pre>
              </div>
              {isRunning ? (
                <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 p-8">
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  <p className="text-neutral-400">Starting agent...</p>
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
            onSetMode={(mode) => setTaskMode.mutate({ id: taskId, mode })}
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
            <div className="flex items-end gap-2 border-t border-neutral-700 bg-neutral-800 px-4 py-3">
              <ModeSelector
                value={task.interactionMode ?? 'ask'}
                onChange={handleModeChange}
                disabled={isRunning}
              />
              <ModelSelector
                value={task.modelPreference ?? 'default'}
                onChange={handleModelChange}
                disabled={isRunning}
                models={getModelsForBackend(task.agentBackend, dynamicModels)}
              />
              <MessageInput
                onSend={handleSendMessage}
                onQueue={handleQueuePrompt}
                onStop={handleStop}
                disabled={!canSendMessage}
                placeholder="Send a follow-up message..."
                isRunning={isRunning}
                isStopping={isStopping}
                skills={skills}
                value={promptDraft}
                onValueChange={setPromptDraft}
              />
            </div>
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
        />
      )}
    </div>
  );
}
