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
import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { formatNumber } from '@/lib/number';
import { formatDuration } from '@/lib/time';
import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

import { DiffView } from '../../ui-diff-view';
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
  if (typeof result === 'object') return JSON.stringify(result, null, 2);
  return String(result);
}

type EntryType = 'user' | 'tool' | 'text' | 'result' | 'system';

// Single dot entry component
function DotEntry({
  type,
  isError,
  isPending,
  summary,
  expandedContent,
  codeStyle = 'default',
  defaultExpanded = false,
}: {
  type: EntryType;
  isError?: boolean;
  isPending?: boolean;
  summary: string;
  expandedContent?: ReactNode;
  codeStyle?: CodeStyle;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasExpandedContent = !!expandedContent;

  // Dot colors: blue for tools, yellow for system, gray for text/result, purple for user
  const dotColor = isError
    ? 'bg-red-500'
    : type === 'tool'
      ? 'bg-blue-500'
      : type === 'user'
        ? 'bg-purple-500'
        : type === 'system'
          ? 'bg-yellow-500'
          : 'bg-neutral-500';

  const bgClass = type === 'user' ? 'bg-purple-500/5' : '';

  return (
    <div className={`relative pl-6 ${bgClass}`}>
      {/* Dot - centered on the border-left line (-4px to center 8px dot) */}
      <div
        className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full ${dotColor} ${isPending ? 'animate-pulse' : ''}`}
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
          <span className="text-xs text-neutral-300">
            <SummaryText text={summary} codeStyle={codeStyle} />
          </span>
        </div>

        {/* Expanded content */}
        {isExpanded && expandedContent && (
          <div className="mt-2 ml-5 border-l border-neutral-700 pl-3">
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

// Tool entry with expandable input/output
function ToolEntry({ toolUse }: { toolUse: NormalizedToolUse }) {
  const summary = getToolSummary(toolUse);
  const hasResult = toolUse.result !== undefined;
  const isError =
    toolUse.name === 'bash'
      ? (toolUse as ToolUseByName<'bash'>).result?.isError
      : false;
  const isPending = !hasResult;
  const codeStyle = getCodeStyleForTool(toolUse.name);

  // Check if this is an Edit tool with diff content
  const isEditTool = toolUse.name === 'edit';
  const isWriteTool = toolUse.name === 'write';

  // Auto-expand Edit and Write tools
  const shouldAutoExpand = isEditTool || isWriteTool;

  // Extract file_path for Read tool syntax highlighting
  const readFilePath =
    toolUse.name === 'read'
      ? (toolUse as ToolUseByName<'read'>).input.filePath
      : undefined;

  // For Edit tools, use DiffView; for Write tools, just show file info (no diff in V2)
  const hasDiffView = isEditTool;
  const formattedInput = hasDiffView ? '' : formatToolInput(toolUse);
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

  // Get diff view content based on tool type
  const getDiffViewContent = () => {
    if (isEditTool) {
      const e = toolUse as ToolUseByName<'edit'>;
      return (
        <DiffView
          filePath={e.input.filePath}
          oldString={e.input.oldString}
          newString={e.input.newString}
        />
      );
    }
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
      defaultExpanded={shouldAutoExpand}
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
    <div className="group/user relative bg-purple-500/5 pl-6">
      {/* Dot - purple for user */}
      <div className="absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-purple-500" />
      <div className="py-1.5 pr-3 text-xs text-neutral-300">
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

// Result entry (session complete)
function ResultEntry({
  entry,
  onFilePathClick,
}: {
  entry: Extract<NormalizedEntry, { type: 'result' }>;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const cost = entry.cost?.toFixed(2) || '0.00';
  const tokens = formatNumber(
    (entry.usage?.inputTokens ?? 0) + (entry.usage?.outputTokens ?? 0),
  );
  const summary = `--- ${tokens} tokens, ${formatDuration(entry.durationMs ?? 0)}, $${cost}`;

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
        className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-amber-500 ${!isComplete ? 'animate-pulse' : ''}`}
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
  onFilePathClick,
}: {
  entry: NormalizedEntry;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  switch (entry.type) {
    case 'user-prompt':
      if (!entry.value.trim()) return null;
      return <UserEntry text={entry.value} onFilePathClick={onFilePathClick} />;
    case 'assistant-message':
      if (!entry.value.trim()) return null;
      return <TextEntry text={entry.value} onFilePathClick={onFilePathClick} />;
    case 'tool-use':
      // Sub-agent tool-use entries are rendered as SubagentEntry in message stream
      if (entry.name === 'sub-agent') return null;
      return <ToolEntry toolUse={entry} />;
    case 'result':
      return <ResultEntry entry={entry} onFilePathClick={onFilePathClick} />;
    case 'system-status':
      // Handled by CompactingEntry in merger
      return null;
    default:
      return null;
  }
}
