import { useEffect, useRef } from 'react';

import type { AgentMessage as AgentMessageType } from '../../../../shared/agent-types';
import { AgentMessage } from '../ui-agent-message';

interface MessageStreamProps {
  messages: AgentMessageType[];
  onFilePathClick?: (filePath: string, lineStart?: number, lineEnd?: number) => void;
}

export function MessageStream({ messages, onFilePathClick }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        <p>Agent session will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-neutral-800">
      {messages.map((message, index) => (
        <AgentMessage
          key={index}
          message={message}
          onFilePathClick={onFilePathClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
