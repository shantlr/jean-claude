import type {
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
} from '../../../../shared/agent-types';

function getResultLineCount(content: string | ContentBlock[]): number {
  const text =
    typeof content === 'string'
      ? content
      : content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
  return text.split('\n').length;
}

function getResultMatchCount(content: string | ContentBlock[]): number | null {
  const text = typeof content === 'string' ? content : null;
  if (!text) return null;
  // Count non-empty lines as matches for grep/glob results
  return text.split('\n').filter((line) => line.trim()).length;
}

function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

export function getToolSummary(
  block: ToolUseBlock,
  result?: ToolResultBlock,
): string {
  const input = block.input;
  const hasResult = !!result;
  const isError = result?.is_error;

  switch (block.name) {
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
      if (isError) return `Used \`${block.name}\` (error)`;
      if (hasResult) return `Used \`${block.name}\``;
      return `Using \`${block.name}\`...`;
    }
  }
}
