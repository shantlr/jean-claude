import { useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { api } from '@/lib/api';

export function ChangeWorktreePathDialog({
  isOpen,
  onClose,
  onConfirm,
  currentPath,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newPath: string) => void;
  currentPath: string;
  isPending: boolean;
}) {
  const [selectedPath, setSelectedPath] = useState<string>(currentPath);

  const handleBrowse = async () => {
    const path = await api.dialog.openDirectory();
    if (path) {
      setSelectedPath(path);
    }
  };

  const handleConfirm = () => {
    if (isPending || !selectedPath) return;
    onConfirm(selectedPath);
  };

  useCommands('change-worktree-path-dialog', [
    isOpen && {
      label: 'Confirm Change Worktree Path',
      shortcut: 'cmd+enter',
      hideInCommandPalette: true,
      handler: () => {
        handleConfirm();
      },
    },
  ]);

  if (!isOpen) return null;

  const hasChanged = selectedPath !== currentPath;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Worktree Path"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
    >
      <p className="text-ink-1 mb-4 text-sm">
        Select the new location for the worktree directory. Use this to
        reconnect a task to a worktree that has been moved.
      </p>

      <div className="mb-4">
        <label className="text-ink-2 mb-1.5 block text-xs font-medium">
          Worktree Path
        </label>
        <div className="flex items-center gap-2">
          <Input
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            disabled={isPending}
            placeholder="/path/to/worktree"
            spellCheck={false}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            onClick={handleBrowse}
            disabled={isPending}
            variant="secondary"
            className="shrink-0"
          >
            Browse...
          </Button>
        </div>
      </div>

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
          disabled={isPending || !hasChanged}
          variant="primary"
        >
          Change Path
          <Kbd shortcut="cmd+enter" />
        </Button>
      </div>
    </Modal>
  );
}
