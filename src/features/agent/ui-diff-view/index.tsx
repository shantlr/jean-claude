import clsx from 'clsx';
import { AlignJustify, Columns2, MessageSquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { DiffMinimap, type ViewportInfo } from './diff-minimap';
import { DiffSearchBar } from './diff-search-bar';
import { computeDiff, type DiffLine } from './diff-utils';
import { getLanguageFromPath } from './language-utils';
import { SideBySideDiffTable } from './side-by-side-table';
import { useDiffSearch, type SearchMatch } from './use-diff-search';
import {
  renderTokensWithHighlights,
  renderWithHighlights,
} from './utils-search-highlight';

interface DiffState {
  lines: DiffLine[];
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
}

export interface InlineComment {
  line: number;
  content: ReactNode;
}

export interface LineRange {
  start: number;
  end: number;
}

export function DiffView({
  filePath,
  oldString,
  newString,
  withMinimap,
  onAddCommentClick,
  inlineComments,
  commentFormLineRange,
  commentForm,
}: {
  filePath: string;
  oldString: string;
  newString: string;
  maxHeight?: string;
  withMinimap?: boolean;
  /** Called when user selects lines to comment on */
  onAddCommentClick?: (lineRange: LineRange) => void;
  /** Inline comments to render below specific lines */
  inlineComments?: InlineComment[];
  /** Line range where comment form should be shown (shows after end line) */
  commentFormLineRange?: LineRange | null;
  /** Comment form to render inline */
  commentForm?: ReactNode;
}) {
  const [state, setState] = useState<DiffState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'inline' | 'side-by-side'>('inline');
  const [viewport, setViewport] = useState<ViewportInfo | undefined>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const language = getLanguageFromPath(filePath);

  // Update viewport info on scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setViewport({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
    }
  }, []);

  // Initialize viewport info after content loads
  useEffect(() => {
    if (state && scrollContainerRef.current) {
      handleScroll();
    }
  }, [state, handleScroll]);

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

  // Search functionality
  const {
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    matches,
    currentMatchIndex,
    totalMatches,
    searchBarRef,
    closeSearch,
    goToNextMatch,
    goToPreviousMatch,
  } = useDiffSearch({
    lines: state?.lines ?? [],
    scrollContainerRef,
  });

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center rounded bg-black/30 p-2">
        <span className="text-xs text-neutral-500">Loading diff…</span>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Search bar and toggle mode button */}
      <div className="absolute top-2 right-4 z-10 flex items-center gap-2">
        {isSearchOpen && (
          <DiffSearchBar
            ref={searchBarRef}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            currentMatch={totalMatches > 0 ? currentMatchIndex + 1 : 0}
            totalMatches={totalMatches}
            onNext={goToNextMatch}
            onPrevious={goToPreviousMatch}
            onClose={closeSearch}
          />
        )}
        <button
          onClick={() =>
            setViewMode(viewMode === 'inline' ? 'side-by-side' : 'inline')
          }
          className="rounded bg-neutral-700/70 p-1 text-neutral-300 hover:bg-neutral-600 hover:text-neutral-100"
          aria-label={
            viewMode === 'inline'
              ? 'Switch to side-by-side view'
              : 'Switch to inline view'
          }
        >
          {viewMode === 'inline' ? (
            <Columns2 className="h-4 w-4" aria-hidden />
          ) : (
            <AlignJustify className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={clsx(
          'h-full flex-1 overflow-auto bg-black/30 pt-2 pb-2 font-mono text-xs',
          {
            'no-scrollbar': !!withMinimap,
          },
        )}
      >
        {viewMode === 'inline' ? (
          <InlineDiffTable
            lines={state.lines}
            oldTokens={state.oldTokens}
            newTokens={state.newTokens}
            onAddCommentClick={onAddCommentClick}
            inlineComments={inlineComments}
            commentFormLineRange={commentFormLineRange}
            commentForm={commentForm}
            searchMatches={matches}
            currentMatchIndex={currentMatchIndex}
          />
        ) : (
          <SideBySideDiffTable
            oldString={oldString}
            newString={newString}
            oldTokens={state.oldTokens}
            newTokens={state.newTokens}
            searchMatches={matches}
            currentMatchIndex={currentMatchIndex}
          />
        )}
      </div>
      {!!withMinimap && <DiffMinimap lines={state.lines} viewport={viewport} />}
    </div>
  );
}

