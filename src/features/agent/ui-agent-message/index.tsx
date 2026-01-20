import { User, Bot, Terminal } from 'lucide-react';

import type {
  AgentMessage as AgentMessageType,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../../../../shared/agent-types';
import { MarkdownContent } from '../ui-markdown-content';
import { ToolResultCard } from '../ui-tool-result-card';
import { ToolUseCard } from '../ui-tool-use-card';

interface AgentMessageProps {
  message: AgentMessageType;
  onFilePathClick?: (filePath: string, lineStart?: number, lineEnd?: number) => void;
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

function ContentBlockRenderer({
  block,
  onFilePathClick,
}: {
  block: ContentBlock;
  onFilePathClick?: AgentMessageProps['onFilePathClick'];
}) {
  if (isTextBlock(block)) {
    return <MarkdownContent content={block.text} onFilePathClick={onFilePathClick} />;
  }

  if (isToolUseBlock(block)) {
    return <ToolUseCard block={block} />;
  }

  if (isToolResultBlock(block)) {
    return <ToolResultCard block={block} />;
  }

  return null;
}

export function AgentMessage({ message, onFilePathClick }: AgentMessageProps) {
  // Skip system messages (they're internal)
  if (message.type === 'system') {
    return null;
  }

  // Result message - show summary
  if (message.type === 'result') {
    return (
      <div className="flex gap-3 px-4 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
          <Terminal className="h-4 w-4 text-neutral-300" />
        </div>
        <div className="flex-1 pt-1">
          <div className="mb-1 text-xs font-medium text-neutral-400">Session Complete</div>
          <div className="text-sm text-neutral-300">
            {message.result && (
              <MarkdownContent content={message.result} onFilePathClick={onFilePathClick} />
            )}
          </div>
          {message.cost_usd !== undefined && (
            <div className="mt-2 text-xs text-neutral-500">
              Cost: ${message.cost_usd.toFixed(4)}
              {message.duration_ms !== undefined && (
                <> | Duration: {(message.duration_ms / 1000).toFixed(1)}s</>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // User message
  if (message.type === 'user' && message.message) {
    const content = message.message.content;
    const textContent =
      typeof content === 'string'
        ? content
        : content
            .filter(isTextBlock)
            .map((b) => b.text)
            .join('\n');

    return (
      <div className="flex gap-3 bg-neutral-800/30 px-4 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
          <User className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 pt-1">
          <div className="mb-1 text-xs font-medium text-neutral-400">You</div>
          <div className="text-sm text-neutral-200">
            <MarkdownContent content={textContent} onFilePathClick={onFilePathClick} />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  if (message.type === 'assistant' && message.message) {
    const contentBlocks = message.message.content;

    return (
      <div className="flex gap-3 px-4 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-600">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 space-y-2 pt-1">
          <div className="mb-1 text-xs font-medium text-neutral-400">Claude</div>
          {contentBlocks.map((block, index) => (
            <ContentBlockRenderer
              key={index}
              block={block}
              onFilePathClick={onFilePathClick}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
