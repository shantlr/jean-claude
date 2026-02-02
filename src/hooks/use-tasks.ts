import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import type { InteractionMode, NewTask, UpdateTask } from '../../shared/types';

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
    mutationFn: (data: NewTask) => api.tasks.create(data),
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
      data: NewTask & {
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
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useSetTaskMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: InteractionMode }) =>
      api.tasks.setMode(id, mode),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.setQueryData(['task', task.id], task);
    },
  });
}

export function useMarkTaskAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lastReadIndex,
    }: {
      id: string;
      lastReadIndex: number;
    }) => api.tasks.updateLastReadIndex(id, lastReadIndex),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useToggleTaskUserCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.toggleUserCompleted(id),
    onSuccess: (task, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}

export function useClearTaskUserCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.clearUserCompleted(id),
    onSuccess: (task, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
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
