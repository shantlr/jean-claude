import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api, type WorktreeDiffResult, type WorktreeFileContent } from '@/lib/api';

export function useWorktreeDiff(
  worktreePath: string | null,
  startCommitHash: string | null,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  const query = useQuery<WorktreeDiffResult>({
    queryKey: ['worktree-diff', worktreePath, startCommitHash],
    queryFn: () => {
      if (!worktreePath || !startCommitHash) {
        return { files: [] };
      }
      return api.worktree.git.getDiff(worktreePath, startCommitHash);
    },
    enabled: enabled && !!worktreePath && !!startCommitHash,
    // Don't refetch automatically - user can refresh manually
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['worktree-diff', worktreePath, startCommitHash],
    });
  }, [queryClient, worktreePath, startCommitHash]);

  return {
    ...query,
    refresh,
  };
}

export function useWorktreeFileContent(
  worktreePath: string | null,
  startCommitHash: string | null,
  filePath: string | null,
  status: 'added' | 'modified' | 'deleted' | null
) {
  return useQuery<WorktreeFileContent>({
    queryKey: ['worktree-file-content', worktreePath, startCommitHash, filePath],
    queryFn: () => {
      if (!worktreePath || !startCommitHash || !filePath || !status) {
        return { oldContent: null, newContent: null, isBinary: false };
      }
      return api.worktree.git.getFileContent(worktreePath, startCommitHash, filePath, status);
    },
    enabled: !!worktreePath && !!startCommitHash && !!filePath && !!status,
    // Cache file content for the session
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
