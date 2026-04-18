import { Loader2, Sparkles } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { Textarea } from '@/common/ui/textarea';
import { useGenerateCommitMessage } from '@/hooks/use-worktree-diff';

export function CommitModal({
  isOpen,
  onClose,
  onCommit,
  taskId,
  canAutoGenerate,
  contentRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string | undefined, stageAll: boolean) => void;
  taskId: string;
  canAutoGenerate: boolean;
  contentRef?: React.RefObject<HTMLDivElement | null>;
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isGenerating) return;

    const commitMessage = message.trim();

    // If no message and auto-generate is available, send undefined
    // so the parent can generate it as part of the background job
    if (!commitMessage && canAutoGenerate) {
      onCommit(undefined, stageAll);
      setMessage('');
      return;
    }

    if (!commitMessage) return;

    onCommit(commitMessage, stageAll);
    setMessage('');
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
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

  const canSubmit = canAutoGenerate
    ? !isGenerating
    : !!message.trim() && !isGenerating;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commit Changes"
      closeOnClickOutside={!isGenerating}
      closeOnEscape={!isGenerating}
      contentRef={contentRef}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="commit-message"
              className="text-ink-1 text-sm font-medium"
            >
              Commit message
            </label>
            {canAutoGenerate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                icon={
                  isGenerating ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )
                }
              >
                Generate
              </Button>
            )}
          </div>
          <Textarea
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
            size="sm"
            autoFocus
          />
        </div>

        <Checkbox
          checked={stageAll}
          onChange={setStageAll}
          label="Stage all changes"
          className="mb-4"
        />

        {generateMutation.error && (
          <div className="bg-status-fail/10 text-status-fail mb-4 rounded-md px-3 py-2 text-sm">
            Failed to generate commit message. Please enter one manually.
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            variant="ghost"
            size="md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={isGenerating}
            variant="primary"
            size="md"
          >
            {isGenerating ? 'Generating...' : 'Commit'}
            <Kbd shortcut="cmd+enter" />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
