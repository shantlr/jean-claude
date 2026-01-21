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
    mutationFn: ({ id, lastReadIndex }: { id: string; lastReadIndex: number }) =>
      api.tasks.updateLastReadIndex(id, lastReadIndex),
    onSuccess: (task, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}
