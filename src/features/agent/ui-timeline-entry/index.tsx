import { AlertCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type {
  AgentMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../../../../shared/agent-types';
import { MarkdownContent } from '../ui-markdown-content';

import { getToolSummary } from './tool-summary';

interface TimelineEntryProps {
  message: AgentMessage;
  toolResultsMap?: Map<string, ToolResultBlock>;
  onFilePathClick?: (filePath: string, lineStart?: number, lineEnd?: number) => void;
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function formatResultContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' ? block.text : JSON.stringify(block, null, 2)))
    .join('\n');
}

// Parse line-numbered content (e.g., "     1→import..." format from Read tool)
function LineNumberedContent({
  content,
  maxHeight = 'max-h-64',
}: {
  content: string;
  maxHeight?: string;
}) {
  // Check if content has line numbers (format: spaces + number + arrow)
  const lineNumberPattern = /^(\s*\d+)→(.*)$/;
  const lines = content.split('\n');
  const hasLineNumbers = lines.length > 0 && lineNumberPattern.test(lines[0]);

  if (!hasLineNumbers) {
    return (
      <pre className={`${maxHeight} overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-neutral-300`}>
        {content}
      </pre>
    );
  }

  // Parse lines into line number and content
  const parsedLines = lines.map((line) => {
    const match = line.match(lineNumberPattern);
    if (match) {
      return { lineNum: match[1], content: match[2] };
    }
    return { lineNum: '', content: line };
  });

  return (
    <div className={`${maxHeight} overflow-auto rounded bg-black/30 p-2 font-mono text-xs`}>
      <table className="w-full border-collapse">
        <tbody>
          {parsedLines.map((line, i) => (
            <tr key={i}>
              <td className="select-none pr-3 text-right align-top text-neutral-600">
                {line.lineNum}
              </td>
              <td className="whitespace-pre-wrap text-neutral-300">{line.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatToolInput(input: Record<string, unknown>): string {
  if ('command' in input && typeof input.command === 'string') return input.command;
  if ('file_path' in input && typeof input.file_path === 'string') {
    if ('content' in input) return `${input.file_path}\n${input.content}`;
    if ('old_string' in input && 'new_string' in input) {
      return `${input.file_path}\n-${input.old_string}\n+${input.new_string}`;
    }
    return input.file_path;
  }
  if ('pattern' in input && typeof input.pattern === 'string') return input.pattern;
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
}: {
  type: EntryType;
  isError?: boolean;
  isPending?: boolean;
  summary: string;
  expandedContent?: ReactNode;
  codeStyle?: CodeStyle;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
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
        className={`absolute -left-1 top-2.5 h-2 w-2 rounded-full ${dotColor} ${isPending ? 'animate-pulse' : ''}`}
      />

      {/* Content */}
      <div
        className={`py-1.5 pr-3 ${hasExpandedContent ? 'cursor-pointer hover:bg-white/5' : ''}`}
        onClick={() => hasExpandedContent && setIsExpanded(!isExpanded)}
      >
        {/* Summary row */}
        <div className="flex items-center gap-2">
          {isPending && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-neutral-400" />}
          {isError && <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />}
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
function SummaryText({ text, codeStyle = 'default' }: { text: string; codeStyle?: CodeStyle }) {
  // Split by backticks and render code spans
  const parts = text.split(/(`[^`]+`)/g);

  const codeClasses: Record<CodeStyle, string> = {
    file: 'text-blue-400 underline decoration-blue-400/50',
    command: 'rounded border border-cyan-700/50 bg-cyan-900/30 px-1 py-0.5 text-xs text-cyan-200',
    pattern: 'rounded border border-green-700/50 bg-green-900/30 px-1 py-0.5 text-xs text-green-200',
    default: 'rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200',
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

// Tool entry with expandable input/output
function ToolEntry({
  block,
  result,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
}) {
  const summary = getToolSummary(block, result);
  const hasResult = !!result;
  const isError = result?.is_error;
  const isPending = !hasResult;
  const codeStyle = getCodeStyleForTool(block.name);

  const formattedInput = formatToolInput(block.input);
  const formattedResult = result ? formatResultContent(result.content) : '';

  const expandedContent = (
    <div className="space-y-2 text-xs">
      <div>
        <div className="mb-1 font-medium text-neutral-500">Input</div>
        <LineNumberedContent content={formattedInput} maxHeight="max-h-48" />
      </div>
      {hasResult && (
        <div>
          <div className={`mb-1 font-medium ${isError ? 'text-red-400' : 'text-neutral-500'}`}>
            {isError ? 'Error' : 'Result'}
          </div>
          {isError ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-red-900/20 p-2 text-neutral-300">
              {formattedResult}
            </pre>
          ) : (
            <LineNumberedContent content={formattedResult} />
          )}
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
  onFilePathClick?: TimelineEntryProps['onFilePathClick'];
}) {
  return (
    <div className="relative pl-6">
      {/* Dot - gray for text */}
      <div className="absolute -left-1 top-2.5 h-2 w-2 rounded-full bg-neutral-500" />
      <div className="py-1.5 pr-3 text-xs text-neutral-300">
        <MarkdownContent content={text} onFilePathClick={onFilePathClick} />
      </div>
    </div>
  );
}

// User message entry
function UserEntry({
  text,
  onFilePathClick,
}: {
  text: string;
  onFilePathClick?: TimelineEntryProps['onFilePathClick'];
}) {
  const truncated = text.length > 60 ? text.slice(0, 60) + '...' : text;
  const needsExpansion = text.length > 60;

  const expandedContent = needsExpansion ? (
    <div className="text-xs text-neutral-300">
      <MarkdownContent content={text} onFilePathClick={onFilePathClick} />
    </div>
  ) : null;

  return (
    <DotEntry
      type="user"
      summary={truncated}
      expandedContent={expandedContent}
    />
  );
}

// Result entry (session complete)
function ResultEntry({
  message,
  onFilePathClick,
}: {
  message: AgentMessage;
  onFilePathClick?: TimelineEntryProps['onFilePathClick'];
}) {
  const cost = message.cost_usd?.toFixed(4) || '0.0000';
  const duration = message.duration_ms
    ? (message.duration_ms / 1000).toFixed(1)
    : '0.0';
  const summary = `Session complete ($${cost}, ${duration}s)`;

  const expandedContent = message.result ? (
    <div className="text-xs text-neutral-300">
      <MarkdownContent content={message.result} onFilePathClick={onFilePathClick} />
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
function SystemEntry({ message }: { message: AgentMessage }) {
  // For system init messages, show a simple summary
  const summary = message.subtype === 'init' ? 'Session started' : 'System message';

  return <DotEntry type="system" summary={summary} />;
}

export function TimelineEntry({ message, toolResultsMap, onFilePathClick }: TimelineEntryProps) {
  // Skip system init messages (replaced by user prompt entries)
  if (message.type === 'system' && message.subtype === 'init') {
    return null;
  }

  // Other system messages
  if (message.type === 'system') {
    return <SystemEntry message={message} />;
  }

  // Result message
  if (message.type === 'result') {
    return <ResultEntry message={message} onFilePathClick={onFilePathClick} />;
  }

  // User message
  if (message.type === 'user' && message.message) {
    const content = message.message.content;

    // Skip if only tool results
    if (Array.isArray(content)) {
      const hasNonToolResultContent = content.some((block) => block.type !== 'tool_result');
      if (!hasNonToolResultContent) return null;
    }

    const textContent =
      typeof content === 'string'
        ? content
        : content
            .filter(isTextBlock)
            .map((b) => b.text)
            .join('\n');

    if (!textContent.trim()) return null;

    return <UserEntry text={textContent} onFilePathClick={onFilePathClick} />;
  }

  // Assistant message - render each content block as separate entry
  if (message.type === 'assistant' && message.message && message.message.role === 'assistant') {
    const contentBlocks = message.message.content;
    const entries: ReactNode[] = [];

    for (let i = 0; i < contentBlocks.length; i++) {
      const block = contentBlocks[i];

      if (isTextBlock(block) && block.text.trim()) {
        entries.push(
          <TextEntry key={i} text={block.text} onFilePathClick={onFilePathClick} />
        );
      } else if (isToolUseBlock(block)) {
        const result = toolResultsMap?.get(block.id);
        entries.push(<ToolEntry key={i} block={block} result={result} />);
      }
    }

    return <>{entries}</>;
  }

  return null;
}
