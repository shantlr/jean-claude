import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  ProjectCommand,
  NewProjectCommand,
  UpdateProjectCommand,
} from '@shared/run-command-types';

export function useProjectCommands(projectId: string) {
  return useQuery({
    queryKey: ['projectCommands', projectId],
    queryFn: () => api.projectCommands.findByProjectId(projectId),
  });
}

export function useCreateProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProjectCommand) => api.projectCommands.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommands', variables.projectId],
      });
    },
  });
}

export function useUpdateProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectCommand }) =>
      api.projectCommands.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommands'] });
    },
  });
}

export function useDeleteProjectCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projectCommands.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommands'] });
    },
  });
}

export function useReorderProjectCommands() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      commandIds,
    }: {
      projectId: string;
      commandIds: string[];
    }) => api.projectCommands.reorder(projectId, commandIds),
    onMutate: async ({ projectId, commandIds }) => {
      await queryClient.cancelQueries({
        queryKey: ['projectCommands', projectId],
      });
      const previous = queryClient.getQueryData<ProjectCommand[]>([
        'projectCommands',
        projectId,
      ]);
      queryClient.setQueryData<ProjectCommand[]>(
        ['projectCommands', projectId],
        (old) => {
          if (!old) return old;
          return commandIds
            .map((id, i) => {
              const cmd = old.find((c) => c.id === id);
              return cmd ? { ...cmd, sortOrder: i } : undefined;
            })
            .filter((cmd): cmd is ProjectCommand => cmd != null);
        },
      );
      return { previous };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['projectCommands', projectId],
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommands', projectId],
      });
    },
  });
}
