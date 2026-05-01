import clsx from 'clsx';
import { MessageSquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ThemedToken } from 'shiki';

import { computeCurrentStateLines, type DiffLine } from './diff-utils';
import type { SearchMatch } from './use-diff-search';
import {
  renderTokensWithHighlights,
  renderWithHighlights,
} from './utils-search-highlight';

import type { InlineComment, LineRange } from './index';

export function CurrentStateTable({
  oldString,
  newString,
  diffLines,
  newTokens,
  onAddCommentClick,
  inlineComments,
  commentFormLineRange,
  commentForm,
  searchMatches,
  currentMatchIndex,
}: {
  oldString: string;
  newString: string;
  diffLines: DiffLine[];
  newTokens: ThemedToken[][];
  onAddCommentClick?: (lineRange: LineRange) => void;
  inlineComments?: InlineComment[];
  commentFormLineRange?: LineRange | null;
  commentForm?: ReactNode;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
}) {
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const lines = useMemo(
    () => computeCurrentStateLines(oldString, newString),
    [oldString, newString],
  );

  // Build reverse map: newLineNumber → DiffLine indices (for search match mapping)
  const newLineToMatchIndices = useMemo(() => {
    const map = new Map<number, number[]>();
    diffLines.forEach((line, idx) => {
      if (line.newLineNumber !== undefined) {
        const existing = map.get(line.newLineNumber);
        if (existing) {
          existing.push(idx);
        } else {
          map.set(line.newLineNumber, [idx]);
        }
      }
    });
    return map;
  }, [diffLines]);

  // Group search matches by their DiffLine index for fast lookup
  const matchesByDiffLineIndex = useMemo(() => {
    const map = new Map<number, SearchMatch[]>();
    for (const match of searchMatches) {
      const existing = map.get(match.lineIndex);
      if (existing) {
        existing.push(match);
      } else {
        map.set(match.lineIndex, [match]);
      }
    }
    return map;
  }, [searchMatches]);

  const currentMatch = searchMatches[currentMatchIndex] ?? null;

  // Comment selection handlers
  const handleLineMouseDown = useCallback(
    (lineNumber: number) => {
      if (!onAddCommentClick) return;
      setSelectionStart(lineNumber);
    },
    [onAddCommentClick],
  );

  const handleLineMouseUp = useCallback(
    (lineNumber: number) => {
      if (!onAddCommentClick || selectionStart === null) return;

      const start = Math.min(selectionStart, lineNumber);
      const end = Math.max(selectionStart, lineNumber);
      onAddCommentClick({ start, end });
      setSelectionStart(null);
    },
    [onAddCommentClick, selectionStart],
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

  const isLineInCommentRange = useCallback(
    (lineNumber: number) => {
      if (!commentFormLineRange) return false;
      return (
        lineNumber >= commentFormLineRange.start &&
        lineNumber <= commentFormLineRange.end
      );
    },
    [commentFormLineRange],
  );

  return (
    <table
      className="w-full border-collapse"
      onMouseLeave={handleMouseLeaveTable}
    >
      <tbody>
        {lines.map((line, i) => {
          const tokenLineIndex = line.lineNumber - 1;
          const tokens = newTokens[tokenLineIndex] || [];

          // Map search matches: find DiffLine indices for this newLineNumber,
          // then collect all search matches referencing those DiffLine indices
          const diffIndices = newLineToMatchIndices.get(line.lineNumber) ?? [];
          const lineMatches: SearchMatch[] = [];
          for (const diffIdx of diffIndices) {
            const matches = matchesByDiffLineIndex.get(diffIdx);
            if (matches) {
              lineMatches.push(...matches);
            }
          }

          const renderedContent =
            tokens.length > 0 ? (
              renderTokensWithHighlights({
                tokens,
                content: line.content,
                searchMatches: lineMatches,
                currentMatch:
                  currentMatch && lineMatches.includes(currentMatch)
                    ? currentMatch
                    : null,
              })
            ) : lineMatches.length > 0 ? (
              renderWithHighlights({
                text: line.content,
                searchMatches: lineMatches,
                currentMatch:
                  currentMatch && lineMatches.includes(currentMatch)
                    ? currentMatch
                    : null,
              })
            ) : (
              <span className="text-ink-1">{line.content}</span>
            );

          const lineNumber = line.lineNumber;
          const canComment = !!onAddCommentClick;
          const isSelected = isLineInSelection(lineNumber);
          const isInCommentRange = isLineInCommentRange(lineNumber);
          const isHovered = hoveredLine === lineNumber;

          const lineComments = inlineComments?.filter(
            (c) => c.line === lineNumber,
          );

          const showCommentForm =
            commentFormLineRange && lineNumber === commentFormLineRange.end;

          return (
            <CurrentStateRow
              key={i}
              lineIndex={i}
              lineNumber={lineNumber}
              isChanged={line.isChanged}
              renderedContent={renderedContent}
              canComment={canComment}
              isHovered={isHovered}
              isSelected={isSelected}
              isInCommentRange={isInCommentRange}
              onMouseEnter={() => setHoveredLine(lineNumber)}
              onMouseDown={() => handleLineMouseDown(lineNumber)}
              onMouseUp={() => handleLineMouseUp(lineNumber)}
              inlineComments={lineComments}
              commentForm={showCommentForm ? commentForm : undefined}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function CurrentStateRow({
  lineIndex,
  lineNumber,
  isChanged,
  renderedContent,
  canComment,
  isHovered,
  isSelected,
  isInCommentRange,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  inlineComments,
  commentForm,
}: {
  lineIndex: number;
  lineNumber: number;
  isChanged: boolean;
  renderedContent: ReactNode;
  canComment: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isInCommentRange: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
  inlineComments?: InlineComment[];
  commentForm?: ReactNode;
}) {
  return (
    <>
      <tr
        data-line-index={lineIndex}
        className={clsx({
          'bg-blue-500/30': isSelected,
          'bg-blue-500/10': !isSelected && isInCommentRange,
          'bg-green-500/15': !isSelected && !isInCommentRange && isChanged,
        })}
        onMouseEnter={onMouseEnter}
        onMouseDown={canComment ? onMouseDown : undefined}
        onMouseUp={canComment ? onMouseUp : undefined}
        style={{ cursor: canComment ? 'pointer' : undefined }}
      >
        {/* Line number */}
        <td
          className={clsx(
            'relative w-8 pr-1 text-right align-top select-none',
            isChanged ? 'text-status-done' : 'text-ink-4',
          )}
        >
          {canComment && isHovered ? (
            <span className="text-acc-ink flex h-full w-full items-center justify-center">
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
            </span>
          ) : (
            lineNumber
          )}
        </td>
        {/* Change indicator */}
        <td
          className={clsx(
            'w-4 text-center align-top select-none',
            isChanged ? 'text-status-done' : 'text-ink-4',
          )}
        >
          {isChanged ? '│' : ' '}
        </td>
        {/* Content */}
        <td
          className={clsx('pr-2 whitespace-pre-wrap', {
            'select-none': canComment,
          })}
        >
          {renderedContent}
        </td>
      </tr>

      {/* Inline comments for this line */}
      {inlineComments && inlineComments.length > 0 && (
        <tr>
          <td colSpan={3} className="p-0">
            <div className="bg-bg-1/80 border-y border-white/[0.06] px-4 py-2">
              {inlineComments.map((comment, ci) => (
                <div key={ci}>{comment.content}</div>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment form for this line */}
      {commentForm && (
        <tr>
          <td colSpan={3} className="p-0">
            <div className="border-acc/50 bg-bg-1/90 border-y px-4 py-3">
              {commentForm}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
