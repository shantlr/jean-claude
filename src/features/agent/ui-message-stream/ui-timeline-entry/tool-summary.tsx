import type {
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';

function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

export function getToolSummary(toolUse: NormalizedToolUse): string {
  const hasResult = toolUse.result !== undefined;

  switch (toolUse.name) {
    case 'read': {
      const t = toolUse as ToolUseByName<'read'>;
      const filename = extractFilename(t.input.filePath);
      if (hasResult && typeof t.result === 'string') {
        const lines = t.result.split('\n').length;
        return `Read \`${filename}\` (${lines} lines)`;
      }
      if (hasResult) return `Read \`${filename}\``;
      return `Reading \`${filename}\`...`;
    }

    case 'write': {
      const t = toolUse as ToolUseByName<'write'>;
      const filename = extractFilename(t.input.filePath);
      const lines = t.input.value?.split('\n').length || 0;
      if (hasResult) return `Created \`${filename}\` (${lines} lines)`;
      return `Creating \`${filename}\`...`;
    }

    case 'edit': {
      const t = toolUse as ToolUseByName<'edit'>;
      const filename = extractFilename(t.input.filePath);
      const oldLines = t.input.oldString.split('\n').length;
      const newLines = t.input.newString.split('\n').length;
      if (hasResult)
        return `Edited \`${filename}\` (+${newLines}/-${oldLines} lines)`;
      return `Editing \`${filename}\`...`;
    }

    case 'bash': {
      const t = toolUse as ToolUseByName<'bash'>;
      const command = t.input.command;
      const isMultiline = command.includes('\n');
      const preview = isMultiline
        ? command.split('\n')[0] + '\u21a9...'
        : command || 'command';
      const isError = t.result?.isError;
      if (isError) return `\`${preview}\` (error)`;
      if (hasResult) return `\`${preview}\``;
      return `\`${preview}\`...`;
    }

    case 'grep': {
      const t = toolUse as ToolUseByName<'grep'>;
      const pattern = t.input.pattern;
      if (hasResult && typeof t.result === 'string') {
        const matches = t.result.split('\n').filter((l) => l.trim()).length;
        return `Searched for \`${pattern}\` (${matches} matches)`;
      }
      if (hasResult) return `Searched for \`${pattern}\``;
      return `Searching for \`${pattern}\`...`;
    }

    case 'glob': {
      const t = toolUse as ToolUseByName<'glob'>;
      const pattern = t.input.pattern;
      if (hasResult && typeof t.result === 'string') {
        const files = t.result.split('\n').filter((l) => l.trim()).length;
        return `Found files \`${pattern}\` (${files} files)`;
      }
      if (hasResult) return `Found files \`${pattern}\``;
      return `Finding files \`${pattern}\`...`;
    }

    case 'sub-agent': {
      const t = toolUse as ToolUseByName<'sub-agent'>;
      return hasResult
        ? `Agent: ${t.input.description}`
        : `Agent: ${t.input.description}...`;
    }

    case 'web-fetch': {
      const t = toolUse as ToolUseByName<'web-fetch'>;
      try {
        const host = new URL(t.input.url).hostname;
        if (hasResult) return `Fetched \`${host}\``;
        return `Fetching \`${host}\`...`;
      } catch {
        if (hasResult) return 'Fetched URL';
        return 'Fetching URL...';
      }
    }

    case 'web-search': {
      const t = toolUse as ToolUseByName<'web-search'>;
      const preview = t.input.query?.slice(0, 30) || 'query';
      if (hasResult) return `Searched "${preview}"`;
      return `Searching "${preview}"...`;
    }

    case 'todo-write': {
      const t = toolUse as ToolUseByName<'todo-write'>;
      const todos = t.input.todos;
      if (todos) {
        const completed = todos.filter(
          (item) => item.status === 'completed',
        ).length;
        if (hasResult)
          return `Updated todo list (${completed}/${todos.length} completed)`;
        return `Updating todo list (${todos.length} items)...`;
      }
      if (hasResult) return 'Updated todo list';
      return 'Updating todo list...';
    }

    case 'ask-user-question':
      return hasResult ? 'Asked question' : 'Asking question...';

    case 'skill': {
      const t = toolUse as ToolUseByName<'skill'>;
      if (hasResult) return `Skill \`${t.skillName}\``;
      return `Skill \`${t.skillName}\`...`;
    }

    case 'exit-plan-mode':
      return hasResult ? 'Exited plan mode' : 'Exiting plan mode...';

    default: {
      if (hasResult) return `Used \`${toolUse.name}\``;
      return `Using \`${toolUse.name}\`...`;
    }
  }
}
