import { Bot, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';

import { formatModelName } from '@/hooks/use-model';
import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

import { TimelineEntry } from '../ui-timeline-entry';

import { getLastActivitySummary } from './last-activity';

/**
 * Filter entries for display in the nested timeline.
 * Excludes the initial user prompt (which is just the Task prompt).
 */
function filterDisplayEntries(entries: NormalizedEntry[]): NormalizedEntry[] {
  let skippedFirstUser = false;
  return entries.filter((entry) => {
    if (!skippedFirstUser && entry.type === 'user-prompt') {
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
  toolUse,
  childEntries,
  onFilePathClick,
}: {
  toolUse: NormalizedToolUse;
  childEntries: NormalizedEntry[];
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const subAgent =
    toolUse.name === 'sub-agent'
      ? (toolUse as ToolUseByName<'sub-agent'>)
      : undefined;
  const description = subAgent?.input.description ?? '';
  const subagentType = subAgent?.input.agentType;
  const isComplete = !!toolUse.result;

  // Get the model used by the sub-agent from child entries
  const subagentModel = useMemo(() => {
    for (let i = childEntries.length - 1; i >= 0; i--) {
      const e = childEntries[i];
      if (e.model) {
        return e.model;
      }
    }
    return undefined;
  }, [childEntries]);

  // Get last activity from child entries
  const lastActivity = useMemo(
    () => getLastActivitySummary(childEntries),
    [childEntries],
  );

  // Filter entries for display
  const displayEntries = useMemo(
    () => filterDisplayEntries(childEntries),
    [childEntries],
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
      {isExpanded && displayEntries.length > 0 && (
        <div className="mb-2 ml-5 border-l border-neutral-700 pl-0">
          {displayEntries.map((entry, index) => (
            <TimelineEntry
              key={index}
              entry={entry}
              onFilePathClick={onFilePathClick}
            />
          ))}
        </div>
      )}

      {/* Empty state when expanded but no entries yet */}
      {isExpanded && displayEntries.length === 0 && (
        <div className="mb-2 ml-5 border-l border-neutral-700 pl-3 text-xs text-neutral-500">
          Waiting for sub-agent activity...
        </div>
      )}
    </div>
  );
}
