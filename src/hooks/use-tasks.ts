import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
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
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteWorktree,
    }: {
      id: string;
      deleteWorktree?: boolean;
    }) => api.tasks.delete(id, { deleteWorktree }),
    onSuccess: (_, { id }) => {
      // TODO(multi-step): clearAllRunCommandLogs needs stepId, not taskId.
      // Run command logs will be garbage collected when the step is evicted from cache.
      // The task panel already clears logs correctly via activeStepId.
      void id;
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
  return useMutation({
    mutationFn: (id: string) => api.tasks.toggleUserCompleted(id),
    onSuccess: (task, id) => {
      // TODO(multi-step): clearAllRunCommandLogs needs stepId, not taskId.
      // Run command logs are cleared correctly in the task panel via activeStepId.
      void id;
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allActive'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'allCompleted'] });
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
    mutationFn: ({ id, toolName }: { id: string; toolName: string }) =>
      api.tasks.removeSessionAllowedTool(id, toolName),
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
    },
  });
}
