import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { CheckCircle2, CircleAlert, Loader2, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { api } from '@/lib/api';
import {
  useBackgroundJobsStore,
  getRunningJobsCount,
  type BackgroundJob,
} from '@/stores/background-jobs';

export function BackgroundJobsOverlay({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobs = useBackgroundJobsStore((state) => state.jobs);
  const clearFinished = useBackgroundJobsStore((state) => state.clearFinished);
  const markJobRunning = useBackgroundJobsStore(
    (state) => state.markJobRunning,
  );
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  const runningCount = useMemo(() => getRunningJobsCount(jobs), [jobs]);

  useCommands('background-jobs-overlay', [
    {
      label: 'Close Background Jobs Overlay',
      shortcut: 'escape',
      handler: () => onClose(),
    },
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70svh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Background Jobs
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              {runningCount > 0 ? `${runningCount} running` : 'No running jobs'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearFinished}
              className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
            >
              Clear Finished
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3">
          {jobs.length === 0 ? (
            <div className="rounded border border-dashed border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500">
              No background jobs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobRow({
  job,
  onRetryTaskCreation,
  onOpenTask,
}: {
  job: BackgroundJob;
  onRetryTaskCreation: (job: BackgroundJob) => Promise<void>;
  onOpenTask: (job: BackgroundJob) => void;
}) {
  const icon =
    job.status === 'running' ? (
      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
    ) : job.status === 'succeeded' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : (
      <CircleAlert className="h-4 w-4 text-red-400" />
    );

  return (
    <div
      className={clsx(
        'rounded border px-3 py-2',
        job.status === 'running' && 'border-blue-900/60 bg-blue-950/20',
        job.status === 'succeeded' && 'border-emerald-900/50 bg-emerald-950/20',
        job.status === 'failed' && 'border-red-900/60 bg-red-950/20',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-neutral-100">{job.title}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {job.status === 'running' ? 'Running' : job.status}
          </p>
          <JobDetails job={job} />
          {job.errorMessage && (
            <p className="mt-1 text-xs text-red-300">{job.errorMessage}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {job.type === 'task-creation' && job.status === 'failed' && (
              <button
                type="button"
                onClick={() => {
                  void onRetryTaskCreation(job);
                }}
                className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
              >
                Retry
              </button>
            )}
            {job.type === 'task-creation' &&
              job.status === 'succeeded' &&
              job.projectId &&
              job.taskId && (
                <button
                  type="button"
                  onClick={() => onOpenTask(job)}
                  className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-200 transition-colors hover:bg-blue-900/40"
                >
                  Open Task
                </button>
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
        <div className="mt-1 space-y-0.5 text-xs text-neutral-400">
          {typedJob.details.projectName && (
            <p>Project: {typedJob.details.projectName}</p>
          )}
          {typedJob.details.promptPreview && (
            <p className="truncate">Prompt: {typedJob.details.promptPreview}</p>
          )}
        </div>
      );
    },
    'summary-generation': (typedJob) => {
      if (typedJob.type !== 'summary-generation') return null;

      return (
        <div className="mt-1 space-y-0.5 text-xs text-neutral-400">
          {typedJob.details.taskName && (
            <p>Task: {typedJob.details.taskName}</p>
          )}
          <p>Scope: git diff</p>
        </div>
      );
    },
  };

  return renderers[job.type](job);
}
