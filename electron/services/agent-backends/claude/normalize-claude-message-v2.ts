// Normalizer V2 for Claude Code Agent SDK messages → NormalizationEvent[].
//
// Emits flat NormalizedEntry events — one entry per content block.
// Tool results are matched to their pending tool-use entries via
// ctx.pendingToolUses and emitted as 'entry-update' events with properly
// typed results (via addResultToToolUse). Falls back to generic 'tool-result'
// events when no pending entry is found (e.g. resumed sessions).
//
// Context tracks session-id state and pending tool-use entries.
// Each raw SDK message is persisted independently by the backend (not here).

import { nanoid } from 'nanoid';

import type {
  AgentMessage,
  AssistantMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '@shared/agent-types';
import type {
  NormalizedEntry,
  NormalizedToolUse,
  NormalizationEvent,
} from '@shared/normalized-message-v2';

export type { NormalizationEvent };

// --- Exported types ---

export type NormalizationContext = {
  /** Set to true after session-id has been emitted — prevents duplicate events */
  sessionIdEmitted: boolean;
  /** Tracks tool-use entries awaiting their result, keyed by toolId */
  pendingToolUses: Map<string, NormalizedEntry>;
};

// --- Constants ---

const HIDDEN_SYSTEM_SUBTYPES = new Set([
  'init',
  'hook_started',
  'hook_completed',
  'hook_response',
]);

// --- Main normalization function ---

/**
 * Normalize a raw Claude Code SDK AgentMessage into NormalizationEvent[].
 *
 * Mutates ctx.pendingToolUses to track tool-use → result matching.
 * Handles entries, session-id extraction, and completion events.
 * Returns an empty array if the message should be filtered out.
 */
export function normalizeClaudeMessageV2(
  raw: AgentMessage,
  ctx: NormalizationContext,
): NormalizationEvent[] {
  // Filter hidden system subtypes
  if (
    raw.type === 'system' &&
    raw.subtype &&
    HIDDEN_SYSTEM_SUBTYPES.has(raw.subtype)
  ) {
    return [];
  }

  const events: NormalizationEvent[] = [];

  // Emit session-id from the first message that carries one
  if (!ctx.sessionIdEmitted && raw.session_id) {
    events.push({ type: 'session-id', sessionId: raw.session_id });
  }

  switch (raw.type) {
    case 'system':
      events.push(...normalizeSystemRaw(raw));
      break;
    case 'assistant':
      events.push(...normalizeAssistantRaw(raw, ctx));
      break;
    case 'user':
      events.push(...normalizeUserRaw(raw, ctx));
      break;
    case 'result':
      events.push(...normalizeResultRaw(raw));
      break;
  }

  return events;
}

// --- System messages ---

function normalizeSystemRaw(raw: AgentMessage): NormalizationEvent[] {
  if (raw.subtype === 'status' && raw.status === 'compacting') {
    return [
      {
        type: 'entry',
        entry: {
          id: nanoid(),
          date: new Date().toISOString(),
          type: 'system-status',
          status: 'compacting',
        },
      },
    ];
  }

  if (raw.subtype === 'compact_boundary') {
    return [
      {
        type: 'entry',
        entry: {
          id: nanoid(),
          date: new Date().toISOString(),
          type: 'system-status',
          status: null,
        },
      },
    ];
  }

  // Other system messages that weren't filtered — skip
  return [];
}

// --- Assistant messages ---

function normalizeAssistantRaw(
  raw: AgentMessage,
  ctx: NormalizationContext,
): NormalizationEvent[] {
  const msg = raw.message as AssistantMessage | undefined;
  if (!msg?.content) return [];

  const parentToolId = raw.parent_tool_use_id ?? undefined;
  const events: NormalizationEvent[] = [];

  for (const block of msg.content) {
    if (block.type === 'text') {
      const text = (block as TextBlock).text;
      if (text) {
        events.push({
          type: 'entry',
          entry: {
            id: nanoid(),
            date: new Date().toISOString(),
            model: msg.model,
            isSynthetic: raw.isSynthetic || undefined,
            parentToolId,
            type: 'assistant-message',
            value: text,
          },
        });
      }
    } else if (block.type === 'tool_use') {
      const toolUse = mapToolUseBlock(block as ToolUseBlock, parentToolId);
      const entry = {
        id: nanoid(),
        date: new Date().toISOString(),
        model: msg.model,
        isSynthetic: raw.isSynthetic || undefined,
        ...toolUse,
      } as NormalizedEntry;

      // Track tool-use entries so processToolResult can patch them with
      // properly typed results via addResultToToolUse
      ctx.pendingToolUses.set(toolUse.toolId, entry);

      events.push({ type: 'entry', entry });
    }
    // thinking/reasoning blocks — skip for now
    // tool_result blocks in assistant messages — unusual, skip
  }

  return events;
}

// --- User messages ---

function normalizeUserRaw(
  raw: AgentMessage,
  ctx: NormalizationContext,
): NormalizationEvent[] {
  const userMsg = raw.message as
    | { role: 'user'; content: string | ContentBlock[] }
    | undefined;
  if (!userMsg?.content) return [];

  const parentToolId = raw.parent_tool_use_id ?? undefined;

  // String content → user prompt
  if (typeof userMsg.content === 'string') {
    return [
      {
        type: 'entry',
        entry: {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: raw.isSynthetic || undefined,
          parentToolId,
          type: 'user-prompt',
          value: userMsg.content,
          isSDKSynthetic: raw.isSynthetic || undefined,
        },
      },
    ];
  }

  // Array content — process tool results, text as prompts
  const events: NormalizationEvent[] = [];
  const textParts: string[] = [];

  for (const block of userMsg.content) {
    if (block.type === 'tool_result') {
      const event = processToolResult(block as ToolResultBlock, raw, ctx);
      if (event) events.push(event);
    } else if (block.type === 'text') {
      const text = (block as TextBlock).text;
      if (text) textParts.push(text);
    }
  }

  // If there's text content alongside tool results, emit as user prompt
  if (textParts.length > 0) {
    events.push({
      type: 'entry',
      entry: {
        id: nanoid(),
        date: new Date().toISOString(),
        isSynthetic: raw.isSynthetic || undefined,
        parentToolId,
        type: 'user-prompt',
        value: textParts.join('\n'),
        isSDKSynthetic: raw.isSynthetic || undefined,
      },
    });
  }

  return events;
}

// --- Result messages ---

function normalizeResultRaw(raw: AgentMessage): NormalizationEvent[] {
  const usage = raw.usage
    ? {
        inputTokens: raw.usage.input_tokens ?? 0,
        outputTokens: raw.usage.output_tokens ?? 0,
        cacheReadTokens: raw.usage.cache_read_input_tokens,
        cacheCreationTokens: raw.usage.cache_creation_input_tokens,
      }
    : undefined;

  return [
    // The result entry for the UI
    {
      type: 'entry',
      entry: {
        id: nanoid(),
        date: new Date().toISOString(),
        type: 'result',
        value: raw.result ?? undefined,
        isError: raw.is_error ?? false,
        durationMs: raw.duration_ms,
        cost: raw.total_cost_usd ?? raw.cost_usd,
        usage,
      },
    },
    // The completion event for session lifecycle
    {
      type: 'complete',
      result: {
        isError: raw.is_error ?? false,
        text: raw.result ?? undefined,
        durationMs: raw.duration_ms,
        cost:
          raw.total_cost_usd != null || raw.cost_usd != null
            ? { costUsd: raw.total_cost_usd ?? raw.cost_usd ?? 0 }
            : undefined,
        usage,
      },
    },
  ];
}

// --- Tool result → entry-update (preferred) or tool-result (fallback) ---

function processToolResult(
  block: ToolResultBlock,
  raw: AgentMessage,
  ctx: NormalizationContext,
): NormalizationEvent | null {
  const toolId = block.tool_use_id;

  // If we have the pending tool-use entry, use addResultToToolUse to produce
  // a properly typed result and emit an entry-update instead of a generic
  // string-based tool-result.
  const pendingEntry = ctx.pendingToolUses.get(toolId);
  if (pendingEntry && pendingEntry.type === 'tool-use') {
    const updatedToolUse = addResultToToolUse(
      pendingEntry as unknown as NormalizedToolUse,
      block,
      raw,
    );
    ctx.pendingToolUses.delete(toolId);
    return {
      type: 'entry-update',
      entry: { ...pendingEntry, ...updatedToolUse } as NormalizedEntry,
    };
  }

  // Fallback: no pending entry found (e.g. resumed session) — emit generic
  // tool-result with string content, patched by the repo/store layer.
  const content =
    typeof block.content === 'string'
      ? block.content
      : stringifyContentBlocks(block.content);

  return {
    type: 'tool-result',
    toolId,
    result: content,
    isError: block.is_error ?? false,
  };
}

// --- Tool use block → NormalizedToolUse ---

export function mapToolUseBlock(
  block: ToolUseBlock,
  parentToolId: string | undefined,
): NormalizedToolUse {
  const toolId = block.id;
  const input = block.input;
  const base = { type: 'tool-use' as const, toolId, parentToolId };

  switch (block.name) {
    case 'Read':
      return {
        ...base,
        name: 'read',
        input: { filePath: str(input.file_path) },
      };

    case 'Write':
      return {
        ...base,
        name: 'write',
        input: { filePath: str(input.file_path), value: str(input.content) },
      };

    case 'Edit':
      return {
        ...base,
        name: 'edit',
        input: {
          filePath: str(input.file_path),
          oldString: str(input.old_string),
          newString: str(input.new_string),
        },
      };

    case 'Bash':
      return {
        ...base,
        name: 'bash',
        input: {
          command: str(input.command),
          description: input.description ? str(input.description) : undefined,
        },
      };

    case 'Glob':
      return { ...base, name: 'glob', input: { pattern: str(input.pattern) } };

    case 'Grep':
      return { ...base, name: 'grep', input: { pattern: str(input.pattern) } };

    case 'Task':
      return {
        ...base,
        name: 'sub-agent',
        input: {
          agentType: str(input.subagent_type),
          description: str(input.description),
          prompt: str(input.prompt),
        },
      };

    case 'AskUserQuestion':
      return {
        ...base,
        name: 'ask-user-question',
        input: { questions: extractQuestions(input) },
      };

    case 'TodoWrite':
      return {
        ...base,
        name: 'todo-write',
        input: { todos: extractTodos(input) },
      };

    case 'ExitPlanMode':
      return {
        ...base,
        name: 'exit-plan-mode',
        input: { plan: str(input.plan ?? '') },
      };

    case 'Skill':
      return {
        ...base,
        name: 'skill',
        skillName: str(input.skill),
        input: {},
      };

    case 'WebFetch':
      return {
        ...base,
        name: 'web-fetch',
        input: { url: str(input.url), prompt: str(input.prompt) },
      };

    case 'WebSearch':
      return {
        ...base,
        name: 'web-search',
        input: { query: str(input.query) },
      };

    default:
      // MCP tools have names like mcp__server__tool
      if (block.name.startsWith('mcp__')) {
        return {
          ...base,
          name: 'mcp',
          toolName: block.name,
          input: input as Record<string, unknown>,
        };
      }
      // Fallback for unknown tools
      return { ...base, name: block.name, input } as NormalizedToolUse;
  }
}

// --- Add result to an existing tool-use entry ---

export function addResultToToolUse(
  part: NormalizedToolUse,
  block: ToolResultBlock,
  raw: AgentMessage,
): NormalizedToolUse {
  const content =
    typeof block.content === 'string'
      ? block.content
      : stringifyContentBlocks(block.content);
  const tur = raw.tool_use_result as unknown;

  switch (part.name) {
    case 'read':
      return { ...part, result: content };

    case 'glob':
      return { ...part, result: content };

    case 'grep':
      return { ...part, result: content };

    case 'bash':
      return {
        ...part,
        result: { content, isError: block.is_error || undefined },
      };

    case 'write':
      return { ...part, result: { success: !block.is_error } };

    case 'edit':
      return { ...part, result: extractEditResult(tur) ?? { changes: [] } };

    case 'sub-agent':
      return { ...part, result: { output: content } };

    case 'ask-user-question':
      return {
        ...part,
        result: extractAskUserResult(tur) ?? { answers: [] },
      };

    case 'todo-write':
      return {
        ...part,
        result: extractTodoResult(tur) ?? { oldTodos: [], newTodos: [] },
      };

    case 'exit-plan-mode':
      return { ...part, result: { content } };

    case 'skill':
      return { ...part, result: {} };

    case 'web-fetch':
      return { ...part, result: extractWebFetchResult(content, tur) };

    case 'web-search':
      return { ...part, result: { content } };

    case 'mcp':
      return {
        ...part,
        result:
          (tryParseJson(content) as Record<string, unknown> | null) ??
          ({} as Record<string, unknown>),
      };

    default:
      return { ...part, result: content } as NormalizedToolUse;
  }
}

// --- Input extraction helpers ---

function extractQuestions(input: Record<string, unknown>): Array<{
  question: string;
  header: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description: string }>;
}> {
  const questions = input.questions;
  if (!Array.isArray(questions)) return [];
  return questions.map((q: unknown) => {
    const qObj = q as Record<string, unknown>;
    return {
      question: str(qObj.question),
      header: str(qObj.header),
      multiSelect: qObj.multiSelect === true ? true : undefined,
      options: Array.isArray(qObj.options)
        ? (qObj.options as unknown[]).map((o: unknown) => {
            const oObj = o as Record<string, unknown>;
            return {
              label: str(oObj.label),
              description: str(oObj.description),
            };
          })
        : [],
    };
  });
}

