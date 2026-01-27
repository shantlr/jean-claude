import { Loader2, X } from 'lucide-react';
import React, { useState } from 'react';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, stageAll: boolean) => Promise<void>;
  isPending: boolean;
  error?: string;
}

export function CommitModal({ isOpen, onClose, onCommit, isPending, error }: CommitModalProps) {
  const [message, setMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await onCommit(message.trim(), stageAll);
    setMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-100">Commit Changes</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Commit message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes"
              rows={3}
              className="w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
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
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isPending}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Commit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
