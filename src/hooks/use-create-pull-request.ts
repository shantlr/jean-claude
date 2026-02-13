import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      title: string;
      description: string;
      isDraft: boolean;
      deleteWorktree?: boolean;
    }) => api.tasks.createPullRequest(params),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', params.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAddPrFileComments() {
  return useMutation({
    mutationFn: async (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      comments: Array<{
        filePath: string;
        line: number;
        content: string;
      }>;
    }) => {
      const results = await Promise.allSettled(
        params.comments.map((comment) =>
          api.azureDevOps.addPullRequestFileComment({
            providerId: params.providerId,
            projectId: params.projectId,
            repoId: params.repoId,
            pullRequestId: params.pullRequestId,
            filePath: comment.filePath,
            line: comment.line,
            content: comment.content,
          }),
        ),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(
          `${failed} of ${params.comments.length} comments failed to post`,
        );
      }

      return { total: params.comments.length, failed };
    },
  });
}
