import clsx from 'clsx';
import { AlertCircle, Check, Copy, Loader2, PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { formatNumber } from '@/lib/number';
import { formatDuration } from '@/lib/time';
import type {
  NormalizedMessage,
  NormalizedPart,
  NormalizedToolUsePart,
  NormalizedToolResultPart,
  NormalizedCompactPart,
  TodoItem,
} from '@shared/agent-backend-types';
import {
  isNormalizedTextPart,
  isNormalizedToolUsePart,
  isNormalizedUnknownPart,
  isStructuredTodoResult,
  isStructuredWriteResult,
} from '@shared/agent-backend-types';

import { DiffView } from '../ui-diff-view';
import { getLanguageFromPath } from '../ui-diff-view/language-utils';
import { MarkdownContent } from '../ui-markdown-content';
import { TodoListEntry } from '../ui-todo-list-entry';

import { getToolSummary } from './tool-summary';

// System message subtypes that should be hidden in the timeline
const HIDDEN_SYSTEM_SUBTYPES = [
  'init',
  'hook_started',
  'hook_completed',
  'hook_response',
  'status',
  'compact_boundary',
] as const;

type HiddenSystemSubtype = (typeof HIDDEN_SYSTEM_SUBTYPES)[number];

function formatResultContent(content: string | NormalizedPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) =>
      part.type === 'text' ? part.text : JSON.stringify(part, null, 2),
    )
    .join('\n');
}

// Parse line-numbered content (e.g., "     1→import..." format from Read tool)
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
  const lineNumberPattern = /^(\s*\d+)→(.*)$/;
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

function formatToolInput(input: Record<string, unknown>): string {
  if ('command' in input && typeof input.command === 'string')
    return input.command;
  if ('file_path' in input && typeof input.file_path === 'string') {
    if ('content' in input) return `${input.file_path}\n${input.content}`;
    if ('old_string' in input && 'new_string' in input) {
      return `${input.file_path}\n-${input.old_string}\n+${input.new_string}`;
    }
    return input.file_path;
  }
  if ('pattern' in input && typeof input.pattern === 'string')
    return input.pattern;
  if ('query' in input && typeof input.query === 'string') return input.query;
  if ('url' in input && typeof input.url === 'string') return input.url;
  return JSON.stringify(input, null, 2);
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

// Get code style based on tool name
function getCodeStyleForTool(toolName: string): CodeStyle {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return 'file';
    case 'Bash':
      return 'command';
    case 'Glob':
    case 'Grep':
      return 'pattern';
    default:
      return 'default';
  }
}

// Check if tool input is an Edit tool with old_string/new_string
function isEditToolInput(
  input: Record<string, unknown>,
): input is { file_path: string; old_string: string; new_string: string } {
  return (
    'file_path' in input &&
    'old_string' in input &&
    'new_string' in input &&
    typeof input.file_path === 'string' &&
    typeof input.old_string === 'string' &&
    typeof input.new_string === 'string'
  );
}

