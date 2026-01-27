import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

import { FilePreviewPane } from '@/features/agent/ui-file-preview-pane';
import { MessageInput } from '@/features/agent/ui-message-input';
import { MessageStream } from '@/features/agent/ui-message-stream';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { PermissionBar } from '@/features/agent/ui-permission-bar';
import { QuestionOptions } from '@/features/agent/ui-question-options';
import { WorktreeDiffView } from '@/features/agent/ui-worktree-diff-view';
import { StatusIndicator } from '@/features/task/ui-status-indicator';
import { TaskSettingsPane } from '@/features/task/ui-task-settings-pane';
import { useAgentStream, useAgentControls } from '@/hooks/use-agent';
import { useProject } from '@/hooks/use-projects';
import { useEditorSetting } from '@/hooks/use-settings';
import {
  useTask,
  useMarkTaskAsRead,
  useDeleteTask,
  useSetTaskMode,
  useClearTaskUserCompleted,
  useAddSessionAllowedTool,
  useRemoveSessionAllowedTool,
} from '@/hooks/use-tasks';
import { PROJECT_HEADER_HEIGHT } from '@/layout/ui-project-sidebar';
import { api } from '@/lib/api';
import { getBranchFromWorktreePath } from '@/lib/worktree';
import {
  useNavigationStore,
  useTaskState,
  useDiffViewState,
} from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';

import {
  PRESET_EDITORS,
  type InteractionMode,
  type EditorSetting,
} from '../../../../../shared/types';

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  component: TaskPanel,
});

function TaskPanel() {
  const { projectId, taskId } = Route.useParams();
  const navigate = useNavigate();
  const { data: task } = useTask(taskId);
  const { data: project } = useProject(projectId);
  const { data: editorSetting } = useEditorSetting();
  const markAsRead = useMarkTaskAsRead();
  const deleteTask = useDeleteTask();
  const setTaskMode = useSetTaskMode();
  const clearUserCompleted = useClearTaskUserCompleted();
  const addSessionAllowedTool = useAddSessionAllowedTool();
  const removeSessionAllowedTool = useRemoveSessionAllowedTool();
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
  const { rightPane, openFilePreview, openSettings, closeRightPane } =
    useTaskState(taskId);

  // Diff view state
  const {
    isOpen: isDiffViewOpen,
    selectedFilePath: diffSelectedFile,
    toggleDiffView,
    selectFile: selectDiffFile,
  } = useDiffViewState(taskId);

  const agentState = useAgentStream(taskId);
  const {
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    queuePrompt,
    cancelQueuedPrompt,
    isStopping,
  } = useAgentControls(taskId);

  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Track this location for navigation restoration
  useEffect(() => {
    setLastLocation(projectId, taskId);
    setLastTaskForProject(projectId, taskId);
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
    // Navigate back to project
    navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  const handleModeChange = (mode: InteractionMode) => {
    setTaskMode.mutate({ id: taskId, mode });
  };

  const handleSendMessage = useCallback(
    (message: string) => {
      // Clear userCompleted when sending a follow-up message
      if (task?.userCompleted) {
        clearUserCompleted.mutate(taskId);
      }
      sendMessage(message);
    },
    [task?.userCompleted, taskId, clearUserCompleted, sendMessage],
  );

  const handleOpenInEditor = () => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  };

  const handleAllowToolForSession = useCallback(
    (toolName: string) => {
      addSessionAllowedTool.mutate({ id: taskId, toolName });
    },
    [taskId, addSessionAllowedTool],
  );

  const handleAllowToolsForSession = useCallback(
    (toolNames: string[]) => {
      toolNames.forEach((toolName) => {
        addSessionAllowedTool.mutate({ id: taskId, toolName });
      });
    },
    [taskId, addSessionAllowedTool],
  );

  const handleRemoveSessionAllowedTool = useCallback(
    (toolName: string) => {
      removeSessionAllowedTool.mutate({ id: taskId, toolName });
    },
    [taskId, removeSessionAllowedTool],
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

  console.log('RENDER TASK PAGE');

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b border-neutral-700 px-6 py-4"
          style={{
            height: PROJECT_HEADER_HEIGHT,
          }}
        >
          <StatusIndicator
            status={
              agentState.status !== 'waiting' ? agentState.status : task.status
            }
            className="h-3 w-3"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1
              className={clsx(
                'truncate font-semibold whitespace-nowrap overflow-hidden text-ellipsis',
                !task.worktreePath ? 'text-lg' : 'text-sm',
              )}
            >
              {task.name ?? task.prompt.split('\n')[0]}
            </h1>
            {task.worktreePath && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => api.shell.openInEditor(task.worktreePath!)}
                  className="flex min-w-0 max-w-48 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
                  title={`Open in ${editorSetting ? getEditorLabel(editorSetting) : 'editor'}`}
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {getBranchFromWorktreePath(task.worktreePath)}
                  </span>
                </button>
                <button
                  onClick={toggleDiffView}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    isDiffViewOpen
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
                  }`}
                  title="View git diff"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Diff
                </button>
              </div>
            )}
          </div>
          {task.sessionId && (
            <button
              onClick={handleCopySessionId}
              className="flex items-center gap-1 rounded px-2 py-1 font-mono text-xs text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
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

          {/* Open in editor button */}
          <button
            onClick={handleOpenInEditor}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
            title="Open project in editor"
          >
            <ExternalLink className="h-4 w-4" />
            {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
          </button>

          {/* Delete button */}
          {!isRunning && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-red-400"
              title="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {/* Settings button */}
          <button
            onClick={handleToggleSettingsPane}
            className={`flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
              rightPane?.type === 'settings'
                ? 'bg-neutral-700 text-neutral-200'
                : 'text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
            }`}
            title="Task settings"
          >
            <Settings className="h-4 w-4" />
          </button>
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

        {/* Main content area: Diff view OR Message stream */}
        <div className="min-h-0 flex-1">
          {isDiffViewOpen && task.worktreePath && task.startCommitHash ? (
            <WorktreeDiffView
              worktreePath={task.worktreePath}
              startCommitHash={task.startCommitHash}
              selectedFilePath={diffSelectedFile}
              onSelectFile={selectDiffFile}
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
                <pre className="whitespace-pre-wrap font-sans text-sm">
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
              <MessageInput
                onSend={handleSendMessage}
                onQueue={queuePrompt}
                onStop={handleStop}
                disabled={!canSendMessage}
                placeholder="Send a follow-up message..."
                isRunning={isRunning}
                isStopping={isStopping}
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
          onAddTool={handleAllowToolForSession}
          onRemoveTool={handleRemoveSessionAllowedTool}
          onClose={closeRightPane}
        />
      )}
    </div>
  );
}