function InlineDiffTable({
  lines,
  oldTokens,
  newTokens,
  onAddCommentClick,
  inlineComments,
  commentFormLineRange,
  commentForm,
  searchMatches,
  currentMatchIndex,
}: {
  lines: DiffLine[];
  oldTokens: ThemedToken[][];
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

  // Check if a line is in the selection range
  const isLineInSelection = useCallback(
    (lineNumber: number) => {
      if (selectionStart === null || hoveredLine === null) return false;
      const start = Math.min(selectionStart, hoveredLine);
      const end = Math.max(selectionStart, hoveredLine);
      return lineNumber >= start && lineNumber <= end;
    },
    [selectionStart, hoveredLine],
  );

  // Check if a line is in the comment form range
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

  // Track which lines we've already rendered (to avoid duplicates for same newLineNumber)
  const renderedNewLineNumbers = new Set<number>();

  return (
    <table
      className="w-full border-collapse"
      onMouseLeave={handleMouseLeaveTable}
    >
      <tbody>
        {lines.map((line, i) => {
          // Use newLineNumber for comments (the line in the new version)
          const lineNumber = line.newLineNumber;

          // Skip rendering comments/form for lines we've already processed
          // This prevents duplicate forms when deletion+addition have same effective position
          const shouldRenderExtras =
            lineNumber !== undefined && !renderedNewLineNumbers.has(lineNumber);
          if (lineNumber !== undefined) {
            renderedNewLineNumbers.add(lineNumber);
          }

          const lineComments =
            shouldRenderExtras && lineNumber
              ? inlineComments?.filter((c) => c.line === lineNumber)
              : undefined;

          const showCommentForm =
            shouldRenderExtras &&
            commentFormLineRange &&
            lineNumber === commentFormLineRange.end;

          const isSelected = lineNumber ? isLineInSelection(lineNumber) : false;
          const isInCommentRange = lineNumber
            ? isLineInCommentRange(lineNumber)
            : false;

          // Find search matches for this line
          const lineMatches = searchMatches.filter((m) => m.lineIndex === i);
          const isCurrentMatchLine =
            searchMatches[currentMatchIndex]?.lineIndex === i;
          const currentMatchInLine = isCurrentMatchLine
            ? searchMatches[currentMatchIndex]
            : null;

          return (
            <DiffLineRow
              key={i}
              line={line}
              oldTokens={oldTokens}
              newTokens={newTokens}
              canComment={!!onAddCommentClick && lineNumber !== undefined}
              isHovered={hoveredLine === lineNumber}
              isSelected={isSelected}
              isInCommentRange={isInCommentRange}
              onMouseEnter={() => lineNumber && setHoveredLine(lineNumber)}
              onMouseDown={() => lineNumber && handleLineMouseDown(lineNumber)}
              onMouseUp={() => lineNumber && handleLineMouseUp(lineNumber)}
              inlineComments={lineComments}
              commentForm={showCommentForm ? commentForm : undefined}
              searchMatches={lineMatches}
              currentMatch={currentMatchInLine}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function DiffLineRow({
  line,
  oldTokens,
  newTokens,
  canComment,
  isHovered,
  isSelected,
  isInCommentRange,
  onMouseEnter,
  onMouseDown,
  onMouseUp,
  inlineComments,
  commentForm,
  searchMatches,
  currentMatch,
}: {
  line: DiffLine;
  oldTokens: ThemedToken[][];
  newTokens: ThemedToken[][];
  canComment: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isInCommentRange: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
  inlineComments?: InlineComment[];
  commentForm?: ReactNode;
  searchMatches: SearchMatch[];
  currentMatch: SearchMatch | null;
}) {
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

  // Render content with search highlights
  const renderedContent =
    tokens.length > 0 ? (
      renderTokensWithHighlights({
        tokens,
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
      <tr
        className={clsx({
          'bg-blue-500/30': isSelected,
          'bg-blue-500/10': !isSelected && isInCommentRange,
          'bg-green-500/20':
            !isSelected && !isInCommentRange && line.type === 'addition',
          'bg-red-500/20':
            !isSelected && !isInCommentRange && line.type === 'deletion',
        })}
        onMouseEnter={onMouseEnter}
        onMouseDown={canComment ? onMouseDown : undefined}
        onMouseUp={canComment ? onMouseUp : undefined}
        style={{ cursor: canComment ? 'pointer' : undefined }}
      >
        {/* Add comment button / Old line number */}
        <td
          className={clsx(
            'relative w-8 pr-1 text-right align-top select-none',
            line.type === 'deletion' ? 'text-red-400' : 'text-neutral-600',
          )}
        >
          {canComment && isHovered ? (
            <span className="flex h-full w-full items-center justify-center text-blue-400">
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
            </span>
          ) : (
            (line.oldLineNumber ?? '')
          )}
        </td>
        {/* New line number */}
        <td
          className={clsx(
            'w-8 pr-1 text-right align-top select-none',
            line.type === 'addition' ? 'text-green-400' : 'text-neutral-600',
          )}
        >
          {line.newLineNumber ?? ''}
        </td>
        {/* Prefix (+/-/space) */}
        <td
          className={clsx('w-4 text-center align-top select-none', {
            'text-green-400': line.type === 'addition',
            'text-red-400': line.type === 'deletion',
            'text-neutral-600': line.type === 'context',
          })}
        >
          {line.type === 'addition'
            ? '+'
            : line.type === 'deletion'
              ? '-'
              : ' '}
        </td>
        {/* Content with syntax highlighting and search highlights */}
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
          <td colSpan={4} className="p-0">
            <div className="border-y border-neutral-700 bg-neutral-800/80 px-4 py-2">
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
          <td colSpan={4} className="p-0">
            <div className="border-y border-blue-600/50 bg-neutral-800/90 px-4 py-3">
              {commentForm}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
