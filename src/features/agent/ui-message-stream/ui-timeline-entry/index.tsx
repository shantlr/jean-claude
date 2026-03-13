import clsx from 'clsx';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  PackageOpen,
} from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { formatNumber } from '@/lib/number';
import { formatDuration } from '@/lib/time';
import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

import { computeDiff } from '../../ui-diff-view/diff-utils';
import { getLanguageFromPath } from '../../ui-diff-view/language-utils';
import { MarkdownContent } from '../../ui-markdown-content';
import { TodoListEntry } from '../ui-todo-list-entry';

import { getToolSummary } from './tool-summary';

// Parse line-numbered content (e.g., "     1->import..." format from Read tool)
// Optionally apply syntax highlighting if filePath is provided
function LineNumberedContent({
  content,
  filePath,
}: {
  content: string;
  filePath?: string;
}) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);

  // Check if content has line numbers (format: spaces + number + arrow)
  const lineNumberPattern = /^(\s*\d+)\u2192(.*)$/;
  const lines = content.split('\n');
  const hasLineNumbers = lines.length > 0 && lineNumberPattern.test(lines[0]);

  // Parse lines into line number and content
  const parsedLines = hasLineNumbers
    ? lines.map((line) => {
        const match = line.match(lineNumberPattern);
        if (match) {
          return { lineNum: match[1], content: match[2] };
        }
        return { lineNum: '', content: line };
      })
    : null;

  // Extract raw code for syntax highlighting (join parsed content lines)
  const rawCode = parsedLines
    ? parsedLines.map((l) => l.content).join('\n')
    : content;

  // Get language from file path for syntax highlighting
  const language = filePath ? getLanguageFromPath(filePath) : 'text';

  // Load syntax tokens asynchronously
  useEffect(() => {
    if (language === 'text') {
      setTokens(null);
      return;
    }

    codeToTokens(rawCode || ' ', {
      lang: language,
      theme: 'github-dark',
    })
      .then((result) => setTokens(result.tokens))
      .catch(() => {
        // Fallback to no highlighting
        setTokens(null);
      });
  }, [rawCode, language]);

  // Render content without line numbers
  if (!hasLineNumbers || !parsedLines) {
    return (
      <div className="relative">
        <pre className="overflow-auto rounded bg-black/30 p-2 whitespace-pre-wrap text-neutral-300">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="overflow-auto rounded bg-black/30 p-2 font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {parsedLines.map((line, i) => {
              const lineTokens = tokens?.[i];
              return (
                <tr key={i}>
                  <td className="pr-3 text-right align-top text-neutral-600 select-none">
                    {line.lineNum}
                  </td>
                  <td className="whitespace-pre-wrap">
                    {lineTokens ? (
                      lineTokens.map((token, j) => (
                        <span key={j} style={{ color: token.color }}>
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span className="text-neutral-300">{line.content}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatToolInput(toolUse: NormalizedToolUse): string {
  switch (toolUse.name) {
    case 'bash':
      return (toolUse as ToolUseByName<'bash'>).input.command;
    case 'read':
      return (toolUse as ToolUseByName<'read'>).input.filePath;
    case 'write': {
      const w = toolUse as ToolUseByName<'write'>;
      return `${w.input.filePath}\n${w.input.value}`;
    }
    case 'edit': {
      const e = toolUse as ToolUseByName<'edit'>;
      return `${e.input.filePath}\n-${e.input.oldString}\n+${e.input.newString}`;
    }
    case 'grep':
      return (toolUse as ToolUseByName<'grep'>).input.pattern;
    case 'glob':
      return (toolUse as ToolUseByName<'glob'>).input.pattern;
    case 'web-search':
      return (toolUse as ToolUseByName<'web-search'>).input.query;
    case 'web-fetch':
      return (toolUse as ToolUseByName<'web-fetch'>).input.url;
    case 'mcp':
      return JSON.stringify((toolUse as ToolUseByName<'mcp'>).input, null, 2);
    default: {
      const input = toolUse.input;
      if (input && typeof input === 'object') {
        return JSON.stringify(input, null, 2);
      }
      return String(input ?? '');
    }
  }
}

function formatToolResult(toolUse: NormalizedToolUse): string {
  const result = toolUse.result;
  if (result === undefined || result === null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    // Extract content string from bash results instead of showing raw JSON
    if (
      toolUse.name === 'bash' &&
      'content' in result &&
      typeof (result as Record<string, unknown>).content === 'string'
    ) {
      return (result as { content: string }).content;
    }
    return JSON.stringify(result, null, 2);
  }
  return String(result);
}

type EntryType = 'user' | 'tool' | 'text' | 'thinking' | 'result' | 'system';

// Single dot entry component
function DotEntry({
  type,
  isError,
  isPending,
  summary,
  expandedContent,
  persistentContent,
  codeStyle = 'default',
  defaultExpanded = false,
}: {
  type: EntryType;
  isError?: boolean;
  isPending?: boolean;
  summary: string;
  expandedContent?: ReactNode;
  persistentContent?: ReactNode;
  codeStyle?: CodeStyle;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasExpandedContent = !!expandedContent;

  // Dot colors: blue for tools, yellow for system, amber for thinking, gray for text/result, purple for user
  const dotColor = isError
    ? 'bg-red-500'
    : type === 'tool'
      ? 'bg-blue-500'
      : type === 'user'
        ? 'bg-purple-500'
        : type === 'system'
          ? 'bg-yellow-500'
          : type === 'thinking'
            ? 'bg-amber-400'
            : 'bg-neutral-500';

  const bgClass = type === 'user' ? 'bg-purple-500/5' : '';

  return (
    <div className={`relative pl-6 ${bgClass}`}>
      {/* Dot - centered on the border-left line (-4px to center 8px dot) */}
      <div
        className={clsx(
          'absolute top-2.5 -left-1 h-2 w-2 rounded-full',
          dotColor,
          isPending && 'animate-pulse',
          isPending &&
            type === 'tool' &&
            'shadow-[0_0_6px_theme(colors.blue.500/40)]',
          isPending &&
            type === 'system' &&
            'shadow-[0_0_6px_theme(colors.amber.500/40)]',
        )}
      />

      {/* Content */}
      <div
        className={`py-1.5 pr-3 ${hasExpandedContent ? 'cursor-pointer hover:bg-white/5' : ''}`}
        onClick={() => hasExpandedContent && setIsExpanded(!isExpanded)}
      >
        {/* Summary row */}
        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin text-neutral-400"
              aria-hidden
            />
          )}
          {isError && (
            <AlertCircle
              className="h-3 w-3 shrink-0 text-red-400"
              aria-hidden
            />
          )}
          <span
            className={clsx(
              'text-xs',
              type === 'tool'
                ? 'text-neutral-400'
                : type === 'result'
                  ? 'text-neutral-500'
                  : 'text-neutral-300',
            )}
          >
            <SummaryText text={summary} codeStyle={codeStyle} />
          </span>
        </div>

        {persistentContent && (
          <div className="mt-2 ml-5">{persistentContent}</div>
        )}

        {/* Expanded content */}
        {isExpanded && expandedContent && (
          <div className="relative mt-2 ml-5 pl-4">
            <div className="absolute top-1 bottom-1 left-1.5 w-px rounded-full bg-white/[0.06]" />
            {expandedContent}
          </div>
        )}
      </div>
    </div>
  );
}

type CodeStyle = 'file' | 'command' | 'pattern' | 'default';

// Render inline code in summary text with tool-specific styling
function SummaryText({
  text,
  codeStyle = 'default',
}: {
  text: string;
  codeStyle?: CodeStyle;
}) {
  // Split by backticks and render code spans
  const parts = text.split(/(`[^`]+`)/g);

  const codeClasses: Record<CodeStyle, string> = {
    file: 'text-blue-400 underline decoration-blue-400/50',
    command:
      'rounded border border-cyan-700/50 bg-cyan-900/30 px-1 py-0.5 text-cyan-200',
    pattern:
      'rounded border border-green-700/50 bg-green-900/30 px-1 py-0.5 text-green-200',
    default: 'rounded bg-neutral-800 px-1 py-0.5 text-neutral-200',
  };

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1);
          return (
            <code key={i} className={codeClasses[codeStyle]}>
              {code}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Get code style based on V2 tool name (lowercase)
function getCodeStyleForTool(toolName: string): CodeStyle {
  switch (toolName) {
    case 'read':
    case 'write':
    case 'edit':
      return 'file';
    case 'bash':
      return 'command';
    case 'glob':
    case 'grep':
      return 'pattern';
    default:
      return 'default';
  }
}

const DIFF_PREVIEW_MAX_LINES = 10;

function CompactDiffPreview({
  filePath,
  oldString,
  newString,
  onClick,
}: {
  filePath: string;
  oldString: string;
  newString: string;
  onClick?: (filePath: string, oldString: string, newString: string) => void;
}) {
  const [oldTokens, setOldTokens] = useState<ThemedToken[][]>([]);
  const [newTokens, setNewTokens] = useState<ThemedToken[][]>([]);
  const language = getLanguageFromPath(filePath);

  useEffect(() => {
    let isCancelled = false;

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
        if (isCancelled) return;
        setOldTokens(oldResult.tokens);
        setNewTokens(newResult.tokens);
      })
      .catch(() => {
        if (isCancelled) return;
        setOldTokens([]);
        setNewTokens([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [language, oldString, newString]);

  const preview = useMemo(() => {
    const lines = computeDiff(oldString, newString);
    const firstChangeIndex = lines.findIndex((line) => line.type !== 'context');
    const startIndex =
      firstChangeIndex === -1 ? 0 : Math.max(0, firstChangeIndex - 2);
    const endIndex = Math.min(
      lines.length,
      startIndex + DIFF_PREVIEW_MAX_LINES,
    );

    return {
      lines: lines.slice(startIndex, endIndex),
      hasMore: endIndex < lines.length,
      hiddenCount: lines.length - endIndex,
    };
  }, [oldString, newString]);

  const handleClick = useCallback(() => {
    onClick?.(filePath, oldString, newString);
  }, [filePath, oldString, newString, onClick]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const getLineTokens = useCallback(
    (line: {
      type: 'context' | 'addition' | 'deletion';
      oldLineNumber?: number;
      newLineNumber?: number;
    }) => {
      if (line.type === 'deletion' && line.oldLineNumber) {
        return oldTokens[line.oldLineNumber - 1] ?? null;
      }
      if (
        (line.type === 'addition' || line.type === 'context') &&
        line.newLineNumber
      ) {
        return newTokens[line.newLineNumber - 1] ?? null;
      }
      return null;
    },
    [newTokens, oldTokens],
  );

  const renderLineContent = useCallback(
    (line: {
      type: 'context' | 'addition' | 'deletion';
      content: string;
      oldLineNumber?: number;
      newLineNumber?: number;
    }) => {
      const lineTokens = getLineTokens(line);
      if (!lineTokens || lineTokens.length === 0) {
        return <span className="text-neutral-300">{line.content || ' '}</span>;
      }
      return lineTokens.map((token, tokenIndex) => (
        <span key={tokenIndex} style={{ color: token.color }}>
          {token.content}
        </span>
      ));
    },
    [getLineTokens],
  );

  return (
    <div
      onClick={handleClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={clsx(
        'w-full rounded bg-black/30 p-2 text-left font-mono text-xs text-neutral-300',
        onClick && 'cursor-pointer hover:bg-blue-500/5',
      )}
      title={onClick ? `Open full diff for ${filePath}` : undefined}
    >
      <table className="w-full border-collapse">
        <tbody>
          {preview.lines.map((line, index) => {
            const prefix =
              line.type === 'addition'
                ? '+'
                : line.type === 'deletion'
                  ? '-'
                  : ' ';
            return (
              <tr
                key={`${index}-${line.oldLineNumber ?? 'x'}-${line.newLineNumber ?? 'x'}-${line.content}`}
                className={clsx(
                  line.type === 'addition' && 'bg-green-500/20',
                  line.type === 'deletion' && 'bg-red-500/20',
                )}
              >
                <td
                  className={clsx(
                    'w-8 pr-1 text-right align-top text-neutral-600 tabular-nums select-none',
                    line.type === 'deletion' && 'text-red-400',
                  )}
                >
                  {line.oldLineNumber ?? ''}
                </td>
                <td
                  className={clsx(
                    'w-8 pr-1 text-right align-top text-neutral-600 tabular-nums select-none',
                    line.type === 'addition' && 'text-green-400',
                  )}
                >
                  {line.newLineNumber ?? ''}
                </td>
                <td
                  className={clsx(
                    'w-4 text-center align-top text-neutral-600 select-none',
                    {
                      'text-green-400': line.type === 'addition',
                      'text-red-400': line.type === 'deletion',
                    },
                  )}
                >
                  {prefix}
                </td>
                <td className="pr-2 whitespace-pre-wrap">
                  {renderLineContent(line)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {preview.hasMore && (
        <div className="mt-2 text-[11px] text-neutral-500">
          +{preview.hiddenCount} more lines (click to open full diff)
        </div>
      )}
    </div>
  );
}

// Tool entry with expandable input/output
function ToolEntry({
  toolUse,
  onToolDiffClick,
}: {
  toolUse: NormalizedToolUse;
  onToolDiffClick?: (
    filePath: string,
    oldString: string,
    newString: string,
  ) => void;
}) {
  const summary = getToolSummary(toolUse);
  const hasResult = toolUse.result !== undefined;
  const isError =
    toolUse.name === 'bash'
      ? (toolUse as ToolUseByName<'bash'>).result?.isError
      : false;
  const isPending = !hasResult;
  const codeStyle = getCodeStyleForTool(toolUse.name);

  // Check if this is an Edit or Write tool with diff content
  const isEditTool = toolUse.name === 'edit';
  const isWriteTool = toolUse.name === 'write';

  // Extract file_path for Read tool syntax highlighting
  const readFilePath =
    toolUse.name === 'read'
      ? (toolUse as ToolUseByName<'read'>).input.filePath
      : undefined;

  const formattedInput = formatToolInput(toolUse);
  const formattedResult = formatToolResult(toolUse);
  const [expandContent, setExpandContent] = useState(false);

  // Custom rendering for TodoWrite
  if (toolUse.name === 'todo-write') {
    const tw = toolUse as ToolUseByName<'todo-write'>;
    // Case 1: Result available with todo data
    if (tw.result) {
      return (
        <TodoListEntry
          oldTodos={
            tw.result.oldTodos?.map((t) => ({
              content: t.content,
              status: t.status,
              activeForm: t.description ?? t.content,
            })) ?? []
          }
          newTodos={
            tw.result.newTodos?.map((t) => ({
              content: t.content,
              status: t.status,
              activeForm: t.description ?? t.content,
            })) ?? []
          }
        />
      );
    }

    // Case 2: Pending (no result yet) - show from input
    if (tw.input.todos) {
      return (
        <TodoListEntry
          oldTodos={[]}
          newTodos={tw.input.todos.map((t) => ({
            content: t.content,
            status: t.status,
            activeForm: t.description ?? t.content,
          }))}
          isPending
        />
      );
    }
  }

  // Custom rendering for AskUserQuestion to show question-response pairs
  if (toolUse.name === 'ask-user-question') {
    const ask = toolUse as ToolUseByName<'ask-user-question'>;
    const answersByQuestion = new Map(
      (ask.result?.answers ?? []).map((answer) => [
        answer.question,
        answer.answer,
      ]),
    );

    return (
      <DotEntry
        type="tool"
        isPending={isPending}
        summary={summary}
        expandedContent={
          <div className="space-y-3 text-xs">
            {ask.input.questions.map((question, index) => {
              const response = answersByQuestion.get(question.question);
              const responseText = Array.isArray(response)
                ? response.join(', ')
                : response;

              return (
                <div
                  key={`${question.question}-${index}`}
                  className="space-y-2"
                >
                  <div className="font-medium text-neutral-500">
                    {ask.input.questions.length > 1
                      ? `Question ${index + 1}`
                      : 'Question'}
                  </div>
                  <div className="rounded bg-black/30 p-2 whitespace-pre-wrap text-neutral-200">
                    {question.question}
                  </div>
                  {ask.result && (
                    <div>
                      <div className="mb-1 font-medium text-neutral-500">
                        Response
                      </div>
                      <div className="rounded bg-black/30 p-2 whitespace-pre-wrap text-neutral-300">
                        {responseText ?? 'No response'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
        defaultExpanded
      />
    );
  }

  if (isEditTool || isWriteTool) {
    const editTool = isEditTool ? (toolUse as ToolUseByName<'edit'>) : null;
    const writeTool = isWriteTool ? (toolUse as ToolUseByName<'write'>) : null;
    const filePath =
      editTool?.input.filePath ?? writeTool?.input.filePath ?? '';
    const oldString = editTool?.input.oldString ?? '';
    const newString = editTool?.input.newString ?? writeTool?.input.value ?? '';

    return (
      <DotEntry
        type="tool"
        isPending={isPending}
        summary={summary}
        codeStyle={codeStyle}
        persistentContent={
          <CompactDiffPreview
            filePath={filePath}
            oldString={oldString}
            newString={newString}
            onClick={onToolDiffClick}
          />
        }
      />
    );
  }

  const hasDiffView = false;

  // Get diff view content based on tool type
  const getDiffViewContent = () => {
    return <LineNumberedContent content={formattedInput} />;
  };

  const expandedContent = (
    <div className="space-y-2 text-xs">
      <div>
        <div className="mb-1 font-medium text-neutral-500">
          {hasDiffView ? 'Changes' : 'Input'}
        </div>
        <div
          className={clsx('cursor-pointer', {
            'max-h-48 overflow-auto rounded': !expandContent,
          })}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            setExpandContent((v) => !v);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation();
              event.preventDefault();
              setExpandContent((v) => !v);
            }
          }}
        >
          {getDiffViewContent()}
        </div>
      </div>
      {/* Only show Result section for non-diff tools or errors */}
      {hasResult && !hasDiffView && (
        <div>
          <div
            className={`mb-1 font-medium ${isError ? 'text-red-400' : 'text-neutral-500'}`}
          >
            {isError ? 'Error' : 'Result'}
          </div>
          {isError ? (
            <pre className="max-h-64 overflow-auto rounded bg-red-900/20 p-2 whitespace-pre-wrap text-neutral-300">
              {formattedResult}
            </pre>
          ) : (
            <LineNumberedContent
              content={formattedResult}
              filePath={readFilePath}
            />
          )}
        </div>
      )}
      {/* Show error for diff tools */}
      {hasResult && hasDiffView && isError && (
        <div>
          <div className="mb-1 font-medium text-red-400">Error</div>
          <pre className="max-h-64 overflow-auto rounded bg-red-900/20 p-2 whitespace-pre-wrap text-neutral-300">
            {formattedResult}
          </pre>
        </div>
      )}
    </div>
  );

  return (
    <DotEntry
      type="tool"
      isError={isError}
      isPending={isPending}
      summary={summary}
      expandedContent={expandedContent}
      codeStyle={codeStyle}
    />
  );
}

// Text entry (agent thinking) - always fully visible, not expandable
function TextEntry({
  text,
  onFilePathClick,
}: {
  text: string;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  return (
    <div className="relative pl-6">
      {/* Dot - gray for text */}
      <div className="absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-neutral-500" />
      <div className="py-1.5 pr-3 text-xs text-neutral-300">
        <MarkdownContent content={text} onFilePathClick={onFilePathClick} />
      </div>
    </div>
  );
}

// Thinking entry - collapsible extended thinking / chain-of-thought
function ThinkingEntry({ text }: { text: string }) {
  return (
    <DotEntry
      type="thinking"
      summary="Thinking…"
      expandedContent={
        <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap text-neutral-400">
          {text}
        </pre>
      }
    />
  );
}

// User message entry - shows full content, clickable for file paths
const USER_MESSAGE_MAX_CHARS = 300;

function UserEntry({
  text,
  onFilePathClick,
}: {
  text: string;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const wasTruncated = text.length > USER_MESSAGE_MAX_CHARS;
  const displayText =
    expanded || !wasTruncated
      ? text
      : text.slice(0, USER_MESSAGE_MAX_CHARS).trimEnd();

  const handleCopy = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [text],
  );

  return (
    <div className="group/user relative border-l-2 border-purple-500 bg-purple-500/8 pl-6">
      <div className="py-2.5 pr-3 text-[13px] leading-relaxed text-neutral-200">
        <MarkdownContent
          content={displayText}
          onFilePathClick={onFilePathClick}
        />
        {wasTruncated && !expanded && (
          <span className="text-neutral-500">&hellip;</span>
        )}
      </div>
      {wasTruncated && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-0.5 pb-1.5 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              Show more
            </>
          )}
        </button>
      )}
      {/* Copy button - shown on hover */}
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 rounded p-1 text-neutral-500 opacity-0 transition-opacity group-hover/user:opacity-100 hover:bg-neutral-700 hover:text-neutral-300"
        title="Copy message"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// Result entry (session complete or error)
function ResultEntry({
  entry,
  durationMs,
  onFilePathClick,
}: {
  entry: Extract<NormalizedEntry, { type: 'result' }>;
  durationMs?: number;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  if (entry.isError) {
    const errorText = entry.value || 'Unknown error';
    return (
      <DotEntry
        type="result"
        isError
        summary={errorText}
        defaultExpanded={false}
      />
    );
  }

  const cost = entry.cost?.toFixed(2) || '0.00';
  const tokens = formatNumber(
    (entry.usage?.inputTokens ?? 0) + (entry.usage?.outputTokens ?? 0),
  );
  const resolvedDurationMs =
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs >= 0
      ? durationMs
      : typeof entry.durationMs === 'number' &&
          Number.isFinite(entry.durationMs) &&
          entry.durationMs >= 0
        ? entry.durationMs
        : 0;
  const summary = `--- ${tokens} tokens, ${formatDuration(resolvedDurationMs)}, $${cost}`;

  const expandedContent = entry.value ? (
    <div className="text-xs text-neutral-300">
      <MarkdownContent
        content={entry.value}
        onFilePathClick={onFilePathClick}
      />
    </div>
  ) : null;

  return (
    <DotEntry
      type="result"
      summary={summary}
      expandedContent={expandedContent}
    />
  );
}

// Compacting entry - shows context compaction status
export function CompactingEntry({ isComplete }: { isComplete: boolean }) {
  const summary = isComplete ? 'Context compacted' : 'Compacting context...';

  return (
    <div className="relative pl-6">
      {/* Dot - orange/amber for compacting */}
      <div
        className={clsx(
          'absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-amber-500',
          !isComplete &&
            'animate-pulse shadow-[0_0_6px_theme(colors.amber.500/40)]',
        )}
      />
      <div className="py-1.5 pr-3">
        <div className="flex items-center gap-2">
          {!isComplete && (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin text-amber-400"
              aria-hidden
            />
          )}
          {isComplete && (
            <PackageOpen
              className="h-3 w-3 shrink-0 text-amber-400"
              aria-hidden
            />
          )}
          <span className="text-xs text-neutral-400">{summary}</span>
        </div>
      </div>
    </div>
  );
}

export function TimelineEntry({
  entry,
  resultDurationMs,
  onFilePathClick,
  onToolDiffClick,
}: {
  entry: NormalizedEntry;
  resultDurationMs?: number;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onToolDiffClick?: (
    filePath: string,
    oldString: string,
    newString: string,
  ) => void;
}) {
  switch (entry.type) {
    case 'user-prompt':
      if (!entry.value.trim()) return null;
      return <UserEntry text={entry.value} onFilePathClick={onFilePathClick} />;
    case 'assistant-message':
      if (!entry.value.trim()) return null;
      return <TextEntry text={entry.value} onFilePathClick={onFilePathClick} />;
    case 'thinking':
      if (!entry.value.trim()) return null;
      return <ThinkingEntry text={entry.value} />;
    case 'tool-use':
      // Sub-agent tool-use entries are rendered as SubagentEntry in message stream
      if (entry.name === 'sub-agent') return null;
      return <ToolEntry toolUse={entry} onToolDiffClick={onToolDiffClick} />;
    case 'result':
      return (
        <ResultEntry
          entry={entry}
          durationMs={resultDurationMs}
          onFilePathClick={onFilePathClick}
        />
      );
    case 'system-status':
      // Handled by CompactingEntry in merger
      return null;
    default:
      return null;
  }
}
