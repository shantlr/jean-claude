import type {
  NormalizedToolUsePart,
  NormalizedToolResultPart,
} from '@shared/agent-backend-types';

function getResultLineCount(content: string | unknown[]): number {
  if (typeof content === 'string') {
    return content.split('\n').length;
  }
  // NormalizedPart[] — extract text parts
  const text = (content as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
  return text.split('\n').length;
}

function getResultMatchCount(content: string | unknown[]): number | null {
  if (typeof content !== 'string') return null;
  // Count non-empty lines as matches for grep/glob results
  return content.split('\n').filter((line) => line.trim()).length;
}

function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

export function getToolSummary(
  block: NormalizedToolUsePart,
  result?: NormalizedToolResultPart,
): string {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const hasResult = !!result;
  const isError = result?.isError;

  switch (block.toolName) {
    case 'Read': {
      const filePath = input.file_path as string;
      const filename = extractFilename(filePath);
      if (isError) return `Read \`${filename}\` (error)`;
      if (hasResult) {
        const lines = getResultLineCount(result.content);
        return `Read \`${filename}\` (${lines} lines)`;
      }
      return `Reading \`${filename}\`...`;
    }

    case 'Write': {
      const filePath = input.file_path as string;
      const filename = extractFilename(filePath);
      const content = input.content as string;
      const lines = content?.split('\n').length || 0;
      if (isError) return `Created \`${filename}\` (error)`;
      if (hasResult) return `Created \`${filename}\` (${lines} lines)`;
      return `Creating \`${filename}\`...`;
    }

    case 'Edit': {
      const filePath = input.file_path as string;
      const filename = extractFilename(filePath);
      const oldStr = (input.old_string as string) || '';
      const newStr = (input.new_string as string) || '';
      const oldLines = oldStr.split('\n').length;
      const newLines = newStr.split('\n').length;
      const diff = `+${newLines}/-${oldLines}`;
      if (isError) return `Edited \`${filename}\` (error)`;
      if (hasResult) return `Edited \`${filename}\` (${diff} lines)`;
      return `Editing \`${filename}\`...`;
    }

    case 'Bash': {
      const command = input.command as string;
      const isMultiline = command.includes('\n');
      const preview = isMultiline
        ? command.split('\n')[0] + '↩...'
        : command || 'command';
      if (isError) return `\`${preview}\` (error)`;
      if (hasResult) return `\`${preview}\``;
      return `\`${preview}\`...`;
    }

    case 'Grep': {
      const pattern = input.pattern as string;
      if (isError) return `Searched for \`${pattern}\` (error)`;
      if (hasResult) {
        const matches = getResultMatchCount(result.content);
        return matches !== null
          ? `Searched for \`${pattern}\` (${matches} matches)`
          : `Searched for \`${pattern}\``;
      }
      return `Searching for \`${pattern}\`...`;
    }

    case 'Glob': {
      const pattern = input.pattern as string;
      if (isError) return `Found files \`${pattern}\` (error)`;
      if (hasResult) {
        const matches = getResultMatchCount(result.content);
        return matches !== null
          ? `Found files \`${pattern}\` (${matches} files)`
          : `Found files \`${pattern}\``;
      }
      return `Finding files \`${pattern}\`...`;
    }

    case 'Task': {
      const description = input.description as string;
      if (isError) return `Agent: ${description} (error)`;
      if (hasResult) return `Agent: ${description}`;
      return `Agent: ${description}...`;
    }

    case 'WebFetch': {
      const url = input.url as string;
      const host = url ? new URL(url).hostname : 'url';
      if (isError) return `Fetched \`${host}\` (error)`;
      if (hasResult) return `Fetched \`${host}\``;
      return `Fetching \`${host}\`...`;
    }

    case 'WebSearch': {
      const query = input.query as string;
      const preview = query?.slice(0, 30) || 'query';
      if (isError) return `Searched "${preview}" (error)`;
      if (hasResult) return `Searched "${preview}"`;
      return `Searching "${preview}"...`;
    }

    case 'TodoWrite': {
      const todos = input.todos as Array<{ status: string }> | undefined;
      if (todos) {
        const completed = todos.filter((t) => t.status === 'completed').length;
        if (hasResult)
          return `Updated todo list (${completed}/${todos.length} completed)`;
        return `Updating todo list (${todos.length} items)...`;
      }
      if (hasResult) return 'Updated todo list';
      return 'Updating todo list...';
    }

    case 'AskUserQuestion': {
      if (hasResult) return 'Asked question';
      return 'Asking question...';
    }

    case 'Skill': {
      const skillName = input.skill as string;
      if (isError) return `Skill \`${skillName}\` (error)`;
      if (hasResult) return `Skill \`${skillName}\``;
      return `Skill \`${skillName}\`...`;
    }

    default: {
      if (isError) return `Used \`${block.toolName}\` (error)`;
      if (hasResult) return `Used \`${block.toolName}\``;
      return `Using \`${block.toolName}\`...`;
    }
  }
}
