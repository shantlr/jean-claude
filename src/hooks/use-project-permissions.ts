import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { PermissionAction } from '@shared/permission-types';

function queryKey(projectPath: string) {
  return ['projectPermissions', projectPath] as const;
}

export function useProjectPermissions(projectPath: string) {
  return useQuery({
    queryKey: queryKey(projectPath),
    queryFn: () => api.projectPermissions.get(projectPath),
    enabled: !!projectPath,
  });
}

export function useAddProjectPermissionRule(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      toolName,
      input,
      action,
    }: {
      toolName: string;
      input: Record<string, unknown>;
      action?: PermissionAction;
    }) => api.projectPermissions.addRule(projectPath, toolName, input, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
    },
  });
}

export function useRemoveProjectPermissionRule(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tool, pattern }: { tool: string; pattern?: string }) =>
      api.projectPermissions.removeRule(projectPath, tool, pattern),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
    },
  });
}

export function useEditProjectPermissionRule(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tool,
      oldPattern,
      newPattern,
      action,
    }: {
      tool: string;
      oldPattern: string | undefined;
      newPattern: string | undefined;
      action: PermissionAction;
    }) =>
      api.projectPermissions.editRule(
        projectPath,
        tool,
        oldPattern,
        newPattern,
        action,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
    },
  });
}
