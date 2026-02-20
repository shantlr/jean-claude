import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ProjectTodo } from '@shared/types';

export function useProjectTodos(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-todos', { projectId }],
    queryFn: () => api.projectTodos.list(projectId!),
    enabled: !!projectId,
  });
}

export function useProjectTodoCount(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-todos-count', { projectId }],
    queryFn: () => api.projectTodos.count(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; content: string }) =>
      api.projectTodos.create(data),
    onSuccess: (todo) => {
      queryClient.invalidateQueries({
        queryKey: ['project-todos', { projectId: todo.projectId }],
      });
      queryClient.invalidateQueries({
        queryKey: ['project-todos-count', { projectId: todo.projectId }],
      });
    },
  });
}

export function useUpdateProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.projectTodos.update(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-todos'] });
    },
  });
}

export function useDeleteProjectTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projectTodos.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-todos'] });
      queryClient.invalidateQueries({ queryKey: ['project-todos-count'] });
    },
  });
}

export function useReorderProjectTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      orderedIds,
    }: {
      projectId: string;
      orderedIds: string[];
    }) => api.projectTodos.reorder(projectId, orderedIds),
    onMutate: async ({ projectId, orderedIds }) => {
      await queryClient.cancelQueries({
        queryKey: ['project-todos', { projectId }],
      });

      const previous = queryClient.getQueryData<ProjectTodo[]>([
        'project-todos',
        { projectId },
      ]);

      if (previous) {
        const reordered = orderedIds
          .map((id) => previous.find((t) => t.id === id))
          .filter(Boolean) as ProjectTodo[];
        queryClient.setQueryData(['project-todos', { projectId }], reordered);
      }

      return { previous, projectId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['project-todos', { projectId: context.projectId }],
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['project-todos', { projectId }],
      });
    },
  });
}
