import { useMemo } from 'react';
import type { ThemedToken } from 'shiki';

import {
  computeDiff,
  computeSideBySideDiff,
  type DiffLine,
  type SideBySideRow,
} from './diff-utils';
import type { SearchMatch } from './use-diff-search';
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

  return (
    <table className="w-full border-collapse">
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
}: {
  row: SideBySideRow;
  rowIndex: number;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  leftMatches: SearchMatch[];
  rightMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
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
      {/* Divider */}
      <td className="w-px bg-neutral-700" />
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
        <td className="w-8 bg-neutral-800/50 pr-1 text-right align-top text-neutral-600 select-none" />
        <td className="w-full bg-neutral-800/50 pr-2 whitespace-pre-wrap" />
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
      ? 'text-red-400'
      : line.type === 'addition'
        ? 'text-green-400'
        : 'text-neutral-600';

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
      <span className="text-neutral-300">{line.content}</span>
    );

  return (
    <>
      {/* Line number */}
      <td
        className={`w-8 pr-1 text-right align-top select-none ${lineNumClass} ${bgClass}`}
      >
        {lineNumber ?? ''}
      </td>
      {/* Content */}
      <td className={`w-1/2 pr-2 whitespace-pre-wrap ${bgClass}`}>
        {renderedContent}
      </td>
    </>
  );
}
