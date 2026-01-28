import {
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
} from 'react';

import type {
  AgentMessage as AgentMessageType,
  ToolResultBlock,
  QueuedPrompt,
} from '../../../../shared/agent-types';
import { QueuedPromptEntry } from '../ui-queued-prompt-entry';
import { SkillEntry } from '../ui-skill-entry';
import { TimelineEntry, CompactingEntry } from '../ui-timeline-entry';

import { mergeSkillMessages } from './message-merger';

// Build a map of tool_use_id -> ToolResultBlock from all user messages
function buildToolResultsMap(
  messages: AgentMessageType[],
): Map<string, ToolResultBlock> {
  const resultsMap = new Map<string, ToolResultBlock>();

  for (const message of messages) {
    if (message.type === 'user' && message.message) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            resultsMap.set(block.tool_use_id, block);
          }
        }
      }
    }
  }

  return resultsMap;
}

// Build a map of tool_use_id -> parent AgentMessage for user messages
// This gives ToolEntry access to the parent message's tool_use_result field
function buildParentMessageMap(
  messages: AgentMessageType[],
): Map<string, AgentMessageType> {
  const parentMap = new Map<string, AgentMessageType>();

  for (const message of messages) {
    if (message.type === 'user' && message.message) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            parentMap.set(block.tool_use_id, message);
          }
        }
      }
    }
  }

  return parentMap;
}

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export function MessageStream({
  messages,
  isRunning,
  queuedPrompts = [],
  onFilePathClick,
  onCancelQueuedPrompt,
}: {
  messages: AgentMessageType[];
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

  // Build parent message map for tool_use_id -> parent AgentMessage
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

  // Auto-scroll to bottom when new messages arrive, but only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [displayMessages.length]);

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
          <div className="relative pl-6 py-1.5">
            <div className="absolute -left-1 top-2.5 h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
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
}
