import clsx from 'clsx';
import { MessageSquarePlus } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ThemedToken } from 'shiki';

import {
  computeDiff,
  computeSideBySideDiff,
  type DiffLine,
  type SideBySideRow,
} from './diff-utils';
import type { SearchMatch } from './use-diff-search';
import { useDividerResize } from './use-divider-resize';
import {
  renderTokensWithHighlights,
  renderWithHighlights,
} from './utils-search-highlight';

import type { InlineComment, LineRange } from './index';

export function SideBySideDiffTable({
  oldString,
  newString,
  oldTokens,
  newTokens,
  onAddCommentClick,
  inlineComments,
  commentedLines,
  commentFormLineRange,
  commentForm,
  searchMatches,
  currentMatchIndex,
}: {
  oldString: string;
  newString: string;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  onAddCommentClick?: (lineRange: LineRange) => void;
  inlineComments?: InlineComment[];
  commentedLines?: Set<number>;
  commentFormLineRange?: LineRange | null;
  commentForm?: ReactNode;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
}) {
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  // Compute both the flat lines (for mapping search matches) and side-by-side rows
  const { rows, lineToRowMapping } = useMemo(() => {
    const lines = computeDiff(oldString, newString);
    const sbsRows = computeSideBySideDiff(oldString, newString);

    // Build a mapping from line index to { rowIndex, side }
    const mapping = new Map<
      number,
      { rowIndex: number; side: 'left' | 'right' }
    >();

    let lineIndex = 0;
    let rowIndex = 0;

    while (lineIndex < lines.length && rowIndex < sbsRows.length) {
      const line = lines[lineIndex];
      const row = sbsRows[rowIndex];

      if (line.type === 'context') {
        // Context lines appear in both sides, map to 'right' for consistency
        mapping.set(lineIndex, { rowIndex, side: 'right' });
        lineIndex++;
        rowIndex++;
      } else if (line.type === 'deletion') {
        // Find this deletion in current row's left side
        if (row.left && row.left.oldLineNumber === line.oldLineNumber) {
          mapping.set(lineIndex, { rowIndex, side: 'left' });
          lineIndex++;
          // Only advance row if there's no addition to pair with
          if (!row.right || lines[lineIndex]?.type !== 'addition') {
            rowIndex++;
          }
        } else {
          rowIndex++;
        }
      } else if (line.type === 'addition') {
        // Find this addition in current row's right side
        if (row.right && row.right.newLineNumber === line.newLineNumber) {
          mapping.set(lineIndex, { rowIndex, side: 'right' });
          lineIndex++;
          rowIndex++;
        } else {
          rowIndex++;
        }
      }
    }

    return { rows: sbsRows, lineToRowMapping: mapping };
  }, [oldString, newString]);

  // Group search matches by row and side
  const matchesByRowAndSide = useMemo(() => {
    const result = new Map<string, SearchMatch[]>();

    searchMatches.forEach((match) => {
      const mapping = lineToRowMapping.get(match.lineIndex);
      if (mapping) {
        const key = `${mapping.rowIndex}-${mapping.side}`;
        if (!result.has(key)) {
          result.set(key, []);
        }
        result.get(key)!.push(match);
      }
    });

    return result;
  }, [searchMatches, lineToRowMapping]);

  const currentMatch = searchMatches[currentMatchIndex] ?? null;

  const { tableRef, leftFraction, isDragging, handleDividerMouseDown } =
    useDividerResize();

  // Calculate percentage widths for left and right content columns
  const leftPct = `${leftFraction * 100}%`;
  const rightPct = `${(1 - leftFraction) * 100}%`;

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

  // Track which lines we've already rendered extras for
  const renderedNewLineNumbers = new Set<number>();

  return (
    <table
      ref={tableRef}
      className={`w-full border-collapse ${isDragging ? 'select-none' : ''}`}
      onMouseLeave={handleMouseLeaveTable}
    >
      <colgroup>
        {/* Left line number */}
        <col style={{ width: 32 }} />
        {/* Left content */}
        <col style={{ width: leftPct }} />
        {/* Divider */}
        <col style={{ width: 8 }} />
        {/* Right line number */}
        <col style={{ width: 32 }} />
        {/* Right content */}
        <col style={{ width: rightPct }} />
      </colgroup>
      <tbody>
        {rows.map((row, rowIndex) => {
          // Use right side newLineNumber for comments (consistent with inline mode)
          const newLineNumber =
            row.right?.newLineNumber ?? row.left?.newLineNumber;

          const shouldRenderExtras =
            newLineNumber !== undefined &&
            !renderedNewLineNumbers.has(newLineNumber);
          if (newLineNumber !== undefined) {
            renderedNewLineNumbers.add(newLineNumber);
          }

          const lineComments =
            shouldRenderExtras && newLineNumber
              ? inlineComments?.filter((c) => c.line === newLineNumber)
              : undefined;

          const showCommentForm =
            shouldRenderExtras &&
            commentFormLineRange &&
            newLineNumber === commentFormLineRange.end;

          const isSelected = newLineNumber
            ? isLineInSelection(newLineNumber)
            : false;
          const isInCommentRange = newLineNumber
            ? isLineInCommentRange(newLineNumber)
            : false;

          const canComment = !!onAddCommentClick && newLineNumber !== undefined;

          return (
            <SideBySideRowComponent
              key={rowIndex}
              row={row}
              rowIndex={rowIndex}
              oldTokens={oldTokens}
              newTokens={newTokens}
              leftMatches={matchesByRowAndSide.get(`${rowIndex}-left`) ?? []}
              rightMatches={matchesByRowAndSide.get(`${rowIndex}-right`) ?? []}
              currentMatch={currentMatch}
              onDividerMouseDown={handleDividerMouseDown}
              isDragging={isDragging}
              canComment={canComment}
              isHovered={hoveredLine === newLineNumber}
              isSelected={isSelected}
              isInCommentRange={isInCommentRange}
              hasComment={
                !!newLineNumber && !!commentedLines?.has(newLineNumber)
              }
              onMouseEnter={() =>
                newLineNumber !== undefined && setHoveredLine(newLineNumber)
              }
              onMouseDown={() =>
                newLineNumber !== undefined &&
                handleLineMouseDown(newLineNumber)
              }
              onMouseUp={() =>
                newLineNumber !== undefined && handleLineMouseUp(newLineNumber)
              }
              inlineComments={lineComments}
              commentForm={showCommentForm ? commentForm : undefined}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function SideBySideRowComponent({
  row,
  rowIndex,
  oldTokens,
  newTokens,
  leftMatches,
  rightMatches,
  currentMatch,
  onDividerMouseDown,
  isDragging,
  canComment,
  isHovered,
  isSelected,
  isInCommentRange,
  hasComment,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  inlineComments,
  commentForm,
}: {
  row: SideBySideRow;
  rowIndex: number;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  leftMatches: SearchMatch[];
  rightMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
  onDividerMouseDown: (e: ReactMouseEvent) => void;
  isDragging: boolean;
  canComment: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isInCommentRange: boolean;
  hasComment: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
  inlineComments?: InlineComment[];
  commentForm?: ReactNode;
}) {
  return (
    <>
      <tr
        data-line-index={rowIndex}
        className={clsx({
          'bg-blue-500/30': isSelected,
          'bg-blue-500/10': !isSelected && isInCommentRange,
        })}
        onMouseEnter={onMouseEnter}
        onMouseDown={canComment ? onMouseDown : undefined}
        onMouseUp={canComment ? onMouseUp : undefined}
        style={{
          cursor: canComment ? 'pointer' : undefined,
          ...(hasComment && !isSelected && !isInCommentRange
            ? {
                background:
                  'color-mix(in oklch, oklch(0.78 0.18 295) 8%, transparent)',
              }
            : {}),
        }}
      >
        {/* Left side (old/deletions) */}
        <SideBySideCell
          line={row.left}
          tokens={oldTokens}
          side="left"
          searchMatches={leftMatches}
          currentMatch={currentMatch}
          canComment={canComment}
          isHovered={isHovered}
          isSelected={isSelected}
          isInCommentRange={isInCommentRange}
          hasComment={hasComment}
        />
        {/* Divider / drag handle */}
        <td
          className="group relative cursor-col-resize select-none"
          onMouseDown={onDividerMouseDown}
        >
          {/* Visible divider line */}
          <div
            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-all ${
              isDragging
                ? 'bg-acc w-0.5'
                : 'group-hover:bg-acc/50 bg-white/[0.06] group-hover:w-0.5'
            }`}
          />
          {/* Wide invisible hit target */}
          <div className="absolute inset-y-0 -right-1.5 -left-1.5" />
        </td>
        {/* Right side (new/additions) */}
        <SideBySideCell
          line={row.right}
          tokens={newTokens}
          side="right"
          searchMatches={rightMatches}
          currentMatch={currentMatch}
          canComment={canComment}
          isHovered={isHovered}
          isSelected={isSelected}
          isInCommentRange={isInCommentRange}
          hasComment={hasComment}
        />
      </tr>

      {/* Inline comments for this line */}
      {inlineComments && inlineComments.length > 0 && (
        <tr>
          <td colSpan={5} className="p-0">
            <div>
              {inlineComments.map((comment, i) => (
                <div key={i}>{comment.content}</div>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment form for this line */}
      {commentForm && (
        <tr>
          <td colSpan={5} className="p-0">
            {commentForm}
          </td>
        </tr>
      )}
    </>
  );
}

function SideBySideCell({
  line,
  tokens,
  side,
  searchMatches,
  currentMatch,
  canComment,
  isHovered,
  isSelected,
  isInCommentRange,
  hasComment,
}: {
  line: DiffLine | null;
  tokens: ThemedToken[][];
  side: 'left' | 'right';
  searchMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
  canComment: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isInCommentRange: boolean;
  hasComment: boolean;
}) {
  // Gap cell (no line on this side)
  if (!line) {
    return (
      <>
        <td className="bg-bg-1/50 text-ink-4 pr-1 text-right align-top select-none" />
        <td className="bg-bg-1/50 overflow-hidden pr-2 whitespace-pre-wrap" />
      </>
    );
  }

  // Determine background and text colors based on line type and selection state
  const bgClass = isSelected
    ? '' // Row-level selection handles bg
    : isInCommentRange
      ? '' // Row-level comment range handles bg
      : line.type === 'deletion'
        ? 'bg-red-500/20'
        : line.type === 'addition'
          ? 'bg-green-500/20'
          : '';

  const lineNumClass =
    hasComment && !isSelected && !isInCommentRange
      ? 'text-acc-ink'
      : line.type === 'deletion'
        ? 'text-status-fail'
        : line.type === 'addition'
          ? 'text-status-done'
          : 'text-ink-4';

  // Get line number for this side
  const lineNumber = side === 'left' ? line.oldLineNumber : line.newLineNumber;

  // Get tokens for syntax highlighting
  const lineIndex = (lineNumber ?? 1) - 1;
  const lineTokens = tokens[lineIndex] || [];

  // Render content with search highlights
  const renderedContent =
    lineTokens.length > 0 ? (
      renderTokensWithHighlights({
        tokens: lineTokens,
        content: line.content,
        searchMatches,
        currentMatch,
      })
    ) : searchMatches.length > 0 ? (
      renderWithHighlights({
        text: line.content,
        searchMatches,
        currentMatch,
      })
    ) : (
      <span className="text-ink-1">{line.content}</span>
    );

  // Show comment icon on the left side's line number column when hovered
  const showCommentIcon = canComment && isHovered && side === 'left';

  return (
    <>
      {/* Line number */}
      <td
        className={clsx(
          'relative pr-1 text-right align-top select-none',
          lineNumClass,
          bgClass,
        )}
        style={
          hasComment && !isSelected && !isInCommentRange && side === 'left'
            ? { borderLeft: '2px solid oklch(0.78 0.18 295 / 0.5)' }
            : undefined
        }
      >
        <span className={clsx(showCommentIcon && 'invisible')}>
          {lineNumber ?? ''}
        </span>
        {showCommentIcon && (
          <span className="text-acc-ink absolute inset-0 flex items-center justify-center">
            <MessageSquarePlus className="h-3 w-3" aria-hidden />
          </span>
        )}
      </td>
      {/* Content */}
      <td
        className={clsx('overflow-hidden pr-2 whitespace-pre-wrap', bgClass, {
          'select-none': canComment,
        })}
      >
        {renderedContent}
      </td>
    </>
  );
}
