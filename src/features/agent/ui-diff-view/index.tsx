import { useEffect, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { computeDiff, type DiffLine } from './diff-utils';
import { getLanguageFromPath } from './language-utils';

interface DiffViewProps {
  filePath: string;
  oldString: string;
  newString: string;
  maxHeight?: string;
}

interface DiffState {
  lines: DiffLine[];
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
}

export function DiffView({ filePath, oldString, newString }: DiffViewProps) {
  const [state, setState] = useState<DiffState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const language = getLanguageFromPath(filePath);

  useEffect(() => {
    setIsLoading(true);

    // Compute diff
    const lines = computeDiff(oldString, newString);

    // Get syntax tokens for both strings (use space for empty to avoid Shiki errors)
    Promise.all([
      codeToTokens(oldString || ' ', {
        lang: language,
        theme: 'github-dark',
      }).catch(() =>
        codeToTokens(oldString || ' ', { lang: 'text', theme: 'github-dark' }),
      ),
      codeToTokens(newString || ' ', {
        lang: language,
        theme: 'github-dark',
      }).catch(() =>
        codeToTokens(newString || ' ', { lang: 'text', theme: 'github-dark' }),
      ),
    ])
      .then(([oldResult, newResult]) => {
        setState({
          lines,
          oldTokens: oldResult.tokens,
          newTokens: newResult.tokens,
        });
      })
      .catch(() => {
        // Fallback: no syntax highlighting
        setState({
          lines,
          oldTokens: [],
          newTokens: [],
        });
      })
      .finally(() => setIsLoading(false));
  }, [oldString, newString, language]);

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center rounded bg-black/30 p-2">
        <span className="text-xs text-neutral-500">Loading diff...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="overflow-auto rounded bg-black/30 font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {state.lines.map((line, i) => (
              <DiffLineRow
                key={i}
                line={line}
                oldTokens={state.oldTokens}
                newTokens={state.newTokens}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffLineRow({
  line,
  oldTokens,
  newTokens,
}: {
  line: DiffLine;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
}) {
  // Background colors for diff lines
  const bgClass =
    line.type === 'addition'
      ? 'bg-green-500/20'
      : line.type === 'deletion'
        ? 'bg-red-500/20'
        : '';

  // Line number colors
  const oldNumClass =
    line.type === 'deletion' ? 'text-red-400' : 'text-neutral-600';
  const newNumClass =
    line.type === 'addition' ? 'text-green-400' : 'text-neutral-600';

  // Prefix character (+/-/space)
  const prefix =
    line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';
  const prefixClass =
    line.type === 'addition'
      ? 'text-green-400'
      : line.type === 'deletion'
        ? 'text-red-400'
        : 'text-neutral-600';

  // Get tokens for this line based on type
  // For deletions, use old tokens; for additions, use new tokens; for context, prefer new
  const lineIndex =
    line.type === 'deletion'
      ? (line.oldLineNumber ?? 1) - 1
      : (line.newLineNumber ?? 1) - 1;

  const tokens =
    line.type === 'deletion'
      ? oldTokens[lineIndex] || []
      : newTokens[lineIndex] || [];

  return (
    <tr className={bgClass}>
      {/* Old line number */}
      <td
        className={`w-8 select-none pr-1 text-right align-top ${oldNumClass}`}
      >
        {line.oldLineNumber ?? ''}
      </td>
      {/* New line number */}
      <td
        className={`w-8 select-none pr-1 text-right align-top ${newNumClass}`}
      >
        {line.newLineNumber ?? ''}
      </td>
      {/* Prefix (+/-/space) */}
      <td className={`w-4 select-none text-center align-top ${prefixClass}`}>
        {prefix}
      </td>
      {/* Content with syntax highlighting */}
      <td className="whitespace-pre-wrap pr-2">
        {tokens.length > 0 ? (
          tokens.map((token, i) => (
            <span key={i} style={{ color: token.color }}>
              {token.content}
            </span>
          ))
        ) : (
          <span className="text-neutral-300">{line.content}</span>
        )}
      </td>
    </tr>
  );
}
