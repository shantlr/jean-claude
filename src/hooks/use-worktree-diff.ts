import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  api,
  type WorktreeDiffResult,
  type WorktreeFileContent,
} from '@/lib/api';

export function useWorktreeDiff(
  taskId: string | null,
  enabled: boolean = true,
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    refetch: refetchQuery,
    error,
  } = useQuery<WorktreeDiffResult>({
    queryKey: ['worktree-diff', taskId],
    queryFn: () => {
      if (!taskId) {
        return { files: [] };
      }
      return api.tasks.worktree.getDiff(taskId);
    },
    enabled: enabled && !!taskId,
    // Don't refetch automatically - user can refresh manually
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(() => {
    refetchQuery();
    // Also invalidate file content cache so files show updated content
    queryClient.invalidateQueries({
      queryKey: ['worktree-file-content', taskId],
    });
  }, [refetchQuery, queryClient, taskId]);

  return {
    data,
    error,
    isLoading,
    refresh,
  };
}

export function useWorktreeFileContent(
  taskId: string | null,
  filePath: string | null,
  status: 'added' | 'modified' | 'deleted' | null,
) {
  return useQuery<WorktreeFileContent>({
    queryKey: ['worktree-file-content', taskId, filePath],
    queryFn: () => {
      if (!taskId || !filePath || !status) {
        return { oldContent: null, newContent: null, isBinary: false };
      }
      return api.tasks.worktree.getFileContent(taskId, filePath, status);
    },
    enabled: !!taskId && !!filePath && !!status,
    // Cache file content for the session
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useWorktreeStatus(taskId: string | null) {
  return useQuery({
    queryKey: ['worktree-status', taskId],
    queryFn: () => {
      if (!taskId) {
        return {
          hasUncommittedChanges: false,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
        };
      }
      return api.tasks.worktree.getStatus(taskId);
    },
    enabled: !!taskId,
    // Refetch when window regains focus to catch external changes
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });
}

export function useWorktreeBranches(taskId: string | null) {
  return useQuery({
    queryKey: ['worktree-branches', taskId],
    queryFn: () => {
      if (!taskId) return [];
      return api.tasks.worktree.getBranches(taskId);
    },
    enabled: !!taskId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useCommitWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      message: string;
      stageAll: boolean;
    }) =>
      api.tasks.worktree.commit(params.taskId, {
        message: params.message,
        stageAll: params.stageAll,
      }),
    onSuccess: (_, { taskId }) => {
      // Invalidate status and diff queries
      queryClient.invalidateQueries({ queryKey: ['worktree-status', taskId] });
      queryClient.invalidateQueries({ queryKey: ['worktree-diff', taskId] });
      queryClient.invalidateQueries({
        queryKey: ['worktree-file-content', taskId],
      });
    },
  });
}

export function useMergeWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      targetBranch: string;
      squash?: boolean;
      commitMessage?: string;
    }) =>
      api.tasks.worktree.merge(params.taskId, {
        targetBranch: params.targetBranch,
        squash: params.squash,
        commitMessage: params.commitMessage,
      }),
    onSuccess: (_, { taskId }) => {
      // Invalidate all worktree-related queries for this task
      queryClient.invalidateQueries({ queryKey: ['worktree-status', taskId] });
      queryClient.invalidateQueries({ queryKey: ['worktree-diff', taskId] });
      queryClient.invalidateQueries({
        queryKey: ['worktree-file-content', taskId],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
