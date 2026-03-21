import {
  ExternalLink,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Loader2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Select } from '@/common/ui/select';
import { useProject } from '@/hooks/use-projects';
import { useAiSkillSlotsSetting } from '@/hooks/use-settings';
import {
  useWorktreeStatus,
  useWorktreeBranches,
  useCommitWorktree,
  useMergeWorktree,
} from '@/hooks/use-worktree-diff';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useToastStore } from '@/stores/toasts';

import { CommitModal } from './commit-modal';
import { MergeConfirmDialog } from './merge-confirm-dialog';

export function WorktreeActions({
  taskId,
  projectId,
  branchName,
  sourceBranch,
  defaultBranch,
  hasRepoLink,
  pullRequestUrl,
  onMergeStarted,
  onOpenPrView,
}: {
  taskId: string;
  projectId: string;
  branchName: string;
  sourceBranch: string | null;
  defaultBranch: string | null;
  hasRepoLink: boolean;
  pullRequestUrl: string | null;
  onMergeStarted: () => void;
  onOpenPrView: () => void;
}) {
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  // Priority: sourceBranch (where worktree was created from) > defaultBranch (project setting) > 'main'
  const [selectedBranch, setSelectedBranch] = useState<string>(
    sourceBranch ?? defaultBranch ?? 'main',
  );

  const { data: status, isLoading: isStatusLoading } =
    useWorktreeStatus(taskId);
  const { data: branches, isLoading: isBranchesLoading } =
    useWorktreeBranches(taskId);
  const commitMutation = useCommitWorktree();
  const mergeMutation = useMergeWorktree();
  const { data: project } = useProject(projectId);
  const { data: globalSlots } = useAiSkillSlotsSetting();

  // Check if the merge-commit-message AI slot is configured (project or global)
  const canAutoGenerateMergeMessage = !!(
    project?.aiSkillSlots?.['merge-commit-message'] ||
    globalSlots?.['merge-commit-message']
  );

  // Check if the commit-message AI slot is configured (project or global)
  const canAutoGenerateCommitMessage = !!(
    project?.aiSkillSlots?.['commit-message'] || globalSlots?.['commit-message']
  );

  const mergeDialogRef = useRef<HTMLDivElement>(null);
  const { triggerAnimation } = useShrinkToTarget({
    panelRef: mergeDialogRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const addToast = useToastStore((s) => s.addToast);

  const canCommit = status?.hasUncommittedChanges ?? false;
  const canMerge = !status?.hasStagedChanges && !isStatusLoading;
  const canCreatePr = !status?.hasUncommittedChanges && !isStatusLoading;

  // Set default branch when branches load
  // Priority: sourceBranch > defaultBranch > main > master > first branch
  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranch) {
      const defaultTarget =
        (sourceBranch && branches.includes(sourceBranch)
          ? sourceBranch
          : null) ??
        (defaultBranch && branches.includes(defaultBranch)
          ? defaultBranch
          : null) ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setSelectedBranch(defaultTarget);
    }
  }, [branches, sourceBranch, defaultBranch, selectedBranch]);

  const handleCommit = async (message: string, stageAll: boolean) => {
    await commitMutation.mutateAsync({ taskId, message, stageAll });
    setIsCommitModalOpen(false);
  };

  const handleMerge = (params: {
    squash: boolean;
    commitMessage?: string;
    commitAllUnstaged?: boolean;
  }) => {
    // 1. Create background job
    const jobId = addRunningJob({
      type: 'merge',
      title: `Merging ${branchName} → ${selectedBranch}`,
      taskId,
      projectId,
      details: {
        branchName,
        targetBranch: selectedBranch,
      },
    });

    // 2. Animate the modal shrinking to jobs button
    void triggerAnimation();

    // 3. Close dialog and diff view immediately
    setIsMergeConfirmOpen(false);
    onMergeStarted();

    // 4. Fire-and-forget merge
    void mergeMutation
      .mutateAsync({
        taskId,
        targetBranch: selectedBranch,
        squash: params.squash,
        commitMessage: params.commitMessage,
        commitAllUnstaged: false,
      })
      .then((result) => {
        if (result.success) {
          markJobSucceeded(jobId);
        } else {
          markJobFailed(jobId, result.error ?? 'Merge failed');
          addToast({
            type: 'error',
            message: result.error ?? 'An error occurred while merging.',
          });
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Merge failed';
        markJobFailed(jobId, message);
        addToast({ type: 'error', message });
      });
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
        <Select
          value={isBranchesLoading ? '' : selectedBranch}
          options={
            isBranchesLoading
              ? [{ value: '', label: 'Loading…' }]
              : (branches ?? []).map((branch) => ({
                  value: branch,
                  label: branch,
                }))
          }
          onChange={setSelectedBranch}
          disabled={isBranchesLoading || !branches?.length}
          className="w-full justify-between"
        />
        <button
          type="button"
          onClick={() => setIsMergeConfirmOpen(true)}
          disabled={!canMerge || mergeMutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          title={canMerge ? 'Merge worktree' : 'Commit staged changes first'}
        >
          {mergeMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitMerge className="h-4 w-4" />
          )}
          Merge
        </button>
      </div>

      {/* Create PR / See PR */}
      {hasRepoLink &&
        (pullRequestUrl ? (
          <a
            href={pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600"
            title="View pull request"
          >
            <ExternalLink className="h-4 w-4" />
            See PR
          </a>
        ) : (
          <button
            type="button"
            onClick={onOpenPrView}
            disabled={!canCreatePr}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
            title={canCreatePr ? 'Create pull request' : 'Commit changes first'}
          >
            <GitPullRequest className="h-4 w-4" />
            Create PR
          </button>
        ))}

      {/* Modals */}
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        onCommit={handleCommit}
        isPending={commitMutation.isPending}
        error={commitMutation.error?.message}
        taskId={taskId}
        canAutoGenerate={canAutoGenerateCommitMessage}
      />

      <MergeConfirmDialog
        isOpen={isMergeConfirmOpen}
        onClose={() => setIsMergeConfirmOpen(false)}
        onConfirm={handleMerge}
        taskId={taskId}
        branchName={branchName}
        targetBranch={selectedBranch}
        isPending={mergeMutation.isPending}
        hasUnstagedChanges={status?.hasUnstagedChanges ?? false}
        canAutoGenerateCommitMessage={canAutoGenerateMergeMessage}
        contentRef={mergeDialogRef}
      />
    </div>
  );
}
