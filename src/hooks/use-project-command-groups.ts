import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  NewProjectCommandGroup,
  ProjectCommandGroup,
  UpdateProjectCommandGroup,
} from '@shared/run-command-types';
import { api } from '@/lib/api';


export function useProjectCommandGroups(projectId: string) {
  return useQuery({
    queryKey: ['projectCommandGroups', projectId],
    queryFn: () => api.projectCommandGroups.findByProjectId(projectId),
  });
}

export function useCreateProjectCommandGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProjectCommandGroup) =>
      api.projectCommandGroups.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommandGroups', variables.projectId],
      });
    },
  });
}

export function useUpdateProjectCommandGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateProjectCommandGroup;
    }) => api.projectCommandGroups.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommandGroups'] });
    },
  });
}

export function useDeleteProjectCommandGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projectCommandGroups.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCommandGroups'] });
    },
  });
}

export function useReorderProjectCommandGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      groupIds,
    }: {
      projectId: string;
      groupIds: string[];
    }) => api.projectCommandGroups.reorder(projectId, groupIds),
    onMutate: async ({ projectId, groupIds }) => {
      await queryClient.cancelQueries({
        queryKey: ['projectCommandGroups', projectId],
      });
      const previous = queryClient.getQueryData<ProjectCommandGroup[]>([
        'projectCommandGroups',
        projectId,
      ]);
      queryClient.setQueryData<ProjectCommandGroup[]>(
        ['projectCommandGroups', projectId],
        (old) => {
          if (!old) return old;
          return groupIds
            .map((id, i) => {
              const group = old.find((entry) => entry.id === id);
              return group ? { ...group, sortOrder: i } : undefined;
            })
            .filter((group): group is ProjectCommandGroup => group != null);
        },
      );
      return { previous };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['projectCommandGroups', projectId],
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommandGroups', projectId],
      });
    },
  });
}
