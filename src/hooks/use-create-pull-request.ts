import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function usePushBranch() {
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.worktree.pushBranch(taskId),
  });
}

export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => api.azureDevOps.createPullRequest(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
