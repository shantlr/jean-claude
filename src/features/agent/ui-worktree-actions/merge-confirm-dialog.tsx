import { Loader2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import {
  useCheckMergeConflicts,
  useCommitWorktree,
} from '@/hooks/use-worktree-diff';

export function MergeConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  taskId,
  branchName,
  targetBranch,
  isPending,
  hasUnstagedChanges,
  defaultCommitMessage,
  contentRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    squash: boolean;
    commitMessage?: string;
    commitAllUnstaged?: boolean;
  }) => void | Promise<void>;
  taskId: string;
  branchName: string;
  targetBranch: string;
  isPending: boolean;
  hasUnstagedChanges: boolean;
  defaultCommitMessage?: string;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  const [squash, setSquash] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitAllUnstaged, setCommitAllUnstaged] =
    useState(hasUnstagedChanges);
  const commitMessageRef = useRef<HTMLTextAreaElement>(null);
  const submitLockRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const commitMutation = useCommitWorktree();
  const checkMergeConflictsMutation = useCheckMergeConflicts();
  const { mutateAsync: checkMergeConflicts, isPending: isCheckingConflicts } =
    checkMergeConflictsMutation;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSquash(true);
      setCommitMessage(defaultCommitMessage ?? '');
      setCommitAllUnstaged(hasUnstagedChanges);
      setSubmitError(null);
      setHasConflicts(false);
      setCheckError(null);
    }
  }, [isOpen, defaultCommitMessage, hasUnstagedChanges]);

  useEffect(() => {
    if (!isOpen) return;

    let isCanceled = false;

    const runCheck = async () => {
      try {
        const result = await checkMergeConflicts({
          taskId,
          targetBranch,
        });

        if (isCanceled) return;

        if (result.error) {
          setCheckError(result.error);
          setHasConflicts(false);
          return;
        }

        setCheckError(null);
        setHasConflicts(result.hasConflicts);
      } catch (error) {
        if (isCanceled) return;
        setCheckError(
          error instanceof Error ? error.message : 'Failed to check conflicts',
        );
      }
    };

    void runCheck();

    return () => {
      isCanceled = true;
    };
  }, [isOpen, taskId, targetBranch, checkMergeConflicts]);

  useEffect(() => {
    if (!isOpen || !squash) return;

    requestAnimationFrame(() => {
      commitMessageRef.current?.focus();
    });
  }, [isOpen, squash]);

  const canConfirm =
    !isPending &&
    !isSubmitting &&
    (!squash || !!commitMessage.trim()) &&
    (!hasUnstagedChanges || commitAllUnstaged);

  const handleConfirm = async () => {
    if (!canConfirm || submitLockRef.current) return;

    submitLockRef.current = true;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (hasUnstagedChanges && commitAllUnstaged) {
        await commitMutation.mutateAsync({
          taskId,
          message: 'chore: commit unstaged changes before merge',
          stageAll: true,
        });
      }

      const result = await checkMergeConflicts({ taskId, targetBranch });
      if (result.error) {
        setSubmitError(`Unable to check merge conflicts: ${result.error}`);
        return;
      }

      if (result.hasConflicts) {
        setSubmitError(
          'Merge conflicts were detected with this target branch. Resolve them before merging.',
        );
        return;
      }

      await onConfirm({
        squash,
        commitMessage: squash ? commitMessage : undefined,
        commitAllUnstaged: false,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to run merge pre-check',
      );
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  useCommands('merge-confirm-dialog', [
    isOpen && {
      label: 'Merge',
      shortcut: 'cmd+enter',
      hideInCommandPalette: true,
      handler: () => {
        handleConfirm();
      },
    },
  ]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Worktree"
      closeOnClickOutside={!isPending && !isSubmitting}
      closeOnEscape={!isPending && !isSubmitting}
      contentRef={contentRef}
    >
      <p className="mb-4 text-neutral-200">
        Merge branch{' '}
        <span className="font-mono text-blue-400">{branchName}</span> into{' '}
        <span className="font-mono text-green-400">{targetBranch}</span>?
      </p>

      {isCheckingConflicts && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking for merge conflicts...
        </div>
      )}

      {hasConflicts && (
        <div className="mb-4 rounded-md border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          Merge conflicts were detected with this target branch. Resolve them
          before merging.
        </div>
      )}

      {checkError && (
        <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Unable to check merge conflicts: {checkError}
        </div>
      )}

      {submitError && (
        <div className="mb-4 rounded-md border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {submitError}
        </div>
      )}

      {hasUnstagedChanges && (
        <label className="mb-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={commitAllUnstaged}
            onChange={(e) => setCommitAllUnstaged(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-800"
          />
          <span className="text-sm text-neutral-200">
            Commit all unstaged files before merge
          </span>
        </label>
      )}

      {/* Squash option */}
      <label className="mb-4 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={squash}
          onChange={(e) => setSquash(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-800"
        />
        <span className="text-sm text-neutral-200">Squash commits</span>
      </label>

      {/* Commit message (shown when squash is enabled) */}
      {squash && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-neutral-400">
            Commit message
          </label>
          <textarea
            ref={commitMessageRef}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Enter commit message..."
            rows={3}
            className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      <div className="mb-4 rounded-md bg-neutral-900 p-3 text-sm text-neutral-400">
        <p className="mb-2">This will:</p>
        <ul className="list-inside list-disc space-y-1">
          {squash ? (
            <li>Squash all commits into a single commit on {targetBranch}</li>
          ) : (
            <li>Merge all commits into {targetBranch}</li>
          )}
          <li>Delete the worktree and branch</li>
          <li>Mark the task as completed</li>
        </ul>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending || isSubmitting}
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(isPending || isSubmitting) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {squash ? 'Squash & Merge' : 'Merge'}
          <Kbd shortcut="cmd+enter" />
        </button>
      </div>
    </Modal>
  );
}
