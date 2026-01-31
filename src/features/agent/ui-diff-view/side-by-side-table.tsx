import { useMemo } from 'react';
import type { ThemedToken } from 'shiki';

import {
  computeSideBySideDiff,
  type DiffLine,
  type SideBySideRow,
} from './diff-utils';

export function SideBySideDiffTable({
  oldString,
  newString,
  oldTokens,
  newTokens,
}: {
  oldString: string;
  newString: string;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
}) {
  const rows = useMemo(
    () => computeSideBySideDiff(oldString, newString),
    [oldString, newString],
  );

  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((row, i) => (
          <SideBySideRowComponent
            key={i}
            row={row}
            oldTokens={oldTokens}
            newTokens={newTokens}
          />
        ))}
      </tbody>
    </table>
  );
}

function SideBySideRowComponent({
  row,
  oldTokens,
  newTokens,
}: {
  row: SideBySideRow;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
}) {
  return (
    <tr>
      {/* Left side (old/deletions) */}
      <SideBySideCell line={row.left} tokens={oldTokens} side="left" />
      {/* Divider */}
      <td className="w-px bg-neutral-700" />
      {/* Right side (new/additions) */}
      <SideBySideCell line={row.right} tokens={newTokens} side="right" />
    </tr>
  );
}

function SideBySideCell({
  line,
  tokens,
  side,
}: {
  line: DiffLine | null;
  tokens: ThemedToken[][];
  side: 'left' | 'right';
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
        {lineTokens.length > 0 ? (
          lineTokens.map((token, i) => (
            <span key={i} style={{ color: token.color }}>
              {token.content}
            </span>
          ))
        ) : (
          <span className="text-neutral-300">{line.content}</span>
        )}
      </td>
    </>
  );
}
