import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { InteractionMode, NewTask, UpdateTask } from '@shared/types';

// The creation payload includes step-related fields alongside task fields.
// The IPC handler extracts interactionMode/modelPreference/agentBackend
// to auto-create the initial TaskStep.
type CreateTaskPayload = NewTask & {
  interactionMode?: InteractionMode | null;
  modelPreference?: string | null;
  agentBackend?: AgentBackendType | null;
};

export function invalidateFeedItems(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks.findAll,
  });
}

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', { projectId }],
    queryFn: () => api.tasks.findByProjectId(projectId),
    enabled: !!projectId,
  });
}

export function useAllActiveTasks() {
  return useQuery({
    queryKey: ['tasks', 'allActive'],
    queryFn: () => api.tasks.findAllActive(),
  });
}

export function useAllCompletedTasks({ limit }: { limit: number }) {
  return useInfiniteQuery({
    queryKey: ['tasks', 'allCompleted', { limit }],
    queryFn: ({ pageParam = 0 }) =>
      api.tasks.findAllCompleted({ limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (acc, page) => acc + page.tasks.length,
        0,
      );
      return loadedCount < lastPage.total ? loadedCount : undefined;
    },
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.tasks.findById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskPayload) => api.tasks.create(data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useCreateTaskWithWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: CreateTaskPayload & {
        useWorktree: boolean;
        sourceBranch?: string | null;
        autoStart?: boolean;
      },
    ) => api.tasks.createWithWorktree(data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTask }) =>
      api.tasks.update(id, data),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const clearAllRunCommandLogs = useTaskMessagesStore(
    (s) => s.clearAllRunCommandLogs,
  );
  const setRunCommandRunning = useTaskMessagesStore(
    (s) => s.setRunCommandRunning,
  );
  return useMutation({
    mutationFn: ({
      id,
      deleteWorktree,
    }: {
      id: string;
      deleteWorktree?: boolean;
    }) => api.tasks.delete(id, { deleteWorktree }),
    onSuccess: (_, { id }) => {
      clearAllRunCommandLogs(id);
      setRunCommandRunning(id, false);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      keepBranch,
    }: {
      taskId: string;
      keepBranch?: boolean;
    }) => api.tasks.worktree.delete(taskId, { keepBranch }),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['worktree-status', taskId] });
      queryClient.invalidateQueries({ queryKey: ['worktree-diff', taskId] });
      queryClient.invalidateQueries({
        queryKey: ['worktree-file-content', taskId],
      });
    },
  });
}

export function useSetStepMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, mode }: { stepId: string; mode: InteractionMode }) =>
      api.steps.setMode(stepId, mode),
    onSuccess: (step) => {
      queryClient.invalidateQueries({ queryKey: ['steps', step.id] });
      queryClient.invalidateQueries({
        queryKey: ['steps', { taskId: step.taskId }],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * @deprecated Use useSetStepMode instead. Kept as a compatibility shim
 * that delegates to the step-based API. Callers should migrate to pass
 * stepId directly.
 */
export function useSetTaskMode() {
  return useSetStepMode();
}

export function useToggleTaskUserCompleted() {
  const queryClient = useQueryClient();
  const clearAllRunCommandLogs = useTaskMessagesStore(
    (s) => s.clearAllRunCommandLogs,
  );
  const setRunCommandRunning = useTaskMessagesStore(
    (s) => s.setRunCommandRunning,
  );
  return useMutation({
    mutationFn: (id: string) => api.tasks.toggleUserCompleted(id),
    onSuccess: (task, id) => {
      clearAllRunCommandLogs(id);
      setRunCommandRunning(id, false);
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allActive'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allCompleted'] });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  const clearAllRunCommandLogs = useTaskMessagesStore(
    (s) => s.clearAllRunCommandLogs,
  );
  const setRunCommandRunning = useTaskMessagesStore(
    (s) => s.setRunCommandRunning,
  );
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);

  return useMutation({
    mutationFn: ({
      id,
      cleanupWorktree,
    }: {
      id: string;
      cleanupWorktree?: boolean;
    }) => api.tasks.complete(id, { cleanupWorktree }),
    onSuccess: (result, { id }) => {
      const { task, worktreeCleanup } = result;

      clearAllRunCommandLogs(id);
      setRunCommandRunning(id, false);
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allActive'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allCompleted'] });
      invalidateFeedItems(queryClient);

      // Run worktree cleanup as a background job
      if (worktreeCleanup) {
        const jobId = addRunningJob({
          type: 'worktree-cleanup',
          title: `Cleaning up worktree ${worktreeCleanup.branchName}`,
          taskId: id,
          projectId: task.projectId,
          details: {
            branchName: worktreeCleanup.branchName,
            worktreePath: worktreeCleanup.worktreePath,
          },
        });

        void api.tasks.worktree
          .cleanupAfterCompletion(id, worktreeCleanup)
          .then(() => {
            markJobSucceeded(jobId);
            queryClient.invalidateQueries({ queryKey: ['tasks', id] });
            invalidateFeedItems(queryClient);
          })
          .catch((error) => {
            const message =
              error instanceof Error
                ? error.message
                : 'Worktree cleanup failed';
            markJobFailed(jobId, message);
          });
      }
    },
  });
}

export function useClearTaskUserCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.clearUserCompleted(id),
    onSuccess: (task, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allActive'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allCompleted'] });
      invalidateFeedItems(queryClient);
    },
  });
}

export function useAddSessionAllowedTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      input,
    }: {
      id: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => api.tasks.addSessionAllowedTool(id, toolName, input),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useRemoveSessionAllowedTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      pattern,
    }: {
      id: string;
      toolName: string;
      pattern?: string;
    }) => api.tasks.removeSessionAllowedTool(id, toolName, pattern),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useAllowForProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      input,
    }: {
      id: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => api.tasks.allowForProject(id, toolName, input),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useAllowForProjectWorktrees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      input,
    }: {
      id: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => api.tasks.allowForProjectWorktrees(id, toolName, input),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useAllowGlobally({
  onError,
}: { onError?: (error: Error) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      input,
    }: {
      id: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => api.tasks.allowGlobally(id, toolName, input),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['globalPermissions'] });
    },
    onError,
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      activeIds,
      completedIds,
    }: {
      projectId: string;
      activeIds: string[];
      completedIds: string[];
    }) => api.tasks.reorder(projectId, activeIds, completedIds),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId }],
      });
      invalidateFeedItems(queryClient);
    },
  });
}
