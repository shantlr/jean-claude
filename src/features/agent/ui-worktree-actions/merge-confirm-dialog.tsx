import { Loader2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { Textarea } from '@/common/ui/textarea';
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
  canAutoGenerateCommitMessage,
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
  canAutoGenerateCommitMessage: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  const [squash, setSquash] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitAllUnstaged, setCommitAllUnstaged] =
    useState(hasUnstagedChanges);
  const commitMessageRef = useRef<HTMLTextAreaElement>(null);
  const hasUnstagedChangesRef = useRef(hasUnstagedChanges);
  const submitLockRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const commitMutation = useCommitWorktree();
  const checkMergeConflictsMutation = useCheckMergeConflicts();
  const { mutateAsync: checkMergeConflicts, isPending: isCheckingConflicts } =
    checkMergeConflictsMutation;

  // Keep ref in sync
  useEffect(() => {
    hasUnstagedChangesRef.current = hasUnstagedChanges;
  }, [hasUnstagedChanges]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) return;

    setSquash(true);
    setCommitMessage('');
    setCommitAllUnstaged(hasUnstagedChangesRef.current);
    setSubmitError(null);
    setHasConflicts(false);
    setCheckError(null);
  }, [isOpen]);

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

  // When squash is enabled and auto-generate is not available, require a commit message
  const needsCommitMessage =
    squash && !canAutoGenerateCommitMessage && !commitMessage.trim();
  const canConfirm =
    !isPending &&
    !isSubmitting &&
    !needsCommitMessage &&
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
        commitMessage: squash ? commitMessage || undefined : undefined,
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
      <p className="text-ink-1 mb-4">
        Merge branch{' '}
        <span className="text-acc-ink font-mono">{branchName}</span> into{' '}
        <span className="text-status-done font-mono">{targetBranch}</span>?
      </p>

      {isCheckingConflicts && (
        <div className="border-glass-border bg-bg-0 text-ink-1 mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
        <Checkbox
          checked={commitAllUnstaged}
          onChange={setCommitAllUnstaged}
          label="Commit all unstaged files before merge"
          className="mb-4"
        />
      )}

      {/* Squash option */}
      <Checkbox
        checked={squash}
        onChange={setSquash}
        label="Squash commits"
        className="mb-4"
      />

      {/* Commit message (shown when squash is enabled) */}
      {squash && (
        <div className="mb-4">
          <label className="text-ink-2 mb-1.5 block text-xs font-medium">
            Commit message
          </label>
          <Textarea
            ref={commitMessageRef}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={
              canAutoGenerateCommitMessage
                ? 'Leave empty to auto-generate from changes'
                : 'Enter commit message...'
            }
            rows={3}
            size="sm"
          />
        </div>
      )}

      <div className="bg-bg-0 text-ink-2 mb-4 rounded-md p-3 text-sm">
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
        <Button
          onClick={onClose}
          disabled={isPending || isSubmitting}
          variant="ghost"
          size="md"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!canConfirm}
          loading={isPending || isSubmitting}
          variant="primary"
          size="md"
        >
          {squash ? 'Squash & Merge' : 'Merge'}
          <Kbd shortcut="cmd+enter" />
        </Button>
      </div>
    </Modal>
  );
}
