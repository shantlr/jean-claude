import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Generate a short summary for a tool use.
 */
function getToolActivitySummary(toolUse: NormalizedToolUse): string {
  switch (toolUse.name) {
    case 'read': {
      const t = toolUse as ToolUseByName<'read'>;
      return `Reading \`${extractFilename(t.input.filePath)}\``;
    }
    case 'write': {
      const t = toolUse as ToolUseByName<'write'>;
      return `Writing \`${extractFilename(t.input.filePath)}\``;
    }
    case 'edit': {
      const t = toolUse as ToolUseByName<'edit'>;
      return `Editing \`${extractFilename(t.input.filePath)}\``;
    }
    case 'bash': {
      const t = toolUse as ToolUseByName<'bash'>;
      const command = t.input.command;
      const preview = command.split('\n')[0].slice(0, 40);
      return `Running \`${preview}${command.length > 40 ? '...' : ''}\``;
    }
    case 'grep': {
      const t = toolUse as ToolUseByName<'grep'>;
      return `Searching for \`${t.input.pattern}\``;
    }
    case 'glob': {
      const t = toolUse as ToolUseByName<'glob'>;
      return `Finding files \`${t.input.pattern}\``;
    }
    case 'sub-agent': {
      const t = toolUse as ToolUseByName<'sub-agent'>;
      return `Sub-agent: ${t.input.description}`;
    }
    case 'web-fetch': {
      const t = toolUse as ToolUseByName<'web-fetch'>;
      try {
        const host = new URL(t.input.url).hostname;
        return `Fetching \`${host}\``;
      } catch {
        return 'Fetching URL';
      }
    }
    case 'web-search': {
      const t = toolUse as ToolUseByName<'web-search'>;
      return `Searching "${t.input.query?.slice(0, 30) || '...'}"`;
    }
    case 'todo-write': {
      return 'Updating todo list';
    }
    case 'mcp': {
      const t = toolUse as ToolUseByName<'mcp'>;
      return `Using \`${t.toolName}\``;
    }
    default: {
      return `Using \`${toolUse.name}\``;
    }
  }
}

/**
 * Get the last activity summary from sub-agent entries.
 * Looks for the most recent tool use or text content.
 */
export function getLastActivitySummary(
  entries: NormalizedEntry[],
): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'tool-use') {
      return getToolActivitySummary(entry);
    }
    if (entry.type === 'assistant-message' && entry.value.trim()) {
      const preview = entry.value.slice(0, 60);
      return preview.length < entry.value.length ? `${preview}...` : preview;
    }
    if (entry.type === 'result') {
      return entry.isError ? 'Completed with error' : 'Completed';
    }
  }
  return null;
}

/**
 * Extract todo progress from the most recent todo-write entry.
 * Returns the in-progress task label and completed/total counts.
 */
export function getTodoProgress(
  entries: NormalizedEntry[],
): { activeTask: string | null; completed: number; total: number } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== 'tool-use' || entry.name !== 'todo-write') continue;

    const todoEntry = entry as ToolUseByName<'todo-write'>;
    const todos = todoEntry.result?.newTodos ?? todoEntry.input.todos;
    if (!todos || todos.length === 0) continue;

    const completed = todos.filter((t) => t.status === 'completed').length;
    const inProgress = todos.find((t) => t.status === 'in_progress');
    // description carries activeForm from normalizer, fall back to content
    const activeTask = inProgress
      ? (inProgress.description ?? inProgress.content)
      : null;

    return { activeTask, completed, total: todos.length };
  }
  return null;
}
