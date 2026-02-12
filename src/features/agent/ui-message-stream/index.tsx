import {
  memo,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
} from 'react';

import type {
  NormalizedMessage,
  NormalizedToolResultPart,
} from '@shared/agent-backend-types';
import type { QueuedPrompt } from '@shared/agent-types';

import { QueuedPromptEntry } from '../ui-queued-prompt-entry';
import { SkillEntry } from '../ui-skill-entry';
import { SubagentEntry } from '../ui-subagent-entry';
import { TimelineEntry, CompactingEntry } from '../ui-timeline-entry';

import { mergeSkillMessages } from './message-merger';

// Build a map of toolId -> NormalizedToolResultPart from all user messages
function buildToolResultsMap(
  messages: NormalizedMessage[],
): Map<string, NormalizedToolResultPart> {
  const resultsMap = new Map<string, NormalizedToolResultPart>();

  for (const message of messages) {
    if (message.role === 'user') {
      for (const part of message.parts) {
        if (part.type === 'tool-result') {
          resultsMap.set(part.toolId, part);
        }
      }
    }
  }

  return resultsMap;
}

// Build a map of toolId -> parent NormalizedMessage for user messages
// This gives ToolEntry access to the parent message's structuredResult
function buildParentMessageMap(
  messages: NormalizedMessage[],
): Map<string, NormalizedMessage> {
  const parentMap = new Map<string, NormalizedMessage>();

  for (const message of messages) {
    if (message.role === 'user') {
      for (const part of message.parts) {
        if (part.type === 'tool-result') {
          parentMap.set(part.toolId, message);
        }
      }
    }
  }

  return parentMap;
}

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export const MessageStream = memo(function MessageStream({
  messages,
  isRunning,
  queuedPrompts = [],
  onFilePathClick,
  onCancelQueuedPrompt,
}: {
  messages: NormalizedMessage[];
  isRunning?: boolean;
  queuedPrompts?: QueuedPrompt[];
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onCancelQueuedPrompt?: (promptId: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Build tool results map once when messages change
  const toolResultsMap = useMemo(
    () => buildToolResultsMap(messages),
    [messages],
  );

  // Build parent message map for toolId -> parent NormalizedMessage
  const parentMessageMap = useMemo(
    () => buildParentMessageMap(messages),
    [messages],
  );

  // Merge skill messages for display
  const displayMessages = useMemo(
    () => mergeSkillMessages(messages),
    [messages],
  );

  // Check if scroll position is near bottom
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= SCROLL_THRESHOLD;
  }, []);

  // Update near-bottom state on scroll
  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
  }, [checkIfNearBottom]);

  // Initial scroll to bottom
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    isNearBottomRef.current = true;
  }, []);

  // Auto-scroll to bottom when new messages arrive or prompts are queued, but only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [displayMessages.length, queuedPrompts.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        <p>Agent session will appear here</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
    >
      {/* Timeline vertical line */}
      <div className="relative ml-3 border-l border-neutral-700">
        {displayMessages.map((displayMessage, index) => {
          if (displayMessage.kind === 'skill') {
            return (
              <SkillEntry
                key={index}
                skillName={displayMessage.skillName}
                promptMessage={displayMessage.promptMessage}
                onFilePathClick={onFilePathClick}
              />
            );
          }
          if (displayMessage.kind === 'compacting') {
            return (
              <CompactingEntry
                key={index}
                isComplete={!!displayMessage.endMessage}
                metadata={displayMessage.metadata}
              />
            );
          }
          if (displayMessage.kind === 'subagent') {
            return (
              <SubagentEntry
                key={index}
                launchBlock={displayMessage.launchBlock}
                childMessages={displayMessage.childMessages}
                isComplete={displayMessage.isComplete}
                onFilePathClick={onFilePathClick}
              />
            );
          }
          return (
            <TimelineEntry
              key={index}
              message={displayMessage.message}
              toolResultsMap={toolResultsMap}
              parentMessageMap={parentMessageMap}
              onFilePathClick={onFilePathClick}
            />
          );
        })}
        {isRunning && (
          <div className="relative py-1.5 pl-6">
            <div className="absolute top-2.5 -left-1 h-2 w-2 animate-pulse rounded-full bg-purple-500" />
            <span className="text-xs text-neutral-500">Working...</span>
          </div>
        )}
        {/* Queued prompts */}
        {queuedPrompts.map((prompt) => (
          <QueuedPromptEntry
            key={prompt.id}
            prompt={prompt}
            onCancel={onCancelQueuedPrompt ?? (() => {})}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
