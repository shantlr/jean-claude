import {
  ExternalLink,
  GitCommit,
  GitMerge,
  GitPullRequest,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import { useProject } from '@/hooks/use-projects';
import { useAiSkillSlotsSetting } from '@/hooks/use-settings';
import {
  useWorktreeStatus,
  useWorktreeBranches,
  useCommitWorktree,
  useMergeWorktree,
} from '@/hooks/use-worktree-diff';
import {
  useBackgroundJobsStore,
  useRunningBackgroundJobsForTask,
} from '@/stores/background-jobs';
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

  const commitDialogRef = useRef<HTMLDivElement>(null);
  const { triggerAnimation: triggerCommitAnimation } = useShrinkToTarget({
    panelRef: commitDialogRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  const mergeDialogRef = useRef<HTMLDivElement>(null);
  const { triggerAnimation: triggerMergeAnimation } = useShrinkToTarget({
    panelRef: mergeDialogRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const addToast = useToastStore((s) => s.addToast);

  const runningBgJobs = useRunningBackgroundJobsForTask(taskId);
  const hasRunningCommitJob = runningBgJobs.some((j) => j.type === 'commit');

  const canCommit =
    (status?.hasUncommittedChanges ?? false) && !hasRunningCommitJob;
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

  const handleCommit = (message: string, stageAll: boolean) => {
    // 1. Create background job
    const jobId = addRunningJob({
      type: 'commit',
      title: `Committing changes`,
      taskId,
      projectId,
      details: { message },
    });

    // 2. Animate the modal shrinking to jobs button
    void triggerCommitAnimation();

    // 3. Close dialog immediately
    setIsCommitModalOpen(false);

    // 4. Fire-and-forget commit
    void commitMutation
      .mutateAsync({ taskId, message, stageAll })
      .then(() => {
        markJobSucceeded(jobId);
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : 'Commit failed';
        markJobFailed(jobId, msg);
        addToast({ type: 'error', message: msg });
      });
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
    void triggerMergeAnimation();

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
      <Button
        onClick={() => setIsCommitModalOpen(true)}
        disabled={!canCommit}
        loading={hasRunningCommitJob}
        variant="secondary"
        size="md"
        icon={<GitCommit />}
        className="w-full"
        title={canCommit ? 'Commit changes' : 'No changes to commit'}
      >
        Commit
      </Button>

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
        <Button
          onClick={() => setIsMergeConfirmOpen(true)}
          disabled={!canMerge}
          loading={mergeMutation.isPending}
          variant="primary"
          size="md"
          icon={<GitMerge />}
          className="w-full"
          title={canMerge ? 'Merge worktree' : 'Commit staged changes first'}
        >
          Merge
        </Button>
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
          <Button
            onClick={onOpenPrView}
            disabled={!canCreatePr}
            variant="primary"
            size="md"
            icon={<GitPullRequest />}
            className="w-full bg-green-700 hover:bg-green-600"
            title={canCreatePr ? 'Create pull request' : 'Commit changes first'}
          >
            Create PR
          </Button>
        ))}

      {/* Modals */}
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        onCommit={handleCommit}
        taskId={taskId}
        canAutoGenerate={canAutoGenerateCommitMessage}
        contentRef={commitDialogRef}
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
