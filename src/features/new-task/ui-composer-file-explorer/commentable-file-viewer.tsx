import { type BundledLanguage, codeToTokens, type ThemedToken } from 'shiki';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';



import {
  COMMENT_ACCENT,
  InlineCommentBubble,
  InlineCommentComposer,
} from '@/features/common/ui-inline-comments';
import {
  getCommentedLineSet,
  groupCommentsByLine,
} from '@/stores/utils-comment-store';
import {
  useComposerFileCommentActions,
  useComposerFileCommentsForFile,
} from '@/stores/composer-file-comments';
import { api } from '@/lib/api';
import { getSelectedTextForRange } from '@/stores/utils-comment-prompt';
import type { PromptImagePart } from '@shared/agent-backend-types';



export function CommentableFileViewer({
  filePath,
  projectId,
}: {
  filePath: string;
  projectId: string;
}) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [composerLineRange, setComposerLineRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, []);

  const comments = useComposerFileCommentsForFile(projectId, filePath);
  const { addComment, removeComment, updateComment } =
    useComposerFileCommentActions(projectId);

  const { data: fileData, isLoading } = useQuery({
    queryKey: ['file-content', filePath],
    queryFn: () => api.fs.readFile(filePath),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Tokenize file content with shiki
  useEffect(() => {
    if (!fileData) {
      startTransition(() => setTokens(null));
      return;
    }

    let cancelled = false;
    const tokenize = async () => {
      try {
        let result: { tokens: ThemedToken[][] };
        try {
          result = await codeToTokens(fileData.content, {
            lang: (fileData.language || 'text') as BundledLanguage,
            theme: 'github-dark',
          });
        } catch {
          result = await codeToTokens(fileData.content, {
            lang: 'text',
            theme: 'github-dark',
          });
        }
        if (!cancelled) setTokens(result.tokens);
      } catch {
        if (!cancelled) setTokens(null);
      }
    };
    tokenize();
    return () => {
      cancelled = true;
    };
  }, [fileData]);

  // Initialize viewport info after tokens load
  useEffect(() => {
    if (tokens && scrollRef.current) {
      handleScroll();
    }
  }, [tokens, handleScroll]);

  const commentsByLine = useMemo(
    () => groupCommentsByLine(comments),
    [comments],
  );

  const commentedLines = useMemo(
    () => getCommentedLineSet(comments),
    [comments],
  );

  const handleLineMouseDown = useCallback((lineNumber: number) => {
    setSelectionStart(lineNumber);
  }, []);

  const handleLineMouseUp = useCallback(
    (lineNumber: number) => {
      if (selectionStart === null) return;
      const start = Math.min(selectionStart, lineNumber);
      const end = Math.max(selectionStart, lineNumber);
      setComposerLineRange({ start, end });
      setSelectionStart(null);
    },
    [selectionStart],
  );

  const handleMouseLeaveTable = useCallback(() => {
    setSelectionStart(null);
    setHoveredLine(null);
  }, []);

  const isLineInSelection = useCallback(
    (lineNumber: number) => {
      if (selectionStart === null || hoveredLine === null) return false;
      const start = Math.min(selectionStart, hoveredLine);
      const end = Math.max(selectionStart, hoveredLine);
      return lineNumber >= start && lineNumber <= end;
    },
    [selectionStart, hoveredLine],
  );

  const isLineInComposerRange = useCallback(
    (lineNumber: number) => {
      if (!composerLineRange) return false;
      return (
        lineNumber >= composerLineRange.start &&
        lineNumber <= composerLineRange.end
      );
    },
    [composerLineRange],
  );

  const handleComposerSubmit = useCallback(
    (body: string, images: PromptImagePart[]) => {
      if (!composerLineRange || !fileData?.content) return;
      addComment({
        anchor: {
          filePath,
          lineStart: composerLineRange.start,
          lineEnd:
            composerLineRange.start !== composerLineRange.end
              ? composerLineRange.end
              : undefined,
          selectedText: getSelectedTextForRange(
            fileData.content,
            composerLineRange.start,
            composerLineRange.start !== composerLineRange.end
              ? composerLineRange.end
              : undefined,
          ),
        },
        body,
        images: images.length > 0 ? images : undefined,
      });
      setComposerLineRange(null);
    },
    [composerLineRange, addComment, fileData, filePath],
  );

  const handleComposerCancel = useCallback(() => {
    setComposerLineRange(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-2 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        Unable to read file
      </div>
    );
  }

  const lines = fileData.content.split('\n');
  const totalLines = lines.length;

  return (
    <div className="relative flex h-full flex-col text-xs">
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <table
          className="w-full border-collapse"
          onMouseLeave={handleMouseLeaveTable}
        >
          <tbody>
            {lines.map((lineContent, i) => {
              const lineNumber = i + 1;
              const lineTokens = tokens?.[i] ?? [];
              const isHovered = hoveredLine === lineNumber;
              const isSelected = isLineInSelection(lineNumber);
              const isInComposer = isLineInComposerRange(lineNumber);
              const hasComment = commentedLines.has(lineNumber);
              const lineComments = commentsByLine.get(lineNumber);
              const showComposer =
                composerLineRange && lineNumber === composerLineRange.end;

              return (
                <FileLineRow
                  key={lineNumber}
                  lineNumber={lineNumber}
                  lineContent={lineContent}
                  lineTokens={lineTokens}
                  isHovered={isHovered}
                  isSelected={isSelected}
                  isInComposerRange={isInComposer}
                  hasComment={hasComment}
                  onMouseEnter={() => setHoveredLine(lineNumber)}
                  onMouseDown={() => handleLineMouseDown(lineNumber)}
                  onMouseUp={() => handleLineMouseUp(lineNumber)}
                  inlineComments={lineComments}
                  onRemoveComment={removeComment}
                  onEditComment={(commentId, newBody, newImages) =>
                    updateComment(commentId, {
                      body: newBody,
                      images: newImages.length > 0 ? newImages : undefined,
                    })
                  }
                  showComposer={!!showComposer}
                  composerLineRange={composerLineRange}
                  onComposerSubmit={handleComposerSubmit}
                  onComposerCancel={handleComposerCancel}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Comment minimap — outside scroll container so it stays fixed */}
      <CommentMinimap
        commentsByLine={commentsByLine}
        totalLines={totalLines}
        viewport={viewport}
      />
    </div>
  );
}

function FileLineRow({
  lineNumber,
  lineContent,
  lineTokens,
  isHovered,
  isSelected,
  isInComposerRange,
  hasComment,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  inlineComments,
  onRemoveComment,
  onEditComment,
  showComposer,
  composerLineRange,
  onComposerSubmit,
  onComposerCancel,
}: {
  lineNumber: number;
  lineContent: string;
  lineTokens: ThemedToken[];
  isHovered: boolean;
  isSelected: boolean;
  isInComposerRange: boolean;
  hasComment: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
  inlineComments:
    | Array<{
        id: string;
        anchor: { lineStart: number; lineEnd?: number };
        body: string;
        images?: PromptImagePart[];
      }>
    | undefined;
  onRemoveComment: (commentId: string) => void;
  onEditComment: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  showComposer: boolean;
  composerLineRange: { start: number; end: number } | null;
  onComposerSubmit: (body: string, images: PromptImagePart[]) => void;
  onComposerCancel: () => void;
}) {
  const renderedContent =
    lineTokens.length > 0 ? (
      lineTokens.map((token, j) => (
        <span key={j} style={{ color: token.color }}>
          {token.content}
        </span>
      ))
    ) : (
      <span className="text-ink-1">{lineContent}</span>
    );

  return (
    <>
      <tr
        className={clsx({
          'bg-blue-500/30': isSelected,
          'bg-blue-500/10': !isSelected && isInComposerRange,
        })}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        style={{
          cursor: 'pointer',
          ...(hasComment && !isSelected && !isInComposerRange
            ? { background: COMMENT_ACCENT.bg }
            : {}),
        }}
      >
        {/* Gutter: line number / comment icon */}
        <td
          className={clsx(
            'relative w-8 pr-1 text-right align-top select-none',
            hasComment && !isSelected && !isInComposerRange
              ? 'text-acc-ink'
              : 'text-ink-4',
          )}
          style={
            hasComment && !isSelected && !isInComposerRange
              ? { borderLeft: `2px solid ${COMMENT_ACCENT.barSoft}` }
              : undefined
          }
        >
          <span className={clsx(isHovered && 'invisible')}>{lineNumber}</span>
          {isHovered && (
            <span className="text-acc-ink absolute inset-0 flex items-center justify-center">
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
            </span>
          )}
        </td>
        {/* Code content */}
        <td className="pr-2 whitespace-pre select-none">{renderedContent}</td>
      </tr>

      {/* Inline comments for this line */}
      {inlineComments && inlineComments.length > 0 && (
        <tr>
          <td colSpan={2} className="p-0">
            <div
              className="px-2 py-1.5"
              style={{
                background: COMMENT_ACCENT.bg,
                borderTop: `1px solid ${COMMENT_ACCENT.border}`,
                borderBottom: `1px solid ${COMMENT_ACCENT.border}`,
              }}
            >
              {inlineComments.map((comment) => (
                <InlineCommentBubble
                  key={comment.id}
                  lineStart={comment.anchor.lineStart}
                  lineEnd={comment.anchor.lineEnd}
                  body={comment.body}
                  images={comment.images}
                  onRemove={() => onRemoveComment(comment.id)}
                  onEdit={(newBody, newImages) =>
                    onEditComment(comment.id, newBody, newImages)
                  }
                />
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment composer */}
      {showComposer && composerLineRange && (
        <tr>
          <td colSpan={2} className="p-0">
            <div
              className="px-4 py-3"
              style={{
                background: COMMENT_ACCENT.bgLight,
                borderTop: `1px solid ${COMMENT_ACCENT.borderStrong}`,
                borderBottom: `1px solid ${COMMENT_ACCENT.borderStrong}`,
              }}
            >
              <InlineCommentComposer
                lineStart={composerLineRange.start}
                lineEnd={
                  composerLineRange.start !== composerLineRange.end
                    ? composerLineRange.end
                    : undefined
                }
                onSubmit={onComposerSubmit}
                onCancel={onComposerCancel}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CommentMinimap({
  commentsByLine,
  totalLines,
  viewport,
}: {
  commentsByLine: Map<number, unknown[]>;
  totalLines: number;
  viewport: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null;
}) {
  const markers = useMemo(() => {
    if (commentsByLine.size === 0 || totalLines === 0) return [];

    const result: { startPercent: number; heightPercent: number }[] = [];
    const lineNumbers = [...commentsByLine.keys()].sort((a, b) => a - b);

    let i = 0;
    while (i < lineNumbers.length) {
      const startLine = lineNumbers[i];
      let endLine = startLine;

      // Merge consecutive comment lines into single markers
      while (i + 1 < lineNumbers.length && lineNumbers[i + 1] <= endLine + 1) {
        i++;
        endLine = lineNumbers[i];
      }

      const startPercent = ((startLine - 1) / totalLines) * 100;
      const lineCount = endLine - startLine + 1;
      const heightPercent = Math.max(0.5, (lineCount / totalLines) * 100);
      result.push({ startPercent, heightPercent });
      i++;
    }

    return result;
  }, [commentsByLine, totalLines]);

  const viewportIndicator = useMemo(() => {
    if (!viewport || viewport.scrollHeight <= viewport.clientHeight)
      return null;
    return {
      topPercent: (viewport.scrollTop / viewport.scrollHeight) * 100,
      heightPercent: (viewport.clientHeight / viewport.scrollHeight) * 100,
    };
  }, [viewport]);

  if (markers.length === 0) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-2.5">
      {markers.map((marker, i) => (
        <div
          key={i}
          className="bg-acc"
          style={{
            position: 'absolute',
            top: `${marker.startPercent}%`,
            height: `${marker.heightPercent}%`,
            left: 0,
            right: 0,
            minHeight: '2px',
          }}
        />
      ))}
      {viewportIndicator && (
        <div
          className="border-ink-1/80 bg-ink-2/20 pointer-events-none absolute right-0 left-0 rounded border"
          style={{
            top: `${viewportIndicator.topPercent}%`,
            height: `${viewportIndicator.heightPercent}%`,
            minHeight: '8px',
          }}
        />
      )}
    </div>
  );
}
