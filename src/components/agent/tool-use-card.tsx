import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ToolUseBlock } from '../../../shared/agent-types';

interface ToolUseCardProps {
  block: ToolUseBlock;
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

export function ToolUseCard({ block }: ToolUseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorClass = TOOL_COLORS[block.name] || 'bg-neutral-800 border-neutral-600';
  const formattedInput = formatInput(block.input);
  const isLongInput = formattedInput.length > 100 || formattedInput.includes('\n');

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="font-mono text-xs text-neutral-400">{block.name}</span>
        {!isExpanded && !isLongInput && (
          <span className="truncate text-neutral-300">{formattedInput}</span>
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-white/10 bg-black/20 px-3 py-2">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">
            {formattedInput}
          </pre>
        </div>
      )}
    </div>
  );
}
