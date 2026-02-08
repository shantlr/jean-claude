import { Bot, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';

import { formatModelName } from '@/hooks/use-model';
import type {
  NormalizedMessage,
  NormalizedToolUsePart,
  NormalizedToolResultPart,
} from '@shared/agent-backend-types';

import { TimelineEntry } from '../ui-timeline-entry';

import { getLastActivitySummary } from './last-activity';

/**
 * Build a map of toolId -> NormalizedToolResultPart from child messages
 */
function buildToolResultsMap(
  messages: NormalizedMessage[],
): Map<string, NormalizedToolResultPart> {
  const resultsMap = new Map<string, NormalizedToolResultPart>();

  for (const message of messages) {
    if (message.role === 'user') {
      const parts = message.parts;
      for (const part of parts) {
        if (part.type === 'tool-result') {
          resultsMap.set(part.toolId, part);
        }
      }
    }
  }

  return resultsMap;
}

/**
 * Build a map of toolId -> parent NormalizedMessage for user messages
 */
function buildParentMessageMap(
  messages: NormalizedMessage[],
): Map<string, NormalizedMessage> {
  const parentMap = new Map<string, NormalizedMessage>();

  for (const message of messages) {
    if (message.role === 'user') {
      const parts = message.parts;
      for (const part of parts) {
        if (part.type === 'tool-result') {
          parentMap.set(part.toolId, message);
        }
      }
    }
  }

  return parentMap;
}

/**
 * Filter messages for display in the nested timeline.
 * Excludes the initial user message (which is just the Task prompt).
 */
function filterDisplayMessages(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  // Skip the first user message (the Task prompt) as it's redundant with the header
  let skippedFirstUser = false;
  return messages.filter((message) => {
    if (!skippedFirstUser && message.role === 'user') {
      skippedFirstUser = true;
      return false;
    }
    return true;
  });
}

/**
 * Displays a grouped sub-agent (Task tool) as a single expandable entry.
 * Shows task description + last activity when collapsed,
 * full nested message timeline when expanded.
 */
export function SubagentEntry({
  launchBlock,
  childMessages,
  isComplete,
  onFilePathClick,
}: {
  launchBlock: NormalizedToolUsePart;
  childMessages: NormalizedMessage[];
  isComplete: boolean;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const input = (launchBlock.input ?? {}) as Record<string, unknown>;
  const description = input.description as string;
  const subagentType = input.subagent_type as string | undefined;

  // Get the model used by the sub-agent from child messages
  const subagentModel = useMemo(() => {
    for (let i = childMessages.length - 1; i >= 0; i--) {
      const m = childMessages[i];
      if (m.role === 'assistant' && m.model) {
        return m.model;
      }
    }
    return undefined;
  }, [childMessages]);

  // Get last activity from child messages
  const lastActivity = useMemo(
    () => getLastActivitySummary(childMessages),
    [childMessages],
  );

  // Build tool results map for nested timeline
  const toolResultsMap = useMemo(
    () => buildToolResultsMap(childMessages),
    [childMessages],
  );

  const parentMessageMap = useMemo(
    () => buildParentMessageMap(childMessages),
    [childMessages],
  );

  // Filter messages for display
  const displayMessages = useMemo(
    () => filterDisplayMessages(childMessages),
    [childMessages],
  );

  const isPending = !isComplete;

  // Determine dot color - cyan for sub-agents (distinct from blue tools, purple user/skills)
  const dotColor = isPending ? 'bg-cyan-500 animate-pulse' : 'bg-cyan-500';
  const bgClass = 'bg-cyan-500/5';

  return (
    <div className={`relative ${bgClass} pl-6`}>
      {/* Dot */}
      <div
        className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full ${dotColor}`}
      />

      {/* Clickable header */}
      <div
        className="flex cursor-pointer flex-col gap-0.5 py-1.5 pr-3 hover:bg-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Main row: icon + description + status */}
        <div className="flex items-center gap-2">
          <Bot className="h-3 w-3 shrink-0 text-cyan-400" />
          {isPending && (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin text-cyan-400"
              aria-hidden
            />
          )}
          <span className="text-xs text-neutral-300">
            <span className="font-medium text-cyan-300">{description}</span>
            {subagentType && (
              <span className="ml-1 text-neutral-500">({subagentType})</span>
            )}
            {subagentModel && (
              <span
                className="ml-2 font-mono text-neutral-500"
                title={subagentModel}
              >
                {formatModelName(subagentModel)}
              </span>
            )}
          </span>
          {isExpanded ? (
            <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-neutral-500" />
          ) : (
            <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-neutral-500" />
          )}
        </div>

        {/* Last activity preview (only when collapsed and has activity) */}
        {!isExpanded && lastActivity && (
          <div className="ml-5 text-xs text-neutral-500">{lastActivity}</div>
        )}
      </div>

      {/* Expanded nested timeline */}
      {isExpanded && displayMessages.length > 0 && (
        <div className="mb-2 ml-5 border-l border-neutral-700 pl-0">
          {displayMessages.map((message, index) => (
            <TimelineEntry
              key={index}
              message={message}
              toolResultsMap={toolResultsMap}
              parentMessageMap={parentMessageMap}
              onFilePathClick={onFilePathClick}
            />
          ))}
        </div>
      )}

      {/* Empty state when expanded but no messages yet */}
      {isExpanded && displayMessages.length === 0 && (
        <div className="mb-2 ml-5 border-l border-neutral-700 pl-3 text-xs text-neutral-500">
          Waiting for sub-agent activity...
        </div>
      )}
    </div>
  );
}
