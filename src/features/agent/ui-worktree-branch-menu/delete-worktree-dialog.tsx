import { AlertTriangle, Loader2 } from 'lucide-react';

import { useWorktreeStatus } from '@/hooks/use-worktree-diff';

export function DeleteWorktreeContent({
  onClose,
  onConfirm,
  branchName,
  taskId,
  isPending,
}: {
  onClose: () => void;
  onConfirm: () => void;
  branchName: string;
  taskId: string;
  isPending: boolean;
}) {
  const { data: status, isLoading: isStatusLoading } =
    useWorktreeStatus(taskId);

  const hasUncommitted = status?.hasUncommittedChanges ?? false;

  if (isStatusLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking worktree status...
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-neutral-400">
        This will remove the worktree directory. The branch{' '}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
          {branchName}
        </code>{' '}
        will be kept.
      </p>

      {hasUncommitted && (
        <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-950/50 px-3 py-2 text-sm text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>There are uncommitted changes that will be lost.</span>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="flex-1 cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {isPending ? 'Deleting...' : 'Delete Worktree'}
        </button>
      </div>
    </>
  );
}
