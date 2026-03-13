import { useEffect, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
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
      shortcut: ['cmd+enter', 'cmd+backspace'],
      hideInCommandPalette: true,
      handler: () => {
        handleConfirm();
      },
    },
    isOpen &&
      hasWorktree && {
        label: 'Toggle Worktree Cleanup',
        shortcut: 'cmd+shift+w',
        hideInCommandPalette: true,
        handler: () => {
          if (isPending) return false;
          setDeleteWorktree((value) => !value);
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
            <span className="inline-flex items-center gap-1">
              Delete associated worktree and branch
              <Kbd shortcut="cmd+shift+w" className="text-[9px]" />
            </span>
            <span className="block text-xs text-neutral-400">
              If unchecked, the worktree is kept unless it has no changes.
            </span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          loading={isPending}
          disabled={isPending}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
          <span className="inline-flex items-center gap-1">
            <Kbd shortcut="cmd+enter" />
            <Kbd shortcut="cmd+backspace" />
          </span>
        </Button>
      </div>
    </Modal>
  );
}
