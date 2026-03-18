import { useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
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
      <p className="mb-4 text-sm text-neutral-300">
        Select the new location for the worktree directory. Use this to
        reconnect a task to a worktree that has been moved.
      </p>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-neutral-400">
          Worktree Path
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            disabled={isPending}
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500 disabled:opacity-50"
            placeholder="/path/to/worktree"
            spellCheck={false}
          />
          <Button
            type="button"
            onClick={handleBrowse}
            disabled={isPending}
            className="shrink-0 rounded-md border border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
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
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          loading={isPending}
          disabled={isPending || !hasChanged}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Change Path
          <Kbd shortcut="cmd+enter" />
        </Button>
      </div>
    </Modal>
  );
}
