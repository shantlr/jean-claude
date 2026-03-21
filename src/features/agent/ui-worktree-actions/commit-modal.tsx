import { Loader2, Sparkles } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { useGenerateCommitMessage } from '@/hooks/use-worktree-diff';

export function CommitModal({
  isOpen,
  onClose,
  onCommit,
  isPending,
  error,
  taskId,
  canAutoGenerate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, stageAll: boolean) => Promise<void>;
  isPending: boolean;
  error?: string;
  taskId: string;
  canAutoGenerate: boolean;
}) {
  const [message, setMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);
  const generateMutation = useGenerateCommitMessage();
  const resetRef = useRef(generateMutation.reset);
  resetRef.current = generateMutation.reset;

  // Reset mutation error state when the modal reopens
  useEffect(() => {
    if (isOpen) {
      resetRef.current();
    }
  }, [isOpen]);

  const isGenerating = generateMutation.isPending;
  const isBusy = isPending || isGenerating;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isBusy) return;

    let commitMessage = message.trim();

    // If no message and auto-generate is available, generate one
    if (!commitMessage && canAutoGenerate) {
      try {
        const generated = await generateMutation.mutateAsync({
          taskId,
          stageAll,
        });
        if (generated) {
          commitMessage = generated;
          setMessage(generated);
        } else {
          // Generation returned nothing — user must enter manually
          return;
        }
      } catch {
        // Generation failed — user must enter manually
        return;
      }
    }

    if (!commitMessage) return;

    await onCommit(commitMessage, stageAll);
    setMessage('');
  };

  const handleGenerate = async () => {
    if (isBusy) return;
    try {
      const generated = await generateMutation.mutateAsync({
        taskId,
        stageAll,
      });
      if (generated) {
        setMessage(generated);
      }
    } catch {
      // Generation failed — error shown via generateMutation.error
    }
  };

  useCommands('commit-modal', [
    isOpen && {
      label: 'Commit',
      shortcut: 'cmd+enter',
      hideInCommandPalette: true,
      handler: () => {
        handleSubmit();
      },
    },
  ]);

  if (!isOpen) return null;

  const canSubmit = canAutoGenerate ? !isBusy : !!message.trim() && !isBusy;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commit Changes"
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="commit-message"
              className="text-sm font-medium text-neutral-300"
            >
              Commit message
            </label>
            {canAutoGenerate && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                Generate
              </button>
            )}
          </div>
          <textarea
            id="commit-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              canAutoGenerate
                ? 'Leave empty to auto-generate, or describe your changes'
                : 'Describe your changes'
            }
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

        {(error || generateMutation.error) && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error ??
              (generateMutation.error
                ? 'Failed to generate commit message. Please enter one manually.'
                : undefined)}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(isPending || isGenerating) && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {isGenerating ? 'Generating...' : 'Commit'}
            <Kbd shortcut="cmd+enter" />
          </button>
        </div>
      </form>
    </Modal>
  );
}
