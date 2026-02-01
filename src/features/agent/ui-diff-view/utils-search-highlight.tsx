import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { ThemedToken } from 'shiki';

import type { SearchMatch } from './use-diff-search';

/**
 * Render plain text with search match highlights
 */
export function renderWithHighlights({
  text,
  searchMatches,
  currentMatch,
}: {
  text: string;
  searchMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
}): ReactNode {
  if (searchMatches.length === 0) {
    return text;
  }

  const result: ReactNode[] = [];
  let lastIndex = 0;

  // Sort matches by start index
  const sortedMatches = [...searchMatches].sort(
    (a, b) => a.startIndex - b.startIndex,
  );

  sortedMatches.forEach((match, i) => {
    // Add text before the match
    if (match.startIndex > lastIndex) {
      result.push(text.slice(lastIndex, match.startIndex));
    }

    // Determine if this is the current match
    const isCurrent =
      currentMatch &&
      currentMatch.lineIndex === match.lineIndex &&
      currentMatch.startIndex === match.startIndex &&
      currentMatch.endIndex === match.endIndex;

    // Add the highlighted match
    result.push(
      <mark
        key={i}
        data-current-match={isCurrent ? 'true' : undefined}
        className={clsx('rounded-sm', {
          'bg-yellow-500/80 text-black': isCurrent,
          'bg-yellow-500/30': !isCurrent,
        })}
      >
        {text.slice(match.startIndex, match.endIndex)}
      </mark>,
    );

    lastIndex = match.endIndex;
  });

  // Add remaining text after last match
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

/**
 * Render syntax-highlighted tokens with search match highlights
 */
export function renderTokensWithHighlights({
  tokens,
  content,
  searchMatches,
  currentMatch,
}: {
  tokens: ThemedToken[];
  content: string;
  searchMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
}): ReactNode {
  if (searchMatches.length === 0) {
    return tokens.map((token, i) => (
      <span key={i} style={{ color: token.color }}>
        {token.content}
      </span>
    ));
  }

  // Build a character-level color map from tokens
  const colorMap: (string | undefined)[] = [];
  let pos = 0;
  for (const token of tokens) {
    for (let i = 0; i < token.content.length; i++) {
      colorMap[pos + i] = token.color;
    }
    pos += token.content.length;
  }

  const result: ReactNode[] = [];
  let lastIndex = 0;

  // Sort matches by start index
  const sortedMatches = [...searchMatches].sort(
    (a, b) => a.startIndex - b.startIndex,
  );

  sortedMatches.forEach((match, matchIndex) => {
    // Add tokens before the match
    if (match.startIndex > lastIndex) {
      const beforeText = content.slice(lastIndex, match.startIndex);
      let charPos = lastIndex;
      let currentColor = colorMap[charPos];
      let segmentStart = 0;

      for (let i = 0; i <= beforeText.length; i++) {
        const color = colorMap[charPos + i];
        if (color !== currentColor || i === beforeText.length) {
          if (i > segmentStart) {
            result.push(
              <span
                key={`before-${matchIndex}-${segmentStart}`}
                style={{ color: currentColor }}
              >
                {beforeText.slice(segmentStart, i)}
              </span>,
            );
          }
          currentColor = color;
          segmentStart = i;
        }
      }
    }

    // Determine if this is the current match
    const isCurrent =
      currentMatch &&
      currentMatch.lineIndex === match.lineIndex &&
      currentMatch.startIndex === match.startIndex &&
      currentMatch.endIndex === match.endIndex;

    // Add the highlighted match with syntax colors preserved inside
    const matchText = content.slice(match.startIndex, match.endIndex);
    result.push(
      <mark
        key={`match-${matchIndex}`}
        data-current-match={isCurrent ? 'true' : undefined}
        className={clsx('rounded-sm', {
          'bg-yellow-500/80 text-black': isCurrent,
          'bg-yellow-500/30': !isCurrent,
        })}
      >
        {matchText}
      </mark>,
    );

    lastIndex = match.endIndex;
  });

  // Add remaining tokens after last match
  if (lastIndex < content.length) {
    const afterText = content.slice(lastIndex);
    let charPos = lastIndex;
    let currentColor = colorMap[charPos];
    let segmentStart = 0;

    for (let i = 0; i <= afterText.length; i++) {
      const color = colorMap[charPos + i];
      if (color !== currentColor || i === afterText.length) {
        if (i > segmentStart) {
          result.push(
            <span key={`after-${segmentStart}`} style={{ color: currentColor }}>
              {afterText.slice(segmentStart, i)}
            </span>,
          );
        }
        currentColor = color;
        segmentStart = i;
      }
    }
  }

  return result;
}
