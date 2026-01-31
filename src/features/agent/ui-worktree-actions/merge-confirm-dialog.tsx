import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export function MergeConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  branchName,
  targetBranch,
  isPending,
  error,
  defaultCommitMessage,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    squash: boolean;
    commitMessage?: string;
  }) => Promise<void>;
  branchName: string;
  targetBranch: string;
  isPending: boolean;
  error?: string;
  defaultCommitMessage?: string;
}) {
  const [squash, setSquash] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSquash(false);
      setCommitMessage(defaultCommitMessage ?? '');
    }
  }, [isOpen, defaultCommitMessage]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      squash,
      commitMessage: squash ? commitMessage : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">
            Merge Worktree
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-4 text-neutral-200">
            Merge branch{' '}
            <span className="font-mono text-blue-400">{branchName}</span> into{' '}
            <span className="font-mono text-green-400">{targetBranch}</span>?
          </p>

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
                <li>
                  Squash all commits into a single commit on {targetBranch}
                </li>
              ) : (
                <li>Merge all commits into {targetBranch}</li>
              )}
              <li>Delete the worktree and branch</li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || (squash && !commitMessage.trim())}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {squash ? 'Squash & Merge' : 'Merge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
