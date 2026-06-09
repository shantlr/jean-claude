import clsx from 'clsx';
import { ChevronDown, ChevronRight, MessageSquarePlus } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
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

import type {
  CodeFoldingState,
  CommentFormEntry,
  InlineComment,
  LineRange,
} from './index';

export function SideBySideDiffTable({
  oldString,
  newString,
  oldTokens,
  newTokens,
  onAddCommentClick,
  inlineComments,
  commentedLines,
  commentForms,
  searchMatches,
  currentMatchIndex,
  folding,
}: {
  oldString: string;
  newString: string;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  onAddCommentClick?: (lineRange: LineRange) => void;
  inlineComments?: InlineComment[];
  commentedLines?: Set<number>;
  commentForms?: CommentFormEntry[];
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  folding: CodeFoldingState;
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
      if (!commentForms || commentForms.length === 0) return false;
      return commentForms.some(
        (cf) =>
          lineNumber >= cf.lineRange.start && lineNumber <= cf.lineRange.end,
      );
    },
    [commentForms],
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
        {/* Fold gutter */}
        <col style={{ width: 16 }} />
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
          // Prefer new line anchors; fall back to old lines so deleted rows can
          // still receive review comments.
          const newLineNumber =
            row.right?.newLineNumber ??
            row.left?.newLineNumber ??
            row.left?.oldLineNumber;

          // Check if this line is hidden by a collapsed fold
          if (newLineNumber && folding.isLineHidden(newLineNumber)) {
            return null;
          }

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

          const formsForLine =
            shouldRenderExtras && newLineNumber && commentForms
              ? commentForms.filter((cf) => cf.lineRange.end === newLineNumber)
              : undefined;

          const isSelected = newLineNumber
            ? isLineInSelection(newLineNumber)
            : false;
          const isInCommentRange = newLineNumber
            ? isLineInCommentRange(newLineNumber)
            : false;

          const canComment = !!onAddCommentClick && newLineNumber !== undefined;

          // Code folding state
          const isFoldable = newLineNumber
            ? folding.isFoldStart(newLineNumber)
            : false;
          const isFoldCollapsed = newLineNumber
            ? folding.isFoldCollapsed(newLineNumber)
            : false;
          const foldRange = newLineNumber
            ? folding.getFoldRange(newLineNumber)
            : undefined;

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
              commentForms={formsForLine}
              newLineNumber={newLineNumber}
              isFoldable={isFoldable}
              isFoldCollapsed={isFoldCollapsed}
              foldRange={foldRange}
              onToggleFold={
                newLineNumber
                  ? () => folding.toggleFold(newLineNumber)
                  : undefined
              }
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
  commentForms,
  newLineNumber,
  isFoldable,
  isFoldCollapsed,
  foldRange,
  onToggleFold,
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
  commentForms?: CommentFormEntry[];
  newLineNumber?: number;
  isFoldable?: boolean;
  isFoldCollapsed?: boolean;
  foldRange?: { startLine: number; endLine: number };
  onToggleFold?: () => void;
}) {
  return (
    <>
      <tr
        data-line-index={rowIndex}
        data-new-line={newLineNumber}
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
        {/* Fold gutter */}
        <td className="w-4 align-top select-none">
          {isFoldable && (
            <button
              className="text-ink-4 hover:text-ink-1 flex h-full w-full items-center justify-center transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFold?.();
              }}
              aria-label={isFoldCollapsed ? 'Expand scope' : 'Collapse scope'}
              aria-expanded={!isFoldCollapsed}
            >
              {isFoldCollapsed ? (
                <ChevronRight className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}
        </td>
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
          isFoldCollapsed={isFoldCollapsed}
          foldRange={foldRange}
          onToggleFold={onToggleFold}
        />
      </tr>

      {/* Inline comments for this line */}
      {inlineComments && inlineComments.length > 0 && (
        <tr>
          <td colSpan={6} className="p-0">
            <div>
              {inlineComments.map((comment, i) => (
                <div key={i}>{comment.content}</div>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment forms for this line */}
      {commentForms &&
        commentForms.length > 0 &&
        commentForms.map((cf) => (
          <tr key={`form-${cf.lineRange.start}-${cf.lineRange.end}`}>
            <td colSpan={6} className="p-0">
              {cf.form}
            </td>
          </tr>
        ))}
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
  isFoldCollapsed,
  foldRange,
  onToggleFold,
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
  isFoldCollapsed?: boolean;
  foldRange?: { startLine: number; endLine: number };
  onToggleFold?: () => void;
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
        {side === 'right' && isFoldCollapsed && foldRange && (
          <span
            className="text-ink-4 bg-bg-2 ml-2 inline-block cursor-pointer rounded px-1.5 py-0 text-[10px] leading-4"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFold?.();
            }}
          >
            {foldRange.endLine - foldRange.startLine} lines
          </span>
        )}
      </td>
    </>
  );
}
