import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';

export function DeleteTaskDialog({
  isOpen,
  onClose,
  onConfirm,
  taskName,
  hasWorktree,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: { deleteWorktree: boolean }) => void;
  taskName: string;
  hasWorktree: boolean;
  isPending: boolean;
}) {
  const [deleteWorktree, setDeleteWorktree] = useState(true);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDeleteWorktree(true);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isPending) return;
    onConfirm({ deleteWorktree: hasWorktree ? deleteWorktree : false });
  };

  useCommands('delete-task-dialog', [
    isOpen && {
      label: 'Confirm Delete',
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
      title="Delete Task"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
    >
      <p className="mb-3 text-sm text-neutral-300">
        Are you sure you want to delete{' '}
        <span className="font-medium text-neutral-100">{taskName}</span>? This
        action cannot be undone.
      </p>

      {hasWorktree && (
        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={deleteWorktree}
            onChange={(e) => setDeleteWorktree(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-700"
          />
          <span>
            Delete associated worktree and branch
            <span className="block text-xs text-neutral-400">
              If unchecked, the worktree is kept unless it has no changes.
            </span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Delete
          <Kbd shortcut="cmd+enter" />
        </button>
      </div>
    </Modal>
  );
}