type TodoStatus = 'pending' | 'in_progress' | 'completed';

function extractTodos(input: Record<string, unknown>):
  | Array<{
      content: string;
      description?: string;
      status: TodoStatus;
    }>
  | undefined {
  const todos = input.todos;
  if (!Array.isArray(todos)) return undefined;
  return (todos as unknown[]).map(mapTodoItem);
}

// --- Result extraction helpers ---

function extractEditResult(tur: unknown):
  | {
      changes: Array<{ oldStart: number; newStart: number; lines: string[] }>;
    }
  | undefined {
  if (!isObj(tur)) return undefined;
  const patch = (tur as Record<string, unknown>).structuredPatch;
  if (!Array.isArray(patch)) return undefined;
  return {
    changes: (patch as unknown[]).map((hunk: unknown) => {
      const h = hunk as Record<string, unknown>;
      return {
        oldStart: Number(h.oldStart ?? 0),
        newStart: Number(h.newStart ?? 0),
        lines: Array.isArray(h.lines) ? (h.lines as unknown[]).map(String) : [],
      };
    }),
  };
}

function extractAskUserResult(tur: unknown):
  | {
      answers: Array<{ question: string; answer: string | string[] }>;
    }
  | undefined {
  if (!isObj(tur)) return undefined;
  const answers = (tur as Record<string, unknown>).answers;
  if (!isObj(answers)) return undefined;
  return {
    answers: Object.entries(answers as Record<string, unknown>).map(
      ([question, answer]) => ({
        question,
        answer: Array.isArray(answer)
          ? (answer as unknown[]).map(String)
          : str(answer),
      }),
    ),
  };
}

