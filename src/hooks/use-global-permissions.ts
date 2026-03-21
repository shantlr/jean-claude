import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

const QUERY_KEY = ['globalPermissions'] as const;

export function useGlobalPermissions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.globalPermissions.get(),
  });
}

export function useAddGlobalPermissionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      toolName,
      input,
    }: {
      toolName: string;
      input: Record<string, unknown>;
    }) => api.globalPermissions.addRule(toolName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useRemoveGlobalPermissionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tool, pattern }: { tool: string; pattern?: string }) =>
      api.globalPermissions.removeRule(tool, pattern),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
