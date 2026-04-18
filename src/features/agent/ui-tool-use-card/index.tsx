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
  const colorClass = TOOL_COLORS[toolUse.name] || 'bg-bg-1 border-glass-border';
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
          <ChevronDown className="text-ink-2 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-2 h-4 w-4 shrink-0" />
        )}
        <span className="text-ink-2 font-mono text-xs">{toolUse.name}</span>

        {/* Status indicator */}
        {hasResult ? (
          isError ? (
            <AlertCircle className="text-status-fail h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle className="text-status-done h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <Loader2 className="text-ink-2 h-3.5 w-3.5 shrink-0 animate-spin" />
        )}
      </button>

      {/* Collapsed input preview */}
      {!isExpanded && (
        <div className="border-t border-white/10 bg-black/20 px-3 py-1.5">
          <pre className="text-ink-1">{formattedInput}</pre>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          {/* Input section */}
          <div className="bg-black/20 px-3 py-2">
            <div className="text-ink-3 mb-1 text-xs font-medium">Input</div>
            <pre className="text-ink-1 overflow-x-auto text-xs whitespace-pre-wrap">
              {formattedInput}
            </pre>
          </div>

          {/* Result section */}
          {hasResult && (
            <div
              className={`border-t border-white/10 px-3 py-2 ${isError ? 'bg-red-900/20' : 'bg-black/10'}`}
            >
              <div
                className={`mb-1 text-xs font-medium ${isError ? 'text-status-fail' : 'text-ink-3'}`}
              >
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className="text-ink-1 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
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
            className={`text-xs ${isError ? 'text-status-fail' : 'text-ink-3'}`}
          >
            {resultPreview}
            {formattedResult.length > 80 && '...'}
          </span>
        </div>
      )}
    </div>
  );
}
