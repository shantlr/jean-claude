import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';

import type {
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

// Format tool input for display
function formatInput(toolUse: NormalizedToolUse): string {
  switch (toolUse.name) {
    case 'bash':
      return (toolUse as ToolUseByName<'bash'>).input.command;
    case 'read':
      return (toolUse as ToolUseByName<'read'>).input.filePath;
    case 'write': {
      const t = toolUse as ToolUseByName<'write'>;
      return `${t.input.filePath}\n${t.input.value}`;
    }
    case 'edit': {
      const t = toolUse as ToolUseByName<'edit'>;
      return `${t.input.filePath}\n-${t.input.oldString}\n+${t.input.newString}`;
    }
    case 'grep':
      return (toolUse as ToolUseByName<'grep'>).input.pattern;
    case 'glob':
      return (toolUse as ToolUseByName<'glob'>).input.pattern;
    case 'web-search':
      return (toolUse as ToolUseByName<'web-search'>).input.query;
    case 'web-fetch':
      return (toolUse as ToolUseByName<'web-fetch'>).input.url;
    case 'skill':
      return (toolUse as ToolUseByName<'skill'>).skillName;
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

function formatResult(toolUse: NormalizedToolUse): string {
  const result = toolUse.result;
  if (result === undefined || result === null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') return JSON.stringify(result, null, 2);
  return String(result);
}

const TOOL_COLORS: Record<string, string> = {
  read: 'bg-blue-900/50 border-blue-700',
  write: 'bg-green-900/50 border-green-700',
  edit: 'bg-yellow-900/50 border-yellow-700',
  bash: 'bg-purple-900/50 border-purple-700',
  glob: 'bg-cyan-900/50 border-cyan-700',
  grep: 'bg-cyan-900/50 border-cyan-700',
  'web-search': 'bg-orange-900/50 border-orange-700',
  'web-fetch': 'bg-orange-900/50 border-orange-700',
  'sub-agent': 'bg-pink-900/50 border-pink-700',
  'todo-write': 'bg-indigo-900/50 border-indigo-700',
  'ask-user-question': 'bg-teal-900/50 border-teal-700',
  skill: 'bg-violet-900/50 border-violet-700',
};

export function ToolUseCard({ toolUse }: { toolUse: NormalizedToolUse }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorClass =
    TOOL_COLORS[toolUse.name] || 'bg-neutral-800 border-neutral-600';
  const formattedInput = formatInput(toolUse);

  const hasResult = toolUse.result !== undefined;
  const isError =
    toolUse.name === 'bash'
      ? (toolUse as ToolUseByName<'bash'>).result?.isError
      : false;
  const formattedResult = formatResult(toolUse);
  const resultPreview = formattedResult.split('\n')[0].slice(0, 80);

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
        <span className="font-mono text-xs text-neutral-400">
          {toolUse.name}
        </span>

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
          <pre className="text-neutral-300">{formattedInput}</pre>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          {/* Input section */}
          <div className="bg-black/20 px-3 py-2">
            <div className="mb-1 text-xs font-medium text-neutral-500">
              Input
            </div>
            <pre className="overflow-x-auto text-xs whitespace-pre-wrap text-neutral-300">
              {formattedInput}
            </pre>
          </div>

          {/* Result section */}
          {hasResult && (
            <div
              className={`border-t border-white/10 px-3 py-2 ${isError ? 'bg-red-900/20' : 'bg-black/10'}`}
            >
              <div
                className={`mb-1 text-xs font-medium ${isError ? 'text-red-400' : 'text-neutral-500'}`}
              >
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap text-neutral-300">
                {formattedResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Collapsed result preview */}
      {!isExpanded && hasResult && (
        <div
          className={`border-t border-white/10 px-3 py-1.5 ${isError ? 'bg-red-900/20' : 'bg-black/10'}`}
        >
          <span
            className={`text-xs ${isError ? 'text-red-300' : 'text-neutral-500'}`}
          >
            {resultPreview}
            {formattedResult.length > 80 && '...'}
          </span>
        </div>
      )}
    </div>
  );
}
