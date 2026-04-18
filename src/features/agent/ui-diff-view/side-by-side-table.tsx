import type { MouseEvent as ReactMouseEvent } from 'react';
import { useMemo } from 'react';
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

export function SideBySideDiffTable({
  oldString,
  newString,
  oldTokens,
  newTokens,
  searchMatches,
  currentMatchIndex,
}: {
  oldString: string;
  newString: string;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
}) {
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

  return (
    <table
      ref={tableRef}
      className={`w-full border-collapse ${isDragging ? 'select-none' : ''}`}
    >
      <colgroup>
        {/* Left line number */}
        <col style={{ width: 32 }} />
        {/* Left content */}
        <col style={{ width: leftPct }} />
        {/* Divider */}
        <col style={{ width: 4 }} />
        {/* Right line number */}
        <col style={{ width: 32 }} />
        {/* Right content */}
        <col style={{ width: rightPct }} />
      </colgroup>
      <tbody>
        {rows.map((row, rowIndex) => (
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
          />
        ))}
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
}) {
  return (
    <tr data-line-index={rowIndex}>
      {/* Left side (old/deletions) */}
      <SideBySideCell
        line={row.left}
        tokens={oldTokens}
        side="left"
        searchMatches={leftMatches}
        currentMatch={currentMatch}
      />
      {/* Divider / drag handle */}
      <td
        className={`bg-glass-medium hover:bg-acc/50 cursor-col-resize transition-colors ${isDragging ? 'bg-acc/50' : ''}`}
        onMouseDown={onDividerMouseDown}
      />
      {/* Right side (new/additions) */}
      <SideBySideCell
        line={row.right}
        tokens={newTokens}
        side="right"
        searchMatches={rightMatches}
        currentMatch={currentMatch}
      />
    </tr>
  );
}

function SideBySideCell({
  line,
  tokens,
  side,
  searchMatches,
  currentMatch,
}: {
  line: DiffLine | null;
  tokens: ThemedToken[][];
  side: 'left' | 'right';
  searchMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
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

  // Determine background and text colors based on line type
  const bgClass =
    line.type === 'deletion'
      ? 'bg-red-500/20'
      : line.type === 'addition'
        ? 'bg-green-500/20'
        : '';

  const lineNumClass =
    line.type === 'deletion'
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

  return (
    <>
      {/* Line number */}
      <td
        className={`pr-1 text-right align-top select-none ${lineNumClass} ${bgClass}`}
      >
        {lineNumber ?? ''}
      </td>
      {/* Content */}
      <td className={`overflow-hidden pr-2 whitespace-pre-wrap ${bgClass}`}>
        {renderedContent}
      </td>
    </>
  );
}
