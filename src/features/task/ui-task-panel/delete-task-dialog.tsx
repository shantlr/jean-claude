import { useEffect, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
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
      <p className="text-ink-1 mb-3 text-sm">
        Are you sure you want to delete{' '}
        <span className="text-ink-0 font-medium">{taskName}</span>? This action
        cannot be undone.
      </p>

      {hasWorktree && (
        <div className="mb-4">
          <Checkbox
            checked={deleteWorktree}
            onChange={setDeleteWorktree}
            label="Delete associated worktree and branch"
            description="If unchecked, the worktree is kept unless it has no changes."
          />
          <Kbd shortcut="cmd+shift+w" className="mt-0.5 ml-6 text-[9px]" />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          onClick={onClose}
          disabled={isPending}
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          loading={isPending}
          disabled={isPending}
          variant="danger"
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