function extractTodoResult(tur: unknown):
  | {
      oldTodos: Array<{
        content: string;
        description?: string;
        status: TodoStatus;
      }>;
      newTodos: Array<{
        content: string;
        description?: string;
        status: TodoStatus;
      }>;
    }
  | undefined {
  if (!isObj(tur)) return undefined;
  const turObj = tur as Record<string, unknown>;
  const oldTodos = turObj.oldTodos ?? turObj.oldTods;
  const newTodos = turObj.newTodos;
  if (!Array.isArray(oldTodos) || !Array.isArray(newTodos)) return undefined;
  return {
    oldTodos: (oldTodos as unknown[]).map(mapTodoItem),
    newTodos: (newTodos as unknown[]).map(mapTodoItem),
  };
}

function extractWebFetchResult(
  content: string,
  tur: unknown,
): { content: string; code?: number } {
  const result: { content: string; code?: number } = { content };
  if (isObj(tur)) {
    const code = (tur as Record<string, unknown>).code;
    if (typeof code === 'number') result.code = code;
  }
  return result;
}

// --- Shared helpers ---

function mapTodoItem(t: unknown): {
  content: string;
  description?: string;
  status: TodoStatus;
} {
  const tObj = t as Record<string, unknown>;
  const statusStr = str(tObj.status);
  return {
    content: str(tObj.content),
    description: tObj.description
      ? str(tObj.description)
      : tObj.activeForm
        ? str(tObj.activeForm)
        : undefined,
    status: isValidTodoStatus(statusStr) ? statusStr : 'pending',
  };
}

function isValidTodoStatus(s: string): s is TodoStatus {
  return s === 'pending' || s === 'in_progress' || s === 'completed';
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function stringifyContentBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return (b as TextBlock).text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function tryParseJson(content: string): unknown | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // not JSON
  }
  return null;
}
