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
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/50">
          <Check className="h-6 w-6 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-neutral-200">Review submitted</p>
        <p className="text-xs text-neutral-500">
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
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        <p className="text-sm text-neutral-500">
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
          <AlertTriangle className="h-6 w-6 text-yellow-400" />
        </div>
        <p className="text-sm font-medium text-neutral-200">
          Could not parse review comments
        </p>
        <p className="max-w-md text-center text-xs text-neutral-500">
          {meta.parseError}
        </p>
        <Button
          onClick={handleDiscard}
          className="rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
        >
          Skip Review
        </Button>
      </div>
    );
  }

  // Main validation UI -- list of comments with checkboxes
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-200">
            Review Comments
          </span>
          <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
            {enabledCount}/{comments.length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => toggleAll(enabledCount < comments.length)}
            className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          >
            {enabledCount === comments.length ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Comment list */}
        <div className="flex w-[420px] max-w-[50%] min-w-[360px] flex-col border-r border-neutral-700">
          <div className="flex-1 overflow-y-auto p-4">
            {meta.submissionError && (
              <div className="mb-3 rounded-md border border-yellow-700/50 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-300">
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
                      ? 'border-neutral-700 bg-neutral-800/60'
                      : 'border-neutral-800 bg-neutral-900/40 opacity-50',
                    selectedCommentIndex === index &&
                      'ring-1 ring-blue-500/60 ring-inset',
                  )}
                >
                  {/* Top row: checkbox, file path, line number */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleComment(index);
                      }}
                      className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-200"
                    >
                      {comment.enabled ? (
                        <CheckSquare className="h-4 w-4 text-blue-400" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                    <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300">
                      {comment.filePath}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      L{comment.lineNumber}
                    </span>
                  </div>

                  {/* Comment text -- click to edit */}
                  {editingIndex === index ? (
                    <textarea
                      autoFocus
                      className="mt-2 w-full rounded border border-neutral-600 bg-neutral-900 p-2 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
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
                      className="mt-2 cursor-text text-xs leading-relaxed text-neutral-300"
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
            <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
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
      <div className="flex items-center justify-between border-t border-neutral-700 px-4 py-3">
        <Button
          onClick={handleDiscard}
          disabled={submitReview.isPending}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
          Discard
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={enabledCount === 0 || submitReview.isPending}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitReview.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Submit {enabledCount} Comment{enabledCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
