import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  FileCode,
  Loader2,
  MessageSquare,
  Square,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState, useEffect } from 'react';

import { Button } from '@/common/ui/button';
import { Textarea } from '@/common/ui/textarea';
import {
  FileDiffContent,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import {
  usePullRequestChanges,
  usePullRequestFileContent,
} from '@/hooks/use-pull-requests';
import { useSubmitPrReview, useUpdateStep } from '@/hooks/use-steps';
import type { PrReviewStepMeta, TaskStep } from '@shared/types';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function PrReviewValidation({ step }: { step: TaskStep }) {
  const meta = step.meta as PrReviewStepMeta;
  const submitReview = useSubmitPrReview();
  const updateStep = useUpdateStep();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedCommentIndex, setSelectedCommentIndex] = useState<
    number | null
  >(null);

  const comments = useMemo(() => meta.comments ?? [], [meta.comments]);
  const enabledCount = comments.filter((c) => c.enabled).length;

  useEffect(() => {
    if (comments.length === 0) {
      setSelectedCommentIndex(null);
      return;
    }
    if (
      selectedCommentIndex === null ||
      selectedCommentIndex < 0 ||
      selectedCommentIndex >= comments.length
    ) {
      setSelectedCommentIndex(0);
    }
  }, [comments.length, selectedCommentIndex]);

  const selectedComment =
    selectedCommentIndex !== null ? comments[selectedCommentIndex] : null;

  const { data: changedFiles = [], isLoading: isLoadingChangedFiles } =
    usePullRequestChanges(meta.projectId, meta.pullRequestId);

  const selectedChangedFile = useMemo(() => {
    if (!selectedComment) return null;

    const targetPath = normalizePath(selectedComment.filePath);
    return (
      changedFiles.find((file) => normalizePath(file.path) === targetPath) ??
      null
    );
  }, [changedFiles, selectedComment]);

  const selectedDiffFile = useMemo(() => {
    if (selectedChangedFile) {
      return {
        path: selectedChangedFile.path,
        status: normalizeAzureChangeType(selectedChangedFile.changeType),
        originalPath: selectedChangedFile.originalPath,
      };
    }
    if (selectedComment) {
      return {
        path: selectedComment.filePath,
        status: 'modified' as const,
      };
    }
    return null;
  }, [selectedChangedFile, selectedComment]);

  const selectedFilePath = selectedDiffFile?.path ?? '';

  const { data: baseContent = '', isLoading: isBaseLoading } =
    usePullRequestFileContent(
      meta.projectId,
      meta.pullRequestId,
      selectedFilePath,
      'base',
    );
  const { data: headContent = '', isLoading: isHeadLoading } =
    usePullRequestFileContent(
      meta.projectId,
      meta.pullRequestId,
      selectedFilePath,
      'head',
    );

  const selectedFileThreads = useMemo(() => {
    if (!selectedDiffFile) return [];

    return comments
      .filter(
        (comment) =>
          normalizePath(comment.filePath) ===
          normalizePath(selectedDiffFile.path),
      )
      .map((comment, index) => ({
        id: index + 1,
        line: comment.lineNumber,
        comments: [
          {
            author: 'Proposed review',
            content: comment.comment,
          },
        ],
      }));
  }, [comments, selectedDiffFile]);

  // Toggle individual comment enabled state
  const toggleComment = useCallback(
    (index: number) => {
      const updated = [...comments];
      updated[index] = { ...updated[index], enabled: !updated[index].enabled };
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  // Toggle all comments on/off
  const toggleAll = useCallback(
    (enabled: boolean) => {
      const updated = comments.map((c) => ({ ...c, enabled }));
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  // Update comment text inline
  const updateCommentText = useCallback(
    (index: number, text: string) => {
      const updated = [...comments];
      updated[index] = { ...updated[index], comment: text };
      updateStep.mutate({
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      });
    },
    [comments, meta, step.id, updateStep],
  );

  // Submit enabled comments to Azure DevOps
  const handleSubmit = useCallback(() => {
    submitReview.mutate(step.id);
  }, [step.id, submitReview]);

  // Discard all comments (mark step complete with 0 comments)
  const handleDiscard = useCallback(() => {
    const updated = comments.map((c) => ({ ...c, enabled: false }));
    updateStep.mutate(
      {
        stepId: step.id,
        data: { meta: { ...meta, comments: updated } as PrReviewStepMeta },
      },
      { onSuccess: () => submitReview.mutate(step.id) },
    );
  }, [comments, meta, step.id, updateStep, submitReview]);

  // === RENDER STATES ===

  // Completed state -- show success
  if (step.status === 'completed' && meta.submittedAt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <div className="bg-status-done/50 flex h-12 w-12 items-center justify-center rounded-full">
          <Check className="text-status-done h-6 w-6" />
        </div>
        <p className="text-ink-1 text-sm font-medium">Review submitted</p>
        <p className="text-ink-3 text-xs">
          {meta.submittedCount ?? 0} comment
          {(meta.submittedCount ?? 0) !== 1 ? 's' : ''} posted to PR #
          {meta.pullRequestId}
        </p>
      </div>
    );
  }

  // Pending state -- waiting for agent step
  if (step.status === 'pending') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
        <p className="text-ink-3 text-sm">
          Waiting for review step to complete...
        </p>
      </div>
    );
  }

  // Parse error state -- JSON extraction failed
  if (meta.parseError && comments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-950/50">
          <AlertTriangle className="text-status-run h-6 w-6" />
        </div>
        <p className="text-ink-1 text-sm font-medium">
          Could not parse review comments
        </p>
        <p className="text-ink-3 max-w-md text-center text-xs">
          {meta.parseError}
        </p>
        <Button onClick={handleDiscard} variant="secondary">
          Skip Review
        </Button>
      </div>
    );
  }

  // Main validation UI -- list of comments with checkboxes
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-ink-2 h-4 w-4" />
          <span className="text-ink-1 text-sm font-medium">
            Review Comments
          </span>
          <span className="text-ink-2 bg-glass-medium rounded-full px-2 py-0.5 text-[10px] font-medium">
            {enabledCount}/{comments.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => toggleAll(enabledCount < comments.length)}
            variant="ghost"
            size="sm"
          >
            {enabledCount === comments.length ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Comment list */}
        <div className="border-glass-border flex w-[420px] max-w-[50%] min-w-[360px] flex-col border-r">
          <div className="flex-1 overflow-y-auto p-4">
            {meta.submissionError && (
              <div className="text-status-run mb-3 rounded-md border border-yellow-700/50 bg-yellow-950/20 px-3 py-2 text-xs">
                {meta.submissionError}
              </div>
            )}
            <div className="space-y-3">
              {comments.map((comment, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedCommentIndex(index)}
                  className={clsx(
                    'rounded-lg border p-3 transition-colors',
                    comment.enabled
                      ? 'bg-bg-1/60 border-glass-border'
                      : 'border-line-soft bg-bg-0/40 opacity-50',
                    selectedCommentIndex === index &&
                      'ring-acc/60 ring-1 ring-inset',
                  )}
                >
                  {/* Top row: checkbox, file path, line number */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleComment(index);
                      }}
                      className="text-ink-2 hover:text-ink-1 shrink-0 transition-colors"
                    >
                      {comment.enabled ? (
                        <CheckSquare className="text-acc-ink h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                    <span className="text-ink-1 bg-glass-medium rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {comment.filePath}
                    </span>
                    <span className="text-ink-3 text-[10px]">
                      L{comment.lineNumber}
                    </span>
                  </div>

                  {/* Comment text -- click to edit */}
                  {editingIndex === index ? (
                    <Textarea
                      autoFocus
                      size="sm"
                      className="mt-2"
                      rows={3}
                      defaultValue={comment.comment}
                      onBlur={(e) => {
                        updateCommentText(index, e.target.value);
                        setEditingIndex(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingIndex(null);
                      }}
                    />
                  ) : (
                    <p
                      className="text-ink-1 mt-2 cursor-text text-xs leading-relaxed"
                      onClick={() => setEditingIndex(index)}
                      title="Click to edit"
                    >
                      {comment.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Associated file diff */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {selectedDiffFile ? (
            <FileDiffContent
              file={selectedDiffFile}
              oldContent={baseContent}
              newContent={headContent}
              isLoading={
                isLoadingChangedFiles || isBaseLoading || isHeadLoading
              }
              headerClassName="h-[40px] shrink-0"
              threads={selectedFileThreads}
            />
          ) : (
            <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2">
              {isLoadingChangedFiles ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileCode className="h-5 w-5" />
              )}
              <p className="text-xs">
                Select a review comment to view its diff
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-glass-border flex items-center justify-between border-t px-4 py-3">
        <Button
          onClick={handleDiscard}
          disabled={submitReview.isPending}
          variant="ghost"
          icon={<X />}
        >
          Discard
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={enabledCount === 0 || submitReview.isPending}
          loading={submitReview.isPending}
          variant="primary"
          icon={!submitReview.isPending ? <Check /> : undefined}
        >
          Submit {enabledCount} Comment{enabledCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
