import { Wand2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { AgentMessage, TextBlock } from '../../../../shared/agent-types';
import { MarkdownContent } from '../ui-markdown-content';

/**
 * Extract text content from a skill prompt message.
 */
function getPromptText(message: AgentMessage): string {
  if (!message.message || message.message.role !== 'user') {
    return '';
  }

  const content = message.message.content;
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Displays a merged skill launch + prompt as a single expandable entry.
 * Shows skill name with an expand button to reveal the full skill documentation.
 */
export function SkillEntry({
  skillName,
  promptMessage,
  onFilePathClick,
}: {
  skillName: string;
  promptMessage: AgentMessage;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const promptText = getPromptText(promptMessage);

  return (
    <div className="relative pl-6 bg-purple-500/5">
      {/* Purple dot - consistent with user messages */}
      <div className="absolute -left-1 top-2.5 h-2 w-2 rounded-full bg-purple-500" />

      {/* Clickable header */}
      <div
        className="flex cursor-pointer items-center gap-2 py-1.5 pr-3 hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Wand2 className="h-3 w-3 shrink-0 text-purple-400" />
        <span className="text-xs text-neutral-300">
          Using{' '}
          <code className="rounded bg-purple-900/30 border border-purple-700/50 px-1 py-0.5 text-purple-200">
            {skillName}
          </code>
        </span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-neutral-500" />
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && promptText && (
        <div className="mb-2 ml-5 border-l border-neutral-700 pl-3 pr-3">
          <div className="max-h-96 overflow-auto rounded bg-black/30 p-3 text-xs text-neutral-300">
            <MarkdownContent
              content={promptText}
              onFilePathClick={onFilePathClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}
