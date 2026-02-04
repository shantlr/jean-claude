import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';

import { Modal } from '@/common/ui/modal';

export function CommitModal({
  isOpen,
  onClose,
  onCommit,
  isPending,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, stageAll: boolean) => Promise<void>;
  isPending: boolean;
  error?: string;
}) {
  const [message, setMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await onCommit(message.trim(), stageAll);
    setMessage('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commit Changes"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            htmlFor="commit-message"
            className="mb-2 block text-sm font-medium text-neutral-300"
          >
            Commit message
          </label>
          <textarea
            id="commit-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your changes"
            rows={3}
            autoComplete="off"
            className="w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
            autoFocus
          />
        </div>

        <label className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={stageAll}
            onChange={(e) => setStageAll(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-neutral-300">Stage all changes</span>
        </label>

        {error && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
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
            type="submit"
            disabled={!message.trim() || isPending}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Commit
          </button>
        </div>
      </form>
    </Modal>
  );
}
