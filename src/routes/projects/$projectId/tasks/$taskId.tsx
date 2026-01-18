import { createFileRoute } from '@tanstack/react-router';
import { Square, Play, Loader2, Copy, Check } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

import {
  MessageStream,
  PermissionBar,
  QuestionOptions,
  MessageInput,
  FilePreviewPane,
} from '@/components/agent';
import { StatusIndicator } from '@/components/status-indicator';
import { useAgentStream, useAgentControls } from '@/hooks/use-agent';
import { useProject } from '@/hooks/use-projects';
import { useTask, useMarkTaskAsRead } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';

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
  const { data: task } = useTask(taskId);
  const { data: project } = useProject(projectId);
  const markAsRead = useMarkTaskAsRead();

  const agentState = useAgentStream(taskId);
  const {
    start,
    stop,
    respondToPermission,
    respondToQuestion,
    sendMessage,
    isStarting,
    isStopping,
  } = useAgentControls(taskId);

  const [filePreview, setFilePreview] = useState<FilePreviewState>({
    isOpen: false,
    filePath: '',
  });

  const [copiedSessionId, setCopiedSessionId] = useState(false);

  const handleCopySessionId = useCallback(async () => {
    if (task?.sessionId) {
      await navigator.clipboard.writeText(task.sessionId);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    }
  }, [task?.sessionId]);

  // Mark task as read when viewing (except when running)
  useEffect(() => {
    if (task && task.status !== 'running') {
      markAsRead.mutate(taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task?.status]);

  const handleFilePathClick = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) => {
      setFilePreview({
        isOpen: true,
        filePath,
        lineStart,
        lineEnd,
      });
    },
    []
  );

  const handleCloseFilePreview = useCallback(() => {
    setFilePreview((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleStart = async () => {
    await start();
  };

  const handleStop = async () => {
    await stop();
  };

  if (!task || !project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  const isRunning = agentState.status === 'running' || task.status === 'running';
  const isWaiting = agentState.status === 'waiting' || task.status === 'waiting';
  const hasMessages = agentState.messages.length > 0;
  const canStart = !isRunning && !isStarting && !hasMessages && !agentState.isLoading;
  const canSendMessage = !isRunning && hasMessages && task.sessionId;

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-700 px-6 py-4">
          <StatusIndicator
            status={agentState.status !== 'waiting' ? agentState.status : task.status}
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

          {/* Start button (only shown when no messages yet) */}
          {canStart && (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start
            </button>
          )}
        </div>

        {/* Message stream or prompt display */}
        <div className="flex-1 overflow-auto">
          {agentState.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : hasMessages ? (
            <MessageStream
              messages={agentState.messages}
              onFilePathClick={handleFilePathClick}
            />
          ) : (
            <div className="p-6">
              <div className="mb-2 text-sm font-medium text-neutral-400">Prompt</div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {task.prompt}
                </pre>
              </div>
              {!canStart && (
                <div className="mt-6 rounded-lg border border-dashed border-neutral-700 p-8 text-center">
                  <p className="text-neutral-400">
                    {isStarting
                      ? 'Starting agent...'
                      : isRunning
                        ? 'Agent is running...'
                        : 'Click Start to run the agent'}
                  </p>
                </div>
              )}
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
        {(canSendMessage || isWaiting) && !agentState.pendingPermission && !agentState.pendingQuestion && (
          <MessageInput
            onSend={sendMessage}
            disabled={isRunning}
            placeholder={
              isRunning
                ? 'Agent is running...'
                : 'Send a follow-up message...'
            }
          />
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
