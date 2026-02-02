import { Loader2, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState, useCallback, useMemo } from 'react';

import {
  useAnnotationsAsInlineComments,
  fileHasAnnotations,
} from '@/features/agent/ui-diff-annotation';
import {
  DiffView,
  type InlineComment,
  type LineRange,
} from '@/features/agent/ui-diff-view';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import type { FileAnnotation } from '@/lib/api';

import { FileDiffHeader } from './file-diff-header';
import type { DiffFile, CommentThread } from './types';

export function FileDiffContent({
  file,
  oldContent,
  newContent,
  isLoading,
  isBinary,
  headerClassName,
  // Optional comment support
  threads,
  onAddComment,
  isAddingComment,
  CommentForm,
  // Optional annotation support
  annotations,
}: {
  file: DiffFile;
  oldContent: string;
  newContent: string;
  isLoading?: boolean;
  isBinary?: boolean;
  headerClassName?: string;
  // Comment props - all optional
  threads?: CommentThread[];
  onAddComment?: (params: {
    filePath: string;
    line: number;
    lineEnd?: number;
    content: string;
  }) => void;
  isAddingComment?: boolean;
  CommentForm?: ComponentType<{
    onSubmit: (content: string) => void;
    isSubmitting?: boolean;
    placeholder?: string;
  }>;
  // Annotation props - optional
  annotations?: FileAnnotation[];
}) {
  const [commentFormLineRange, setCommentFormLineRange] =
    useState<LineRange | null>(null);

  const handleAddComment = useCallback(
    (content: string) => {
      if (commentFormLineRange !== null && onAddComment) {
        onAddComment({
          filePath: file.path,
          line: commentFormLineRange.start,
          lineEnd:
            commentFormLineRange.end !== commentFormLineRange.start
              ? commentFormLineRange.end
              : undefined,
          content,
        });
        setCommentFormLineRange(null);
      }
    },
    [file.path, commentFormLineRange, onAddComment],
  );

  const handleAddCommentClick = useCallback((lineRange: LineRange) => {
    setCommentFormLineRange(lineRange);
  }, []);

  const handleCancelComment = useCallback(() => {
    setCommentFormLineRange(null);
  }, []);

  // Filter threads for this file (only those with line numbers)
  const fileThreads = useMemo(
    () => threads?.filter((t) => t.line !== undefined) ?? [],
    [threads],
  );

  const hasCommentSupport = !!onAddComment && !!CommentForm;

  // Get annotation inline comments using the hook
  const { inlineComments: annotationComments } = useAnnotationsAsInlineComments(
    {
      annotations: annotations ?? [],
      filePath: file.path,
    },
  );

  // Check if file has annotations for the header badge
  const hasAnnotations = fileHasAnnotations(annotations ?? [], file.path);

  // Convert threads to inline comments for DiffView
  const threadComments: InlineComment[] = useMemo(() => {
    return fileThreads.map((thread) => ({
      line: thread.line!,
      content: (
        <div className="flex flex-col gap-2">
          {thread.comments.map((comment, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-xs font-medium text-neutral-400">
                {comment.author}:
              </span>
              <div className="min-w-0 flex-1 text-xs text-neutral-300">
                <MarkdownContent content={comment.content} />
              </div>
            </div>
          ))}
        </div>
      ),
    }));
  }, [fileThreads]);

  // Merge thread comments and annotation comments
  const inlineComments: InlineComment[] = useMemo(() => {
    return [...threadComments, ...annotationComments];
  }, [threadComments, annotationComments]);

  // Format the line range label
  const lineRangeLabel = useMemo(() => {
    if (!commentFormLineRange) return '';
    if (commentFormLineRange.start === commentFormLineRange.end) {
      return `line ${commentFormLineRange.start}`;
    }
    return `lines ${commentFormLineRange.start}-${commentFormLineRange.end}`;
  }, [commentFormLineRange]);

  // Render comment form inline
  const commentFormElement = useMemo(() => {
    if (!hasCommentSupport || commentFormLineRange === null || !CommentForm) {
      return undefined;
    }
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">
            Add comment on {lineRangeLabel}
          </span>
          <button
            onClick={handleCancelComment}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <CommentForm
          onSubmit={handleAddComment}
          isSubmitting={isAddingComment}
          placeholder="Write a comment..."
        />
      </div>
    );
  }, [
    hasCommentSupport,
    commentFormLineRange,
    CommentForm,
    lineRangeLabel,
    handleAddComment,
    handleCancelComment,
    isAddingComment,
  ]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <p>Binary file changed</p>
        <p className="text-xs">{file.path}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* File header */}
      <FileDiffHeader
        file={file}
        className={headerClassName}
        commentCount={fileThreads.length}
        hasAnnotations={hasAnnotations}
      />

      {/* Diff view with inline comments */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffView
          filePath={file.path}
          oldString={oldContent}
          newString={newContent}
          withMinimap
          onAddCommentClick={
            hasCommentSupport ? handleAddCommentClick : undefined
          }
          inlineComments={inlineComments}
          commentFormLineRange={commentFormLineRange}
          commentForm={commentFormElement}
        />
      </div>
    </div>
  );
}
