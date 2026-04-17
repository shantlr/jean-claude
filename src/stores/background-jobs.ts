import { nanoid } from 'nanoid';
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/api';

export type BackgroundJobType =
  | 'task-creation'
  | 'skill-creation'
  | 'pr-creation'
  | 'pr-review-creation'
  | 'summary-generation'
  | 'task-deletion'
  | 'commit'
  | 'merge'
  | 'worktree-cleanup';
export type BackgroundJobStatus = 'running' | 'succeeded' | 'failed';

interface BackgroundJobBase {
  id: string;
  title: string;
  status: BackgroundJobStatus;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  taskId: string | null;
  projectId: string | null;
}

export type BackgroundJob =
  | (BackgroundJobBase & {
      type: 'task-creation';
      details: {
        projectName: string | null;
        promptPreview: string | null;
        creationInput: Parameters<typeof api.tasks.createWithWorktree>[0];
        backlogTodoId: string | null;
      };
    })
  | (BackgroundJobBase & {
      type: 'skill-creation';
      details: {
        promptPreview: string | null;
      };
    })
  | (BackgroundJobBase & {
      type: 'pr-creation';
      details: {
        title: string;
        branchName: string;
      };
    })
  | (BackgroundJobBase & {
      type: 'pr-review-creation';
      details: {
        pullRequestId: number;
      };
    })
  | (BackgroundJobBase & {
      type: 'summary-generation';
      details: {
        taskName: string | null;
      };
    })
  | (BackgroundJobBase & {
      type: 'task-deletion';
      details: {
        taskName: string | null;
        projectName: string | null;
        deleteWorktree: boolean;
      };
    })
  | (BackgroundJobBase & {
      type: 'commit';
      details: {
        message: string;
      };
    })
  | (BackgroundJobBase & {
      type: 'merge';
      details: {
        branchName: string;
        targetBranch: string;
      };
    })
  | (BackgroundJobBase & {
      type: 'worktree-cleanup';
      details: {
        branchName: string;
        worktreePath: string;
      };
    });

type NewBackgroundJobInput =
  | {
      type: 'task-creation';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        projectName: string | null;
        promptPreview: string | null;
        creationInput: Parameters<typeof api.tasks.createWithWorktree>[0];
        backlogTodoId: string | null;
      };
    }
  | {
      type: 'skill-creation';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        promptPreview: string | null;
      };
    }
  | {
      type: 'pr-creation';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        title: string;
        branchName: string;
      };
    }
  | {
      type: 'pr-review-creation';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        pullRequestId: number;
      };
    }
  | {
      type: 'summary-generation';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        taskName: string | null;
      };
    }
  | {
      type: 'task-deletion';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        taskName: string | null;
        projectName: string | null;
        deleteWorktree: boolean;
      };
    }
  | {
      type: 'commit';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        message: string;
      };
    }
  | {
      type: 'merge';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        branchName: string;
        targetBranch: string;
      };
    }
  | {
      type: 'worktree-cleanup';
      title: string;
      taskId?: string | null;
      projectId?: string | null;
      details: {
        branchName: string;
        worktreePath: string;
      };
    };

interface BackgroundJobsState {
  jobs: BackgroundJob[];
  addRunningJob: (job: NewBackgroundJobInput) => string;
  markJobSucceeded: (
    id: string,
    data?: { taskId?: string | null; projectId?: string | null },
  ) => void;
  markJobFailed: (id: string, errorMessage: string) => void;
  markJobRunning: (id: string) => void;
  clearFinished: () => void;
}

export const useBackgroundJobsStore = create<BackgroundJobsState>()(
  persist(
    (set) => ({
      jobs: [],

      addRunningJob: ({
        type,
        title,
        taskId = null,
        projectId = null,
        details,
      }) => {
        const id = nanoid();
        const createdAt = new Date().toISOString();
        const runningJob = {
          id,
          type,
          title,
          status: 'running' as const,
          createdAt,
          completedAt: null,
          errorMessage: null,
          taskId,
          projectId,
          details,
        } as BackgroundJob;

        set((state) => ({
          jobs: [runningJob, ...state.jobs],
        }));
        return id;
      },

      markJobSucceeded: (id, data) => {
        const completedAt = new Date().toISOString();
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'succeeded',
                  completedAt,
                  errorMessage: null,
                  taskId: data?.taskId ?? job.taskId,
                  projectId: data?.projectId ?? job.projectId,
                }
              : job,
          ),
        }));
      },

      markJobFailed: (id, errorMessage) => {
        const completedAt = new Date().toISOString();
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'failed',
                  completedAt,
                  errorMessage,
                }
              : job,
          ),
        }));
      },

      markJobRunning: (id) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'running',
                  completedAt: null,
                  errorMessage: null,
                }
              : job,
          ),
        }));
      },

      clearFinished: () => {
        set((state) => ({
          jobs: state.jobs.filter((job) => job.status === 'running'),
        }));
      },
    }),
    {
      name: 'background-jobs',
      partialize: (state) => ({ jobs: state.jobs }),
      onRehydrateStorage: () => (state, error) => {
        if (!state || error) return;
        for (const job of state.jobs) {
          if (job.status !== 'running') continue;
          state.markJobFailed(job.id, 'Interrupted by app restart');
        }
      },
    },
  ),
);

/** Human-readable label for a background job type. */
export function bgJobLabel(type: BackgroundJobType): string {
  switch (type) {
    case 'task-deletion':
      return 'Deleting…';
    case 'commit':
      return 'Committing…';
    case 'merge':
      return 'Merging…';
    case 'summary-generation':
      return 'Generating summary…';
    case 'task-creation':
      return 'Creating…';
    case 'skill-creation':
      return 'Creating skill…';
    case 'pr-creation':
      return 'Creating PR…';
    case 'pr-review-creation':
      return 'Creating PR review…';
    case 'worktree-cleanup':
      return 'Cleaning up worktree…';
  }
}

export function getRunningJobsCount(jobs: BackgroundJob[]) {
  return jobs.filter((job) => job.status === 'running').length;
}

const EMPTY_RUNNING_JOBS: BackgroundJob[] = [];

/** Returns running background jobs linked to a given task. */
export function useRunningBackgroundJobsForTask(taskId: string | null) {
  const jobs = useBackgroundJobsStore((state) => state.jobs);

  return useMemo(
    () =>
      taskId
        ? jobs.filter(
            (job) => job.status === 'running' && job.taskId === taskId,
          )
        : EMPTY_RUNNING_JOBS,
    [jobs, taskId],
  );
}

/** Returns true when a running task-creation job is linked to the given backlog item. */
export function useBackgroundNewTaskJobForBacklogItem({
  itemId,
}: {
  itemId: string;
}) {
  return useBackgroundJobsStore((state) =>
    state.jobs.some(
      (job) =>
        job.type === 'task-creation' &&
        job.status === 'running' &&
        job.details.backlogTodoId === itemId,
    ),
  );
}
