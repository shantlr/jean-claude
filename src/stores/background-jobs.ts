import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/api';

export type BackgroundJobType =
  | 'task-creation'
  | 'summary-generation'
  | 'task-deletion';
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
    },
  ),
);

export function getRunningJobsCount(jobs: BackgroundJob[]) {
  return jobs.filter((job) => job.status === 'running').length;
}
