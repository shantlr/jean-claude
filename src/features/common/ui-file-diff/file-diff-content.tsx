import { Loader2 } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useState, useCallback, useMemo } from 'react';

import {
  useAnnotationsAsInlineComments,
  fileHasAnnotations,
} from '@/features/agent/ui-diff-annotation';
import {
  DiffView,
  type CommentFormEntry,
  type InlineComment,
  type LineRange,
} from '@/features/agent/ui-diff-view';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import { ReviewCommentComposer } from '@/features/agent/ui-review-comments/review-comment-composer';
import { ReviewCommentThread } from '@/features/agent/ui-review-comments/review-comment-thread';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import type { FileAnnotation } from '@/lib/api';
import type { ReviewComment, ReviewPresetId } from '@/stores/review-comments';
import { getSelectedTextForRange } from '@/stores/utils-comment-prompt';
import type { PromptImagePart } from '@shared/agent-backend-types';
import { isSvgPath } from '@shared/image-types';

import { FileDiffHeader } from './file-diff-header';
import type { DiffFile, CommentThread } from './types';

const EMPTY_INLINE_COMMENTS: InlineComment[] = [];
const SVG_PREVIEW_WIDTH = 192;
const SVG_PREVIEW_MIN_WIDTH = 140;
const SVG_PREVIEW_MAX_WIDTH = 360;
const TRANSPARENCY_GRID_STYLE = {
  backgroundColor: '#f8fafc',
  backgroundImage:
    'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundSize: '16px 16px',
};

