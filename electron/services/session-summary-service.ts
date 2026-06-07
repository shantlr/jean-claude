import type { AgentBackendType } from '@shared/agent-backend-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import type { ModelPreference } from '@shared/types';

import { generateText } from './ai-generation-service';
import {
  SESSION_SUMMARY_PROMPT,
  SESSION_SUMMARY_SCHEMA,
} from './session-summary-prompt';

const MAX_TRANSCRIPT_CHARS = 60_000;
const MAX_TOOL_RESULT_CHARS = 4_000;

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const keep = Math.floor((maxLength - 20) / 2);
  return `${value.slice(0, keep)}\n...[truncated]...\n${value.slice(-keep)}`;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatToolEntry(
  entry: Extract<NormalizedEntry, { type: 'tool-use' }>,
) {
  const lines = [`Tool: ${entry.name}`];

  if ('input' in entry && entry.input !== undefined) {
    lines.push(`Input: ${truncateMiddle(stringifyUnknown(entry.input), 1200)}`);
  }
  if ('filePath' in entry && typeof entry.filePath === 'string') {
    lines.push(`File: ${entry.filePath}`);
  }
  if ('toolName' in entry && typeof entry.toolName === 'string') {
    lines.push(`MCP tool: ${entry.toolName}`);
  }
  if ('result' in entry && entry.result !== undefined) {
    lines.push(
      `Result: ${truncateMiddle(stringifyUnknown(entry.result), MAX_TOOL_RESULT_CHARS)}`,
    );
  }

  return lines.join('\n');
}

function formatEntry(entry: NormalizedEntry): string | null {
  switch (entry.type) {
    case 'user-prompt':
      return `User:\n${entry.value}`;
    case 'assistant-message':
      return `Assistant:\n${entry.value}`;
    case 'thinking':
      return `Thinking:\n${entry.value}`;
    case 'todo-update':
      return `Todos updated:\n${stringifyUnknown(entry.newTodos)}`;
    case 'file-edited':
      return `File edited: ${entry.filePath}`;
    case 'session-summary':
    case 'system-status':
      return null;
    case 'result':
      return entry.value ? `Result:\n${entry.value}` : null;
    case 'tool-use':
      return formatToolEntry(entry);
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

function formatMessagesForSummary(messages: NormalizedEntry[]): string {
  const transcript = messages
    .map(formatEntry)
    .filter((entry): entry is string => Boolean(entry?.trim()))
    .join('\n\n---\n\n');

  return truncateMiddle(transcript, MAX_TRANSCRIPT_CHARS);
}

export async function summarizeNormalizedMessages({
  backend,
  model,
  messages,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  messages: NormalizedEntry[];
}): Promise<string> {
  const transcript = formatMessagesForSummary(messages);
  if (!transcript) {
    throw new Error('Cannot summarize empty message history');
  }

  const result = await generateText({
    backend,
    model,
    outputSchema: SESSION_SUMMARY_SCHEMA,
    prompt: `${SESSION_SUMMARY_PROMPT}\n\nPrior step normalized message history:\n\n${transcript}`,
  });

  if (
    result &&
    typeof result === 'object' &&
    typeof (result as { summary?: unknown }).summary === 'string'
  ) {
    const summary = (result as { summary: string }).summary.trim();
    if (summary) return summary;
  }

  if (typeof result === 'string') {
    const summary = result.trim();
    if (summary) return summary;
  }

  throw new Error('Failed to generate summary from normalized messages');
}
