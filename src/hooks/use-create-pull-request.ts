import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { useToastStore } from '@/stores/toasts';

export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      title: string;
      description: string;
      isDraft: boolean;
      deleteWorktree?: boolean;
      commitUnstaged?: boolean;
    }) => api.tasks.createPullRequest(params),
    onSuccess: (result, params) => {
      if (result.editorCloseWarning) {
        addToast({ type: 'error', message: result.editorCloseWarning });
      }
      queryClient.invalidateQueries({ queryKey: ['tasks', params.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: feedQueryKeys.pullRequests });
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      queryClient.invalidateQueries({
        queryKey: ['all-projects-pull-requests'],
      });
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