export function FileDiffContent({
  file,
  oldContent,
  newContent,
  isLoading,
  isBinary,
  headerClassName,
  // Optional image support
  oldImageDataUrl,
  newImageDataUrl,
  // Optional comment support
  threads,
  renderThread,
  scrollToLine,
  onAddComment,
  isAddingComment,
  CommentForm,
  renderCommentForm,
  // Optional annotation support
  annotations,
  // Optional review comment support
  reviewComments,
  onAddReviewComment,
  onDeleteReviewComment,
  onEditReviewComment,
  showReviewStatus,
  onResolveReviewComment,
  defaultCommentFormLineRanges,
  onCommentFormClose,
  shouldKeepCommentFormRangeOnOpen,
  getReviewCommentDraftBody,
  onReviewCommentDraftBodyChange,
}: {
  file: DiffFile;
  oldContent: string;
  newContent: string;
  isLoading?: boolean;
  isBinary?: boolean;
  headerClassName?: string;
  oldImageDataUrl?: string | null;
  newImageDataUrl?: string | null;
  // Comment props - all optional
  threads?: CommentThread[];
  renderThread?: (thread: CommentThread) => ReactNode;
  scrollToLine?: number;
  onAddComment?: (params: {
    filePath: string;
    line: number;
    lineEnd?: number;
    content: string;
  }) => void;
  isAddingComment?: boolean;
  CommentForm?: ComponentType<{
    onSubmit: (content: string) => void;
    onCancel: () => void;
    lineStart: number;
    lineEnd?: number;
    isSubmitting?: boolean;
    placeholder?: string;
  }>;
  renderCommentForm?: (props: {
    onSubmit: (content: string) => void;
    onCancel: () => void;
    lineStart: number;
    lineEnd?: number;
    isSubmitting?: boolean;
    placeholder?: string;
  }) => ReactNode;
  /** Initial line ranges for comment forms (for draft restoration). */
  defaultCommentFormLineRanges?: LineRange[];
  /** Called when a comment form is closed (for draft cleanup). */
  onCommentFormClose?: (range: LineRange) => void;
  /** Decide which already-open forms stay when opening another form. */
  shouldKeepCommentFormRangeOnOpen?: (range: LineRange) => boolean;
  getReviewCommentDraftBody?: (lineStart: number, lineEnd?: number) => string;
  onReviewCommentDraftBodyChange?: (
    body: string,
    lineStart: number,
    lineEnd?: number,
  ) => void;
  // Annotation props - optional
  annotations?: FileAnnotation[];
  // Review comment props - optional
  reviewComments?: ReviewComment[];
  onAddReviewComment?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    selectedText?: string;
    body: string;
    presets: ReviewPresetId[];
    images?: PromptImagePart[];
  }) => void;
  onDeleteReviewComment?: (commentId: string) => void;
  onEditReviewComment?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  showReviewStatus?: boolean;
  onResolveReviewComment?: (commentId: string) => void;
}) {
  const [commentFormLineRanges, setCommentFormLineRanges] = useState<
    LineRange[]
  >(defaultCommentFormLineRanges ?? []);
  const [svgPreviewWidth, setSvgPreviewWidth] = useState(SVG_PREVIEW_WIDTH);

  const removeRange = useCallback(
    (range: LineRange) => {
      setCommentFormLineRanges((prev) =>
        prev.filter((r) => r.start !== range.start || r.end !== range.end),
      );
      onCommentFormClose?.(range);
    },
    [onCommentFormClose],
  );

  const handleAddCommentForRange = useCallback(
    (range: LineRange, content: string) => {
      if (!onAddComment) return;
      onAddComment({
        filePath: file.path,
        line: range.start,
        lineEnd: range.end !== range.start ? range.end : undefined,
        content,
      });
      removeRange(range);
    },
    [file.path, onAddComment, removeRange],
  );

  const handleAddCommentClick = useCallback(
    (lineRange: LineRange) => {
      // Toggle: close if clicking same range
      const existing = commentFormLineRanges.find(
        (r) => r.start === lineRange.start && r.end === lineRange.end,
      );
      if (existing) {
        removeRange(lineRange);
      } else {
        const retainedRanges = shouldKeepCommentFormRangeOnOpen
          ? commentFormLineRanges.filter((range) =>
              shouldKeepCommentFormRangeOnOpen(range),
            )
          : commentFormLineRanges;

        setCommentFormLineRanges([...retainedRanges, lineRange]);

        if (shouldKeepCommentFormRangeOnOpen) {
          for (const range of commentFormLineRanges) {
            if (!shouldKeepCommentFormRangeOnOpen(range)) {
              onCommentFormClose?.(range);
            }
          }
        }
      }
    },
    [
      commentFormLineRanges,
      onCommentFormClose,
      removeRange,
      shouldKeepCommentFormRangeOnOpen,
    ],
  );

  // Filter threads for this file (only those with line numbers)
  const fileThreads = useMemo(
    () => threads?.filter((t) => t.line !== undefined) ?? [],
    [threads],
  );

  const hasCommentSupport =
    !!onAddComment && (!!CommentForm || !!renderCommentForm);
  const hasReviewSupport = !!onAddReviewComment;
  const isSvg = isSvgPath(file.path);
  const {
    containerRef: svgPreviewContainerRef,
    isDragging: isSvgPreviewDragging,
    handleMouseDown: handleSvgPreviewResizeMouseDown,
  } = useHorizontalResize({
    initialWidth: svgPreviewWidth,
    minWidth: SVG_PREVIEW_MIN_WIDTH,
    maxWidth: SVG_PREVIEW_MAX_WIDTH,
    direction: 'left',
    onWidthChange: setSvgPreviewWidth,
  });

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
      content: renderThread ? (
        renderThread(thread)
      ) : (
        <div className="flex flex-col gap-2">
          {thread.comments.map((comment, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-ink-2 shrink-0 text-xs font-medium">
                {comment.author}:
              </span>
              <div className="text-ink-1 min-w-0 flex-1 text-xs">
                <MarkdownContent content={comment.content} />
              </div>
            </div>
          ))}
        </div>
      ),
    }));
  }, [fileThreads, renderThread]);

  // Convert review comments to inline comments for DiffView
  const reviewInlineComments: InlineComment[] = useMemo(() => {
    if (!reviewComments || reviewComments.length === 0)
      return EMPTY_INLINE_COMMENTS;
    return reviewComments.map((rc) => ({
      // Anchor to the end line (or start if single-line) so thread appears after the range
      line: rc.anchor.lineEnd ?? rc.anchor.lineStart,
      content: (
        <ReviewCommentThread
          comment={rc}
          showStatus={showReviewStatus ?? false}
          onResolve={onResolveReviewComment}
          onDelete={onDeleteReviewComment}
          onEdit={onEditReviewComment}
        />
      ),
    }));
  }, [
    reviewComments,
    showReviewStatus,
    onResolveReviewComment,
    onDeleteReviewComment,
    onEditReviewComment,
  ]);

  // Merge thread comments, annotation comments, and review comments
  const inlineComments: InlineComment[] = useMemo(() => {
    return [...threadComments, ...annotationComments, ...reviewInlineComments];
  }, [threadComments, annotationComments, reviewInlineComments]);

  // Build set of all lines covered by any comment anchor range
  const commentedLines = useMemo(() => {
    const set = new Set<number>();
    // From inline comments (thread + annotation) — single line each
    for (const c of threadComments) set.add(c.line);
    for (const c of annotationComments) set.add(c.line);
    // From review comments — full lineStart..lineEnd range
    if (reviewComments) {
      for (const rc of reviewComments) {
        const end = rc.anchor.lineEnd ?? rc.anchor.lineStart;
        for (let l = rc.anchor.lineStart; l <= end; l++) {
          set.add(l);
        }
      }
    }
    return set;
  }, [threadComments, annotationComments, reviewComments]);

  // Handle review comment submission for a specific range
  const handleAddReviewCommentForRange = useCallback(
    (
      range: LineRange,
      body: string,
      presets: ReviewPresetId[],
      images: PromptImagePart[],
    ) => {
      if (!onAddReviewComment) return;
      onAddReviewComment({
        filePath: file.path,
        lineStart: range.start,
        lineEnd: range.end !== range.start ? range.end : undefined,
        selectedText: getSelectedTextForRange(
          file.status === 'deleted' ? oldContent : newContent,
          range.start,
          range.end !== range.start ? range.end : undefined,
        ),
        body,
        presets,
        images: images.length > 0 ? images : undefined,
      });
      removeRange(range);
    },
    [
      file.path,
      file.status,
      oldContent,
      newContent,
      onAddReviewComment,
      removeRange,
    ],
  );

  // Build comment form entries for all open ranges
  const commentFormEntries: CommentFormEntry[] = useMemo(() => {
    if (commentFormLineRanges.length === 0) return [];

    const entries: CommentFormEntry[] = [];
    for (const range of commentFormLineRanges) {
      const lineEnd = range.end !== range.start ? range.end : undefined;

      if (hasReviewSupport) {
        entries.push({
          lineRange: range,
          form: (
            <ReviewCommentComposer
              lineStart={range.start}
              lineEnd={lineEnd}
              onSubmit={(body, presets, images) =>
                handleAddReviewCommentForRange(range, body, presets, images)
              }
              onCancel={() => removeRange(range)}
              initialBody={getReviewCommentDraftBody?.(range.start, lineEnd)}
              onBodyChange={(body) =>
                onReviewCommentDraftBodyChange?.(body, range.start, lineEnd)
              }
            />
          ),
        });
      } else if (hasCommentSupport && (CommentForm || renderCommentForm)) {
        const props = {
          onSubmit: (content: string) =>
            handleAddCommentForRange(range, content),
          onCancel: () => removeRange(range),
          lineStart: range.start,
          lineEnd,
          isSubmitting: isAddingComment,
          placeholder: 'Write a comment...',
        };
        if (renderCommentForm) {
          entries.push({
            lineRange: range,
            form: renderCommentForm(props),
          });
        } else if (CommentForm) {
          entries.push({
            lineRange: range,
            form: <CommentForm {...props} />,
          });
        }
      }
    }
    return entries;
  }, [
    commentFormLineRanges,
    hasReviewSupport,
    hasCommentSupport,
    CommentForm,
    renderCommentForm,
    handleAddCommentForRange,
    handleAddReviewCommentForRange,
    getReviewCommentDraftBody,
    onReviewCommentDraftBodyChange,
    removeRange,
    isAddingComment,
  ]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isBinary) {
    // Show image preview if we have image data
    if (oldImageDataUrl || newImageDataUrl) {
      return (
        <div className="flex h-full flex-col overflow-hidden">
          <FileDiffHeader file={file} className={headerClassName} />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-6 overflow-auto p-6">
            {oldImageDataUrl && newImageDataUrl ? (
              // Modified image: show old → new side by side
              <>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">
                    Before
                  </span>
                  <div
                    className="border-red-6 overflow-hidden rounded-md border"
                    style={TRANSPARENCY_GRID_STYLE}
                  >
                    <img
                      src={oldImageDataUrl}
                      alt="Before"
                      className="max-h-[60vh] max-w-[40vw] object-contain"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">
                    After
                  </span>
                  <div
                    className="border-green-6 overflow-hidden rounded-md border"
                    style={TRANSPARENCY_GRID_STYLE}
                  >
                    <img
                      src={newImageDataUrl}
                      alt="After"
                      className="max-h-[60vh] max-w-[40vw] object-contain"
                    />
                  </div>
                </div>
              </>
            ) : (
              // Added or deleted image: show single image
              <div className="flex flex-col items-center gap-2">
                <span className="text-ink-3 text-xs font-medium tracking-wide uppercase">
                  {file.status === 'unchanged'
                    ? 'Preview'
                    : newImageDataUrl
                      ? 'Added'
                      : 'Deleted'}
                </span>
                <div
                  className={`overflow-hidden rounded-md border ${file.status === 'unchanged' ? 'border-line' : newImageDataUrl ? 'border-green-6' : 'border-red-6'}`}
                  style={TRANSPARENCY_GRID_STYLE}
                >
                  <img
                    src={(newImageDataUrl ?? oldImageDataUrl)!}
                    alt={
                      file.status === 'unchanged'
                        ? 'Preview'
                        : newImageDataUrl
                          ? 'Added'
                          : 'Deleted'
                    }
                    className="max-h-[70vh] max-w-[60vw] object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2">
        <p>Binary file changed</p>
        <p className="text-xs">{file.path}</p>
      </div>
    );
  }

  if (isSvg) {
    const previewContent = file.status === 'deleted' ? oldContent : newContent;
    const previewDataUrl = previewContent
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewContent)}`
      : null;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <FileDiffHeader
          file={file}
          className={headerClassName}
          commentCount={fileThreads.length + (reviewComments?.length ?? 0)}
          hasAnnotations={hasAnnotations}
        />
        <div
          ref={svgPreviewContainerRef}
          className={`flex min-h-0 flex-1 ${isSvgPreviewDragging ? 'select-none' : ''}`}
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <DiffView
              filePath={file.path}
              oldString={oldContent}
              newString={newContent}
              withMinimap
              onAddCommentClick={
                hasReviewSupport || hasCommentSupport
                  ? handleAddCommentClick
                  : undefined
              }
              inlineComments={inlineComments}
              commentedLines={commentedLines}
              commentForms={commentFormEntries}
              scrollToLine={scrollToLine}
            />
          </div>
          <div
            onMouseDown={handleSvgPreviewResizeMouseDown}
            className="hover:bg-acc/30 w-1 shrink-0 cursor-col-resize border-l border-[var(--line)]"
          />
          <div
            className="bg-bg-0/80 shrink-0 p-3"
            style={{ width: svgPreviewWidth }}
          >
            <div className="flex flex-col gap-2">
              <div className="text-ink-3 font-mono text-[10px] tracking-wide uppercase">
                SVG Preview
              </div>
              <div
                className="border-line flex aspect-square items-center justify-center overflow-hidden rounded-md border p-3"
                style={TRANSPARENCY_GRID_STYLE}
              >
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt="SVG preview"
                    className="max-h-full max-w-full"
                  />
                ) : (
                  <span className="text-ink-4 text-xs">No preview</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* File header */}
      <FileDiffHeader
        file={file}
        className={headerClassName}
        commentCount={fileThreads.length + (reviewComments?.length ?? 0)}
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
            hasReviewSupport || hasCommentSupport
              ? handleAddCommentClick
              : undefined
          }
          inlineComments={inlineComments}
          commentedLines={commentedLines}
          commentForms={commentFormEntries}
          scrollToLine={scrollToLine}
        />
      </div>
    </div>
  );
}