// Tool entry with expandable input/output
function ToolEntry({
  block,
  result,
  parentMessage,
}: {
  block: NormalizedToolUsePart;
  result?: NormalizedToolResultPart;
  parentMessage?: NormalizedMessage;
}) {
  const summary = getToolSummary(block, result);
  const hasResult = !!result;
  const isError = result?.isError;
  const isPending = !hasResult;
  const codeStyle = getCodeStyleForTool(block.toolName);
  const input = (block.input ?? {}) as Record<string, unknown>;

  // Check if this is an Edit tool with diff content
  const isEditTool = block.toolName === 'Edit' && isEditToolInput(input);
  const isWriteTool = block.toolName === 'Write';

  // Check if we have structured Write/Edit result data from the parent message's tool-result part
  const resultPart = parentMessage?.parts.find(
    (p): p is NormalizedToolResultPart =>
      p.type === 'tool-result' && p.toolId === block.toolId,
  );
  const writeToolResult =
    resultPart?.structuredResult &&
    isStructuredWriteResult(resultPart.structuredResult)
      ? resultPart.structuredResult
      : null;

  // Auto-expand Edit and Write tools
  const shouldAutoExpand = isEditTool || isWriteTool;

  // Extract edit input for DiffView (type-safe after guard)
  const editInput = isEditTool
    ? (input as {
        file_path: string;
        old_string: string;
        new_string: string;
      })
    : null;

  // Extract file_path for Read tool syntax highlighting
  const readFilePath =
    block.toolName === 'Read' &&
    'file_path' in input &&
    typeof input.file_path === 'string'
      ? input.file_path
      : undefined;

  // For Write/Edit tools with structured result, use DiffView instead of showing raw input
  const hasDiffView = isEditTool || (isWriteTool && writeToolResult);
  const formattedInput = hasDiffView ? '' : formatToolInput(input);
  const formattedResult = result ? formatResultContent(result.content) : '';
  const [expandContent, setExpandContent] = useState(false);

  // Custom rendering for TodoWrite
  if (block.toolName === 'TodoWrite') {
    // Case 1: Result available with structuredResult containing todo data
    const todoResultPart = parentMessage?.parts.find(
      (p): p is NormalizedToolResultPart =>
        p.type === 'tool-result' && p.toolId === block.toolId,
    );
    if (
      todoResultPart?.structuredResult &&
      isStructuredTodoResult(todoResultPart.structuredResult)
    ) {
      return (
        <TodoListEntry
          oldTodos={todoResultPart.structuredResult.oldTodos}
          newTodos={todoResultPart.structuredResult.newTodos}
        />
      );
    }

    // Case 2: Pending (no result yet) — show from input
    if (!result && Array.isArray(input.todos)) {
      const todos = input.todos as TodoItem[];
      return <TodoListEntry oldTodos={[]} newTodos={todos} isPending />;
    }
  }

  // Get diff view content based on tool type
  const getDiffViewContent = () => {
    if (editInput) {
      return (
        <DiffView
          filePath={editInput.file_path}
          oldString={editInput.old_string}
          newString={editInput.new_string}
        />
      );
    }
    if (isWriteTool && writeToolResult) {
      return (
        <DiffView
          filePath={writeToolResult.filePath}
          oldString={writeToolResult.originalFile}
          newString={writeToolResult.content}
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

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
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
        <MarkdownContent content={text} onFilePathClick={onFilePathClick} />
      </div>
      {/* Copy button - shown on hover */}
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-neutral-300 group-hover/user:opacity-100"
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
  message,
  onFilePathClick,
}: {
  message: NormalizedMessage;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const cost = message.totalCost?.costUsd?.toFixed(2) || '0.00';
  const tokens = formatNumber(
    (message?.usage?.cacheCreationTokens ?? 0) +
      (message?.usage?.inputTokens ?? 0) +
      (message?.usage?.outputTokens ?? 0),
  );
  const summary = `--- ${tokens} tokens, ${formatDuration(message.durationMs ?? 0)}, $${cost}`;

  const expandedContent = message.result ? (
    <div className="text-xs text-neutral-300">
      <MarkdownContent
        content={message.result}
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

// System message entry
function SystemEntry({ message }: { message: NormalizedMessage }) {
  // For system init messages, show a simple summary
  const hasInitPart = message.parts.some(
    (p) => p.type === 'system-status' && p.subtype === 'init',
  );
  const summary = hasInitPart ? 'Session started' : 'System message';

  return <DotEntry type="system" summary={summary} />;
}

function UnknownEntry({
  originalType,
  data,
}: {
  originalType: string;
  data: unknown;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1 rounded border border-yellow-800/40 bg-yellow-950/20 px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer items-center gap-2 text-yellow-500/80"
      >
        <span className="font-mono">⚠ Unknown: {originalType}</span>
        <span className="text-yellow-600/60">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <pre className="mt-2 max-h-[300px] overflow-auto font-mono break-all whitespace-pre-wrap text-yellow-500/60">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Helper to check if a message has a system-status part with a hidden subtype
function hasHiddenSystemSubtype(message: NormalizedMessage): boolean {
  return message.parts.some(
    (p) =>
      (p.type === 'system-status' &&
        HIDDEN_SYSTEM_SUBTYPES.includes(p.subtype as HiddenSystemSubtype)) ||
      p.type === 'compact',
  );
}

// Format token count with thousands separator
function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString();
}

// Compacting entry - shows context compaction status
export function CompactingEntry({
  isComplete,
  metadata,
}: {
  isComplete: boolean;
  metadata?: NormalizedCompactPart;
}) {
  const summary = isComplete
    ? `Context compacted (${formatTokenCount(metadata?.preTokens ?? 0)} tokens${metadata?.trigger === 'auto' ? ', auto' : ''})`
    : 'Compacting context...';

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
  message,
  toolResultsMap,
  parentMessageMap,
  onFilePathClick,
}: {
  message: NormalizedMessage;
  toolResultsMap?: Map<string, NormalizedToolResultPart>;
  parentMessageMap?: Map<string, NormalizedMessage>;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  // Skip system messages with hidden subtypes (init, hook_started, hook_completed, etc.)
  // or compact parts
  if (message.role === 'system' && hasHiddenSystemSubtype(message)) {
    return null;
  }

  // Other system messages (show them for visibility)
  if (message.role === 'system') {
    return <SystemEntry message={message} />;
  }

  // Result message
  if (message.role === 'result') {
    return <ResultEntry message={message} onFilePathClick={onFilePathClick} />;
  }

  // User message
  if (message.role === 'user') {
    const parts = message.parts;

    // Skip if only tool results
    const hasNonToolResultContent = parts.some(
      (part) => part.type !== 'tool-result',
    );
    if (!hasNonToolResultContent) return null;

    const textContent = parts
      .filter(isNormalizedTextPart)
      .map((p) => p.text)
      .join('\n');

    if (!textContent.trim()) return null;

    return <UserEntry text={textContent} onFilePathClick={onFilePathClick} />;
  }

  // Assistant message - render each part as separate entry
  if (message.role === 'assistant') {
    const parts = message.parts;
    const entries: ReactNode[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (isNormalizedTextPart(part) && part.text.trim()) {
        entries.push(
          <TextEntry
            key={i}
            text={part.text}
            onFilePathClick={onFilePathClick}
          />,
        );
      } else if (isNormalizedToolUsePart(part)) {
        // Skip Task tool_use parts - they're rendered as SubagentEntry in message stream
        if (part.toolName === 'Task') {
          continue;
        }
        const result = toolResultsMap?.get(part.toolId);
        const parentMessage = parentMessageMap?.get(part.toolId);
        entries.push(
          <ToolEntry
            key={i}
            block={part}
            result={result}
            parentMessage={parentMessage}
          />,
        );
      } else if (isNormalizedUnknownPart(part)) {
        entries.push(
          <UnknownEntry
            key={i}
            originalType={part.originalType}
            data={part.data}
          />,
        );
      }
    }

    return <>{entries}</>;
  }

  return null;
}
