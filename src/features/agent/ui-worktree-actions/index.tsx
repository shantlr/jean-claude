import { GitCommit, GitMerge, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import {
  useWorktreeStatus,
  useWorktreeBranches,
  useCommitWorktree,
  useMergeWorktree,
} from '@/hooks/use-worktree-diff';

import { CommitModal } from './commit-modal';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import { MergeSuccessDialog } from './merge-success-dialog';

interface WorktreeActionsProps {
  taskId: string;
  branchName: string;
  defaultBranch: string | null;
  taskName: string | null;
  onMergeComplete: () => void;
}

export function WorktreeActions({
  taskId,
  branchName,
  defaultBranch,
  taskName,
  onMergeComplete,
}: WorktreeActionsProps) {
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  const [isMergeSuccessOpen, setIsMergeSuccessOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    defaultBranch ?? 'main',
  );

  const { data: status, isLoading: isStatusLoading } =
    useWorktreeStatus(taskId);
  const { data: branches, isLoading: isBranchesLoading } =
    useWorktreeBranches(taskId);
  const commitMutation = useCommitWorktree();
  const mergeMutation = useMergeWorktree();

  const canCommit = status?.hasUncommittedChanges ?? false;
  const canMerge = !status?.hasUncommittedChanges && !isStatusLoading;

  // Set default branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranch) {
      const defaultTarget =
        defaultBranch ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setSelectedBranch(defaultTarget);
    }
  }, [branches, defaultBranch, selectedBranch]);

  const handleCommit = async (message: string, stageAll: boolean) => {
    await commitMutation.mutateAsync({ taskId, message, stageAll });
    setIsCommitModalOpen(false);
  };

  const handleMerge = async (params: {
    squash: boolean;
    commitMessage?: string;
  }) => {
    const result = await mergeMutation.mutateAsync({
      taskId,
      targetBranch: selectedBranch,
      squash: params.squash,
      commitMessage: params.commitMessage,
    });

    setIsMergeConfirmOpen(false);

    if (result.success) {
      setIsMergeSuccessOpen(true);
    } else {
      // Error is handled by the mutation
    }
  };

  const handleMergeSuccessClose = (markComplete: boolean) => {
    setIsMergeSuccessOpen(false);
    onMergeComplete();
    if (markComplete) {
      // Will be handled by parent
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-700 p-3">
      {/* Commit button */}
      <button
        onClick={() => setIsCommitModalOpen(true)}
        disabled={!canCommit || commitMutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        title={canCommit ? 'Commit changes' : 'No changes to commit'}
      >
        {commitMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitCommit className="h-4 w-4" />
        )}
        Commit
      </button>

      {/* Merge section */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-neutral-400">
          Merge into
        </label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          disabled={isBranchesLoading || !branches?.length}
          className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
        >
          {branches?.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsMergeConfirmOpen(true)}
          disabled={!canMerge || mergeMutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            canMerge ? 'Merge worktree' : 'Commit or discard changes first'
          }
        >
          {mergeMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitMerge className="h-4 w-4" />
          )}
          Merge
        </button>
      </div>

      {/* Modals */}
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        onCommit={handleCommit}
        isPending={commitMutation.isPending}
        error={commitMutation.error?.message}
      />

      <MergeConfirmDialog
        isOpen={isMergeConfirmOpen}
        onClose={() => setIsMergeConfirmOpen(false)}
        onConfirm={handleMerge}
        branchName={branchName}
        targetBranch={selectedBranch}
        isPending={mergeMutation.isPending}
        error={mergeMutation.data?.error}
        defaultCommitMessage={taskName ?? undefined}
      />

      <MergeSuccessDialog
        isOpen={isMergeSuccessOpen}
        onClose={handleMergeSuccessClose}
        targetBranch={selectedBranch}
        taskId={taskId}
      />
    </div>
  );
}
