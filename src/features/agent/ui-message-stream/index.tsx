import { Loader2 } from 'lucide-react';
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
} from '../../../../shared/agent-types';
import { AgentMessage } from '../ui-agent-message';

interface MessageStreamProps {
  messages: AgentMessageType[];
  isRunning?: boolean;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}

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

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export function MessageStream({
  messages,
  isRunning,
  onFilePathClick,
}: MessageStreamProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Build tool results map once when messages change
  const toolResultsMap = useMemo(
    () => buildToolResultsMap(messages),
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
  }, [messages.length]);

  console.log({
    messages,
  });

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
      <div className="flex flex-col divide-y divide-neutral-800">
        {messages.map((message, index) => (
          <AgentMessage
            key={index}
            message={message}
            toolResultsMap={toolResultsMap}
            onFilePathClick={onFilePathClick}
          />
        ))}
        {isRunning && (
          <div className="flex items-center gap-2 px-6 py-4 text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Agent is working...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
