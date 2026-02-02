import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useScanNonExistentProjects() {
  return useMutation({
    mutationFn: () => api.claudeProjects.findNonExistent(),
  });
}

export function useCleanupClaudeProjects() {
  return useMutation({
    mutationFn: (params: { paths: string[]; contentHash: string }) =>
      api.claudeProjects.cleanup(params),
  });
}
