import { useEffect, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';

export function CompleteTaskDialog({
  isOpen,
  onClose,
  onConfirm,
  hasWorktree,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: { cleanupWorktree: boolean }) => void;
  hasWorktree: boolean;
  isPending: boolean;
}) {
  const [cleanupWorktree, setCleanupWorktree] = useState(true);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCleanupWorktree(true);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isPending) return;
    onConfirm({ cleanupWorktree: hasWorktree ? cleanupWorktree : false });
  };

  useCommands('complete-task-dialog', [
    isOpen && {
      label: 'Confirm Complete',
      shortcut: 'cmd+enter',
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
          setCleanupWorktree((value) => !value);
        },
      },
  ]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Task"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
    >
      <p className="text-ink-1 mb-3 text-sm">Mark this task as completed?</p>

      {hasWorktree && (
        <div className="mb-4">
          <Checkbox
            checked={cleanupWorktree}
            onChange={setCleanupWorktree}
            label="Delete associated worktree and branch"
            description="Clean up the worktree directory and git branch after completing."
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
          variant="primary"
        >
          Complete
          <Kbd shortcut="cmd+enter" />
        </Button>
      </div>
    </Modal>
  );
}
