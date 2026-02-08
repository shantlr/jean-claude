import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
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
