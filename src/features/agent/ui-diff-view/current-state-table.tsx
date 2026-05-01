import clsx from 'clsx';
import { useMemo } from 'react';
import type { ThemedToken } from 'shiki';

import { computeCurrentStateLines, type DiffLine } from './diff-utils';
import type { SearchMatch } from './use-diff-search';
import {
  renderTokensWithHighlights,
  renderWithHighlights,
} from './utils-search-highlight';

export function CurrentStateTable({
  oldString,
  newString,
  diffLines,
  newTokens,
  searchMatches,
  currentMatchIndex,
}: {
  oldString: string;
  newString: string;
  diffLines: DiffLine[];
  newTokens: ThemedToken[][];
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
}) {
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

  return (
    <table className="w-full border-collapse">
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

          return (
            <tr
              key={i}
              data-line-index={i}
              className={clsx({
                'bg-green-500/15': line.isChanged,
              })}
            >
              {/* Line number */}
              <td
                className={clsx(
                  'w-8 pr-1 text-right align-top select-none',
                  line.isChanged ? 'text-status-done' : 'text-ink-4',
                )}
              >
                {line.lineNumber}
              </td>
              {/* Change indicator */}
              <td
                className={clsx(
                  'w-4 text-center align-top select-none',
                  line.isChanged ? 'text-status-done' : 'text-ink-4',
                )}
              >
                {line.isChanged ? '│' : ' '}
              </td>
              {/* Content */}
              <td className="pr-2 whitespace-pre-wrap">{renderedContent}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
