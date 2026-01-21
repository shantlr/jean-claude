import { ChevronDown, ChevronRight, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { ToolUseBlock, ToolResultBlock, ContentBlock } from '../../../../shared/agent-types';

interface ToolUseCardProps {
  block: ToolUseBlock;
  result?: ToolResultBlock;
}

// Format tool input for display
function formatInput(input: Record<string, unknown>): string {
  // Special handling for common tools
  if ('command' in input && typeof input.command === 'string') {
    return input.command;
  }
  if ('file_path' in input && typeof input.file_path === 'string') {
    if ('content' in input) {
      return `${input.file_path}\n${input.content}`;
    }
    if ('old_string' in input && 'new_string' in input) {
      return `${input.file_path}\n-${input.old_string}\n+${input.new_string}`;
    }
    return input.file_path;
  }
  if ('pattern' in input && typeof input.pattern === 'string') {
    return input.pattern;
  }
  if ('query' in input && typeof input.query === 'string') {
    return input.query;
  }
  if ('url' in input && typeof input.url === 'string') {
    return input.url;
  }

  return JSON.stringify(input, null, 2);
}

function formatResultContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((block) => {
      if (block.type === 'text') {
        return block.text;
      }
      return JSON.stringify(block, null, 2);
    })
    .join('\n');
}

const TOOL_COLORS: Record<string, string> = {
  Read: 'bg-blue-900/50 border-blue-700',
  Write: 'bg-green-900/50 border-green-700',
  Edit: 'bg-yellow-900/50 border-yellow-700',
  Bash: 'bg-purple-900/50 border-purple-700',
  Glob: 'bg-cyan-900/50 border-cyan-700',
  Grep: 'bg-cyan-900/50 border-cyan-700',
  WebSearch: 'bg-orange-900/50 border-orange-700',
  WebFetch: 'bg-orange-900/50 border-orange-700',
  Task: 'bg-pink-900/50 border-pink-700',
  TodoWrite: 'bg-indigo-900/50 border-indigo-700',
  AskUserQuestion: 'bg-teal-900/50 border-teal-700',
};

export function ToolUseCard({ block, result }: ToolUseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorClass = TOOL_COLORS[block.name] || 'bg-neutral-800 border-neutral-600';
  const formattedInput = formatInput(block.input);

  const hasResult = !!result;
  const isError = result?.is_error;
  const formattedResult = result ? formatResultContent(result.content) : '';
  const resultPreview = formattedResult.split('\n')[0].slice(0, 80);
  const inputPreview = formattedInput.split('\n')[0].slice(0, 80);

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      {/* Tool header */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <span className="font-mono text-xs text-neutral-400">{block.name}</span>

        {/* Status indicator */}
        {hasResult ? (
          isError ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-400" />
          )
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-400" />
        )}
      </button>

      {/* Collapsed input preview */}
      {!isExpanded && (
        <div className="border-t border-white/10 bg-black/20 px-3 py-1.5">
          <span className="text-xs text-neutral-300">
            {inputPreview}
            {formattedInput.length > 80 && '...'}
          </span>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          {/* Input section */}
          <div className="bg-black/20 px-3 py-2">
            <div className="mb-1 text-xs font-medium text-neutral-500">Input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">
              {formattedInput}
            </pre>
          </div>

          {/* Result section */}
          {hasResult && (
            <div className={`border-t border-white/10 px-3 py-2 ${isError ? 'bg-red-900/20' : 'bg-black/10'}`}>
              <div className={`mb-1 text-xs font-medium ${isError ? 'text-red-400' : 'text-neutral-500'}`}>
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">
                {formattedResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Collapsed result preview */}
      {!isExpanded && hasResult && (
        <div className={`border-t border-white/10 px-3 py-1.5 ${isError ? 'bg-red-900/20' : 'bg-black/10'}`}>
          <span className={`text-xs ${isError ? 'text-red-300' : 'text-neutral-500'}`}>
            {resultPreview}
            {formattedResult.length > 80 && '...'}
          </span>
        </div>
      )}
    </div>
  );
}
