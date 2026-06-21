import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ProjectCommand,
  ProjectCommandGroup,
  RunCommandConfigItem,
} from '@shared/run-command-types';
import { api } from '@/lib/api';


export function useReorderProjectRunConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      items,
    }: {
      projectId: string;
      items: RunCommandConfigItem[];
    }) => api.projectRunConfig.reorder(projectId, items),
    onMutate: async ({ projectId, items }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['projectCommands', projectId] }),
        queryClient.cancelQueries({
          queryKey: ['projectCommandGroups', projectId],
        }),
      ]);

      const previousCommands = queryClient.getQueryData<ProjectCommand[]>([
        'projectCommands',
        projectId,
      ]);
      const previousGroups = queryClient.getQueryData<ProjectCommandGroup[]>([
        'projectCommandGroups',
        projectId,
      ]);

      queryClient.setQueryData<ProjectCommand[]>(
        ['projectCommands', projectId],
        (old) => {
          if (!old) return old;
          const byId = new Map(old.map((command) => [command.id, command]));
          return items
            .filter((item) => item.type === 'command')
            .map((item, index) => {
              const command = byId.get(item.id);
              return command ? { ...command, sortOrder: index } : undefined;
            })
            .filter((command): command is ProjectCommand => command != null);
        },
      );

      queryClient.setQueryData<ProjectCommandGroup[]>(
        ['projectCommandGroups', projectId],
        (old) => {
          if (!old) return old;
          const byId = new Map(old.map((group) => [group.id, group]));
          return items
            .filter((item) => item.type === 'group')
            .map((item, index) => {
              const group = byId.get(item.id);
              return group ? { ...group, sortOrder: index } : undefined;
            })
            .filter((group): group is ProjectCommandGroup => group != null);
        },
      );

      return { previousCommands, previousGroups };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previousCommands) {
        queryClient.setQueryData(
          ['projectCommands', projectId],
          context.previousCommands,
        );
      }
      if (context?.previousGroups) {
        queryClient.setQueryData(
          ['projectCommandGroups', projectId],
          context.previousGroups,
        );
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projectCommands', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['projectCommandGroups', projectId],
      });
    },
  });
}
