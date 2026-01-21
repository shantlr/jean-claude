import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Square, Loader2, Copy, Check, Trash2 } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

import { StatusIndicator } from '@/common/ui/status-indicator';
import { FilePreviewPane } from '@/features/agent/ui-file-preview-pane';
import { MessageInput } from '@/features/agent/ui-message-input';
import { MessageStream } from '@/features/agent/ui-message-stream';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { PermissionBar } from '@/features/agent/ui-permission-bar';
import { QuestionOptions } from '@/features/agent/ui-question-options';
import { useAgentStream, useAgentControls } from '@/hooks/use-agent';
import { useProject } from '@/hooks/use-projects';
import { useTask, useMarkTaskAsRead, useDeleteTask, useSetTaskMode } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';
import { useTaskMessagesStore } from '@/stores/task-messages';

import type { InteractionMode } from '../../../../../shared/types';

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  component: TaskPanel,
});

interface FilePreviewState {
  isOpen: boolean;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
}

function TaskPanel() {
  const { projectId, taskId } = Route.useParams();
  const navigate = useNavigate();
  const { data: task } = useTask(taskId);
  const { data: project } = useProject(projectId);
  const markAsRead = useMarkTaskAsRead();
  const deleteTask = useDeleteTask();
  const setTaskMode = useSetTaskMode();
  const unloadTask = useTaskMessagesStore((state) => state.unloadTask);

  const agentState = useAgentStream(taskId);
  const {
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    isStopping,
  } = useAgentControls(taskId);

  const [filePreview, setFilePreview] = useState<FilePreviewState>({
    isOpen: false,
    filePath: '',
  });

  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCopySessionId = useCallback(async () => {
    if (task?.sessionId) {
      await navigator.clipboard.writeText(task.sessionId);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    }
  }, [task?.sessionId]);

  // Mark task as read when viewing (except when running)
  useEffect(() => {
    if (task && agentState.messages.length > 0 && task.status !== 'running') {
      markAsRead.mutate({
        id: taskId,
        lastReadIndex: agentState.messages.length - 1,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task?.status, agentState.messages.length]);

  const handleFilePathClick = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      setFilePreview({
        isOpen: true,
        filePath,
        lineStart,
        lineEnd,
      });
    },
    [],
  );

  const handleCloseFilePreview = useCallback(() => {
    setFilePreview((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleStop = async () => {
    await stop();
  };

  const handleDelete = async () => {
    // Clean up the task from the store first
    unloadTask(taskId);
    // Delete from database
    await deleteTask.mutateAsync(taskId);
    // Navigate back to project
    navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  const handleModeChange = (mode: InteractionMode) => {
    setTaskMode.mutate({ id: taskId, mode });
  };

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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-700 px-6 py-4">
          <StatusIndicator
            status={
              agentState.status !== 'waiting' ? agentState.status : task.status
            }
            className="h-3 w-3"
          />
          <h1 className="flex-1 truncate text-lg font-semibold">{task.name}</h1>
          {task.sessionId && (
            <button
              onClick={handleCopySessionId}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-mono text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
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
          <span className="text-sm text-neutral-500">
            {formatRelativeTime(task.createdAt)}
          </span>

          {/* Stop button */}
          {isRunning && (
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isStopping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop
            </button>
          )}

          {/* Delete button */}
          {!isRunning && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-700 hover:text-red-400 transition-colors"
              title="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="border-b border-red-900 bg-red-950/50 px-6 py-4">
            <p className="mb-3 text-sm text-neutral-300">
              Are you sure you want to delete this task? This action cannot be undone.
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

        {/* Message stream or prompt display */}
        <div className="min-h-0 flex-1">
          {agentState.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : hasMessages ? (
            <MessageStream
              messages={agentState.messages}
              isRunning={isRunning}
              onFilePathClick={handleFilePathClick}
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
              <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 p-8">
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                <p className="text-neutral-400">Starting agent...</p>
              </div>
            </div>
          )}
        </div>

        {/* Error display */}
        {agentState.error && (
          <div className="border-t border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            Error: {agentState.error}
          </div>
        )}

        {/* Permission bar */}
        {agentState.pendingPermission && (
          <PermissionBar
            request={agentState.pendingPermission}
            onRespond={respondToPermission}
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
                onSend={sendMessage}
                disabled={isRunning || !canSendMessage}
                placeholder={
                  isRunning
                    ? 'Agent is running...'
                    : 'Send a follow-up message...'
                }
              />
            </div>
          )}
      </div>

      {/* File preview pane */}
      {filePreview.isOpen && (
        <FilePreviewPane
          filePath={filePreview.filePath}
          projectPath={project.path}
          lineStart={filePreview.lineStart}
          lineEnd={filePreview.lineEnd}
          onClose={handleCloseFilePreview}
        />
      )}
    </div>
  );
}
