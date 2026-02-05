import type {
  AgentMessage,
  ToolUseBlock,
  TextBlock,
  ContentBlock,
} from '../../../../shared/agent-types';

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Generate a short summary for a tool use.
 */
function getToolActivitySummary(block: ToolUseBlock): string {
  const input = block.input;

  switch (block.name) {
    case 'Read': {
      const filePath = input.file_path as string;
      return `Reading \`${extractFilename(filePath)}\``;
    }
    case 'Write': {
      const filePath = input.file_path as string;
      return `Writing \`${extractFilename(filePath)}\``;
    }
    case 'Edit': {
      const filePath = input.file_path as string;
      return `Editing \`${extractFilename(filePath)}\``;
    }
    case 'Bash': {
      const command = input.command as string;
      const preview = command.split('\n')[0].slice(0, 40);
      return `Running \`${preview}${command.length > 40 ? '...' : ''}\``;
    }
    case 'Grep': {
      const pattern = input.pattern as string;
      return `Searching for \`${pattern}\``;
    }
    case 'Glob': {
      const pattern = input.pattern as string;
      return `Finding files \`${pattern}\``;
    }
    case 'Task': {
      const description = input.description as string;
      return `Sub-agent: ${description}`;
    }
    case 'WebFetch': {
      const url = input.url as string;
      try {
        const host = new URL(url).hostname;
        return `Fetching \`${host}\``;
      } catch {
        return 'Fetching URL';
      }
    }
    case 'WebSearch': {
      const query = input.query as string;
      return `Searching "${query?.slice(0, 30) || '...'}"`;
    }
    case 'TodoWrite': {
      return 'Updating todo list';
    }
    default: {
      // Handle MCP tools (prefixed with mcp__)
      if (block.name.startsWith('mcp__')) {
        const parts = block.name.split('__');
        const toolName = parts[parts.length - 1];
        return `Using \`${toolName}\``;
      }
      return `Using \`${block.name}\``;
    }
  }
}

/**
 * Get the last activity summary from sub-agent messages.
 * Looks for the most recent tool use or text content.
 */
export function getLastActivitySummary(
  messages: AgentMessage[],
): string | null {
  // Iterate from the end to find the most recent activity
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    // Check assistant messages for tool use or thinking
    if (
      message.type === 'assistant' &&
      message.message &&
      message.message.role === 'assistant'
    ) {
      const content = message.message.content;

      // Find the last tool use in this message
      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j];
        if (isToolUseBlock(block)) {
          return getToolActivitySummary(block);
        }
      }

      // If no tool use, check for text (thinking)
      const lastText = content
        .filter(isTextBlock)
        .map((b) => b.text.trim())
        .filter(Boolean)
        .pop();

      if (lastText) {
        // Truncate long text
        const preview = lastText.slice(0, 60);
        return preview.length < lastText.length ? `${preview}...` : preview;
      }
    }

    // Check result messages
    if (message.type === 'result') {
      if (message.is_error) {
        return 'Completed with error';
      }
      return 'Completed';
    }
  }

  return null;
}
