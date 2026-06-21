import { ChevronDown, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { ThemedToken } from 'shiki';



import { computeCurrentStateLines, type DiffLine } from './diff-utils';
import {
  renderTokensWithHighlights,
  renderWithHighlights,
} from './utils-search-highlight';
import type { SearchMatch } from './use-diff-search';


import type {
  CodeFoldingState,
  CommentFormEntry,
  InlineComment,
  LineRange,
} from './index';

export function CurrentStateTable({
  oldString,
  newString,
  diffLines,
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
  diffLines: DiffLine[];
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
      if (!commentForms || commentForms.length === 0) return false;
      return commentForms.some(
        (cf) =>
          lineNumber >= cf.lineRange.start && lineNumber <= cf.lineRange.end,
      );
    },
    [commentForms],
  );

  return (
    <table
      className="w-full border-collapse"
      onMouseLeave={handleMouseLeaveTable}
    >
      <tbody>
        {lines.map((line, i) => {
          const lineNumber = line.lineNumber;

          // Check if this line is hidden by a collapsed fold
          if (folding.isLineHidden(lineNumber)) {
            return null;
          }

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

          const canComment = !!onAddCommentClick;
          const isSelected = isLineInSelection(lineNumber);
          const isInCommentRange = isLineInCommentRange(lineNumber);
          const isHovered = hoveredLine === lineNumber;

          const lineComments = inlineComments?.filter(
            (c) => c.line === lineNumber,
          );

          const formsForLine = commentForms
            ? commentForms.filter((cf) => cf.lineRange.end === lineNumber)
            : undefined;

          // Code folding state
          const isFoldable = folding.isFoldStart(lineNumber);
          const isFoldCollapsed = folding.isFoldCollapsed(lineNumber);
          const foldRange = folding.getFoldRange(lineNumber);

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
              hasComment={!!commentedLines?.has(lineNumber)}
              onMouseEnter={() => setHoveredLine(lineNumber)}
              onMouseDown={() => handleLineMouseDown(lineNumber)}
              onMouseUp={() => handleLineMouseUp(lineNumber)}
              inlineComments={lineComments}
              commentForms={formsForLine}
              isFoldable={isFoldable}
              isFoldCollapsed={isFoldCollapsed}
              foldRange={foldRange}
              onToggleFold={() => folding.toggleFold(lineNumber)}
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
  hasComment,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  inlineComments,
  commentForms,
  isFoldable,
  isFoldCollapsed,
  foldRange,
  onToggleFold,
}: {
  lineIndex: number;
  lineNumber: number;
  isChanged: boolean;
  renderedContent: ReactNode;
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
  isFoldable?: boolean;
  isFoldCollapsed?: boolean;
  foldRange?: { startLine: number; endLine: number };
  onToggleFold?: () => void;
}) {
  return (
    <>
      <tr
        data-line-index={lineIndex}
        data-new-line={lineNumber}
        className={clsx({
          'bg-blue-500/30': isSelected,
          'bg-blue-500/10': !isSelected && isInCommentRange,
          'bg-green-500/15': !isSelected && !isInCommentRange && isChanged,
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
        {/* Line number */}
        <td
          className={clsx(
            'relative w-8 pr-1 text-right align-top select-none',
            hasComment && !isSelected && !isInCommentRange
              ? 'text-acc-ink'
              : isChanged
                ? 'text-status-done'
                : 'text-ink-4',
          )}
          style={
            hasComment && !isSelected && !isInCommentRange
              ? { borderLeft: '2px solid oklch(0.78 0.18 295 / 0.5)' }
              : undefined
          }
        >
          <span className={clsx(canComment && isHovered && 'invisible')}>
            {lineNumber}
          </span>
          {canComment && isHovered && (
            <span className="text-acc-ink absolute inset-0 flex items-center justify-center">
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
            </span>
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
          {isFoldCollapsed && foldRange && (
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
      </tr>

      {/* Inline comments for this line */}
      {inlineComments && inlineComments.length > 0 && (
        <tr>
          <td colSpan={4} className="p-0">
            <div>
              {inlineComments.map((comment, ci) => (
                <div key={ci}>{comment.content}</div>
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
            <td colSpan={4} className="p-0">
              {cf.form}
            </td>
          </tr>
        ))}
    </>
  );
}
