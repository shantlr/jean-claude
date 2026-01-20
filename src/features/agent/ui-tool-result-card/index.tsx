import { ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

import type { ToolResultBlock, ContentBlock } from '../../../../shared/agent-types';

interface ToolResultCardProps {
  block: ToolResultBlock;
}

function formatContent(content: string | ContentBlock[]): string {
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

export function ToolResultCard({ block }: ToolResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const formattedContent = formatContent(block.content);
  const isLongContent = formattedContent.length > 200 || formattedContent.split('\n').length > 5;
  const isError = block.is_error;

  const borderColor = isError ? 'border-red-700' : 'border-neutral-700';
  const bgColor = isError ? 'bg-red-900/20' : 'bg-neutral-800/50';

  // Show preview: first line or first 100 chars
  const preview = formattedContent.split('\n')[0].slice(0, 100);

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-400" />
        )}
        {isError ? (
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
        ) : (
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-400" />
        )}
        <span className="text-xs text-neutral-400">
          {isError ? 'Error' : 'Result'}
        </span>
        {!isExpanded && (
          <span className="truncate text-xs text-neutral-500">
            {preview}
            {isLongContent && '...'}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="max-h-96 overflow-auto border-t border-white/10 bg-black/20 px-3 py-2">
          <pre className="whitespace-pre-wrap text-xs text-neutral-300">
            {formattedContent}
          </pre>
        </div>
      )}
    </div>
  );
}
