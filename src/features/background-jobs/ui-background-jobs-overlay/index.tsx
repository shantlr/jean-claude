import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { CheckCircle2, CircleAlert, Copy, Loader2, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';

import { useKeyboardLayer } from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';
import {
  useBackgroundJobsStore,
  getRunningJobsCount,
  type BackgroundJob,
} from '@/stores/background-jobs';
import { useToastStore } from '@/stores/toasts';

export function BackgroundJobsOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobs = useBackgroundJobsStore((state) => state.jobs);
  const clearFinished = useBackgroundJobsStore((state) => state.clearFinished);
  const addToast = useToastStore((state) => state.addToast);
  const markJobRunning = useBackgroundJobsStore(
    (state) => state.markJobRunning,
  );
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  const runningCount = useMemo(() => getRunningJobsCount(jobs), [jobs]);

  useCommands(
    'background-jobs-overlay',
    [
      {
        label: 'Close Background Jobs Overlay',
        shortcut: 'escape',
        handler: () => onClose(),
      },
    ],
    { layer },
  );

  return createPortal(
    <FocusLock returnFocus>
      <div
        className="bg-bg-0/40 fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
        onClick={onClose}
      >
        <div
          className="bg-bg-0/85 flex max-h-[70svh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent px-4 py-3">
            <div>
              <h2 className="text-ink-0 text-sm font-semibold">
                Background Jobs
              </h2>
              <p className="text-ink-2 mt-0.5 text-xs">
                {runningCount > 0
                  ? `${runningCount} running`
                  : 'No running jobs'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={clearFinished}>
                Clear Finished
              </Button>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                icon={<X />}
                tooltip="Close"
              />
            </div>
          </div>

          <div className="overflow-y-auto p-3">
            {jobs.length === 0 ? (
              <div className="text-ink-3 rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm">
                No background jobs yet.
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onCopyPrompt={async (targetJob) => {
                      if (targetJob.type !== 'task-creation') return;
                      const prompt = targetJob.details.creationInput.prompt;
                      if (!prompt.trim()) return;

                      try {
                        await navigator.clipboard.writeText(prompt);
                        addToast({
                          type: 'success',
                          message: 'Prompt copied to clipboard',
                        });
                      } catch {
                        addToast({
                          type: 'error',
                          message: 'Failed to copy prompt',
                        });
                      }
                    }}
                    onRetryTaskCreation={async (targetJob) => {
                      if (targetJob.type !== 'task-creation') return;
                      markJobRunning(targetJob.id);

                      try {
                        const task = await api.tasks.createWithWorktree({
                          ...targetJob.details.creationInput,
                          updatedAt: new Date().toISOString(),
                        });

                        markJobSucceeded(targetJob.id, {
                          taskId: task.id,
                          projectId: task.projectId,
                        });
                        queryClient.invalidateQueries({ queryKey: ['tasks'] });
                        queryClient.invalidateQueries({
                          queryKey: ['tasks', { projectId: task.projectId }],
                        });
                      } catch (error) {
                        const message =
                          error instanceof Error
                            ? error.message
                            : 'Failed to create task';
                        markJobFailed(targetJob.id, message);
                      }
                    }}
                    onRetryTaskDeletion={async (targetJob) => {
                      if (targetJob.type !== 'task-deletion') return;
                      if (!targetJob.taskId) return;
                      markJobRunning(targetJob.id);

                      try {
                        await api.tasks.delete(targetJob.taskId, {
                          deleteWorktree: targetJob.details.deleteWorktree,
                        });

                        markJobSucceeded(targetJob.id);
                        queryClient.invalidateQueries({ queryKey: ['tasks'] });
                      } catch (error) {
                        const message =
                          error instanceof Error
                            ? error.message
                            : 'Failed to delete task';
                        markJobFailed(targetJob.id, message);
                      }
                    }}
                    onOpenTask={(targetJob) => {
                      if (!targetJob.projectId || !targetJob.taskId) return;
                      navigate({
                        to: '/projects/$projectId/tasks/$taskId',
                        params: {
                          projectId: targetJob.projectId,
                          taskId: targetJob.taskId,
                        },
                      });
                      onClose();
                    }}
                    onOpenNote={(targetJob) => {
                      if (!targetJob.noteId) return;
                      navigate({
                        to: '/all/notes/$noteId',
                        params: { noteId: targetJob.noteId },
                      });
                      onClose();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </FocusLock>,
    document.body,
  );
}

function JobRow({
  job,
  onCopyPrompt,
  onRetryTaskCreation,
  onRetryTaskDeletion,
  onOpenTask,
  onOpenNote,
}: {
  job: BackgroundJob;
  onCopyPrompt: (job: BackgroundJob) => Promise<void>;
  onRetryTaskCreation: (job: BackgroundJob) => Promise<void>;
  onRetryTaskDeletion: (job: BackgroundJob) => Promise<void>;
  onOpenTask: (job: BackgroundJob) => void;
  onOpenNote: (job: BackgroundJob) => void;
}) {
  const icon =
    job.status === 'running' ? (
      <Loader2 className="text-acc-ink h-4 w-4 animate-spin" />
    ) : job.status === 'succeeded' ? (
      <CheckCircle2 className="text-status-done h-4 w-4" />
    ) : (
      <CircleAlert className="text-status-fail h-4 w-4" />
    );

  return (
    <div
      className={clsx(
        'rounded-lg border px-3 py-2',
        job.status === 'running' &&
          'bg-acc/[0.08] border-acc/20 backdrop-blur-sm',
        job.status === 'succeeded' &&
          'bg-status-done/[0.08] border-status-done/20',
        job.status === 'failed' && 'bg-status-fail/[0.08] border-red-400/20',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-ink-0 truncate text-sm">{job.title}</p>
          <p className="text-ink-2 mt-0.5 text-xs">
            {job.status === 'running'
              ? `Started ${formatRelativeTime(job.createdAt)}`
              : job.status === 'succeeded'
                ? `Completed ${formatRelativeTime(job.completedAt!)}`
                : `Failed ${formatRelativeTime(job.completedAt!)}`}
          </p>
          <JobDetails job={job} />
          {job.errorMessage && (
            <p className="text-status-fail mt-1 text-xs">{job.errorMessage}</p>
          )}
          {job.warningMessage && (
            <p className="text-status-fail mt-1 text-xs">
              {job.warningMessage}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {job.type === 'task-creation' &&
              job.details.creationInput.prompt.trim() && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void onCopyPrompt(job);
                  }}
                  icon={<Copy />}
                >
                  Copy Prompt
                </Button>
              )}
            {job.type === 'task-creation' && job.status === 'failed' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void onRetryTaskCreation(job);
                }}
              >
                Retry
              </Button>
            )}
            {job.type === 'task-deletion' && job.status === 'failed' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void onRetryTaskDeletion(job);
                }}
              >
                Retry
              </Button>
            )}
            {job.type === 'task-creation' &&
              job.status === 'succeeded' &&
              job.projectId &&
              job.taskId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenTask(job)}
                >
                  Open Task
                </Button>
              )}
            {job.type === 'verification-note' &&
              job.status === 'succeeded' &&
              job.noteId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenNote(job)}
                >
                  Open Note
                </Button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobDetails({ job }: { job: BackgroundJob }) {
  const renderers: Record<
    BackgroundJob['type'],
    (job: BackgroundJob) => ReactNode
  > = {
    'task-creation': (typedJob) => {
      if (typedJob.type !== 'task-creation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.projectName && (
            <p>Project: {typedJob.details.projectName}</p>
          )}
          {typedJob.details.promptPreview && (
            <p className="truncate">Prompt: {typedJob.details.promptPreview}</p>
          )}
        </div>
      );
    },
    'skill-creation': (typedJob) => {
      if (typedJob.type !== 'skill-creation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.promptPreview && (
            <p className="truncate">Prompt: {typedJob.details.promptPreview}</p>
          )}
        </div>
      );
    },
    'pr-creation': (typedJob) => {
      if (typedJob.type !== 'pr-creation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p className="truncate">Title: {typedJob.details.title}</p>
          <p>Branch: {typedJob.details.branchName}</p>
        </div>
      );
    },
    'pr-review-creation': (typedJob) => {
      if (typedJob.type !== 'pr-review-creation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p>PR #{typedJob.details.pullRequestId}</p>
        </div>
      );
    },
    'summary-generation': (typedJob) => {
      if (typedJob.type !== 'summary-generation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.taskName && (
            <p>Task: {typedJob.details.taskName}</p>
          )}
          <p>Scope: git diff</p>
        </div>
      );
    },
    'project-summary-generation': (typedJob) => {
      if (typedJob.type !== 'project-summary-generation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.projectName && (
            <p>Project: {typedJob.details.projectName}</p>
          )}
        </div>
      );
    },
    'logo-generation': (typedJob) => {
      if (typedJob.type !== 'logo-generation') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.projectName && (
            <p>Project: {typedJob.details.projectName}</p>
          )}
          {typedJob.details.customPrompt && (
            <p className="truncate">Prompt: {typedJob.details.customPrompt}</p>
          )}
        </div>
      );
    },
    'verification-note': (typedJob) => {
      if (typedJob.type !== 'verification-note') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p>{typedJob.details.workItemCount} work item(s)</p>
          {typedJob.details.workItemTitles.length > 0 && (
            <p className="truncate">
              {typedJob.details.workItemTitles.join(', ')}
            </p>
          )}
        </div>
      );
    },
    'step-start': (typedJob) => {
      if (typedJob.type !== 'step-start') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p>Step: {typedJob.details.stepName}</p>
        </div>
      );
    },
    'task-completion': (typedJob) => {
      if (typedJob.type !== 'task-completion') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.cleanupWorktree && (
            <p>Worktree cleanup requested</p>
          )}
        </div>
      );
    },
    'task-deletion': (typedJob) => {
      if (typedJob.type !== 'task-deletion') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          {typedJob.details.taskName && (
            <p>Task: {typedJob.details.taskName}</p>
          )}
          {typedJob.details.projectName && (
            <p>Project: {typedJob.details.projectName}</p>
          )}
          {typedJob.details.deleteWorktree && <p>Worktree will be deleted</p>}
        </div>
      );
    },
    commit: (typedJob) => {
      if (typedJob.type !== 'commit') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p className="truncate">{typedJob.details.message}</p>
        </div>
      );
    },
    merge: (typedJob) => {
      if (typedJob.type !== 'merge') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p>
            {typedJob.details.branchName} → {typedJob.details.targetBranch}
          </p>
        </div>
      );
    },
    'worktree-cleanup': (typedJob) => {
      if (typedJob.type !== 'worktree-cleanup') return null;

      return (
        <div className="text-ink-2 mt-1 space-y-0.5 text-xs">
          <p>Branch: {typedJob.details.branchName}</p>
          <p className="truncate">Path: {typedJob.details.worktreePath}</p>
        </div>
      );
    },
  };

  return renderers[job.type](job);
}
