// Normalizer for Claude Code Agent SDK messages → NormalizedMessage.
// This is the core mapping function used both by the Claude adapter at runtime
// and by the database migration to convert existing stored messages.

import { nanoid } from 'nanoid';

import type {
  NormalizedMessage,
  NormalizedPart,
  NormalizedToolResultPart,
  TokenUsage,
  NormalizedModelUsage,
  StructuredToolResult,
} from '@shared/agent-backend-types';
import type {
  AgentMessage,
  AssistantMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  CompactMetadata,
} from '@shared/agent-types';
import {
  isSkillToolUseResult,
  isTodoToolUseResult,
  isWriteToolUseResult,
} from '@shared/agent-types';

// --- Hidden subtypes that should not produce normalized messages ---

const HIDDEN_SYSTEM_SUBTYPES = new Set([
  'init',
  'hook_started',
  'hook_completed',
  'hook_response',
]);

// --- Main normalization function ---

/**
 * Normalize a raw Claude Code SDK AgentMessage into a NormalizedMessage.
 * Returns null if the message should be hidden (e.g., init, hook_* subtypes).
 */
export function normalizeClaudeMessage(
  raw: AgentMessage,
): NormalizedMessage | null {
  // Filter hidden system subtypes
  if (
    raw.type === 'system' &&
    raw.subtype &&
    HIDDEN_SYSTEM_SUBTYPES.has(raw.subtype)
  ) {
    // Exception: compacting-related status/compact_boundary are NOT hidden
    if (raw.subtype !== 'status' && raw.subtype !== 'compact_boundary') {
      return null;
    }
  }

  switch (raw.type) {
    case 'system':
      return normalizeSystemMessage(raw);
    case 'assistant':
      return normalizeAssistantMessage(raw);
    case 'user':
      return normalizeUserMessage(raw);
    case 'result':
      return normalizeResultMessage(raw);
    default:
      // Unknown message type — preserve as system with metadata
      return {
        id: nanoid(),
        role: 'system',
        parts: [
          {
            type: 'system-status',
            subtype: 'unknown',
            status: String((raw as AgentMessage).type),
          },
        ],
        timestamp: new Date().toISOString(),
        metadata: { raw },
      };
  }
}

// --- System messages ---

function normalizeSystemMessage(raw: AgentMessage): NormalizedMessage | null {
  const parts: NormalizedPart[] = [];

  // Compacting status message
  if (raw.subtype === 'status' && raw.status === 'compacting') {
    // This is the "start" of compaction — the UI pairs it with a compact_boundary.
    // We emit a system-status part so the merger can detect it.
    parts.push({
      type: 'system-status',
      subtype: 'status',
      status: 'compacting',
    });
  }
  // Compact boundary message (end of compaction)
  else if (raw.subtype === 'compact_boundary') {
    const meta = raw.compact_metadata as CompactMetadata | undefined;
    parts.push({
      type: 'compact',
      trigger: meta?.trigger ?? 'auto',
      preTokens: meta?.pre_tokens ?? 0,
    });
  }
  // Any other system message
  else {
    parts.push({
      type: 'system-status',
      subtype: raw.subtype ?? 'unknown',
      status: raw.status,
    });
  }

  return {
    id: nanoid(),
    role: 'system',
    parts,
    timestamp: new Date().toISOString(),
    metadata: buildMetadata(raw),
  };
}

// --- Assistant messages ---

function normalizeAssistantMessage(raw: AgentMessage): NormalizedMessage {
  const assistantMsg = raw.message as AssistantMessage | undefined;
  const parts: NormalizedPart[] = [];

  if (assistantMsg?.content) {
    for (const block of assistantMsg.content) {
      parts.push(normalizeContentBlock(block, raw));
    }
  }

  return {
    id: nanoid(),
    role: 'assistant',
    parts,
    timestamp: new Date().toISOString(),
    model: assistantMsg?.model,
    parentToolUseId: raw.parent_tool_use_id ?? undefined,
    isSynthetic: raw.isSynthetic,
    cost: raw.cost_usd != null ? { costUsd: raw.cost_usd } : undefined,
    usage: normalizeUsage(raw),
    metadata: buildMetadata(raw),
  };
}

// --- User messages ---

function normalizeUserMessage(raw: AgentMessage): NormalizedMessage {
  const userMsg = raw.message as
    | { role: 'user'; content: string | ContentBlock[] }
    | undefined;
  const parts: NormalizedPart[] = [];

  if (userMsg?.content) {
    if (typeof userMsg.content === 'string') {
      parts.push({ type: 'text', text: userMsg.content });
    } else {
      for (const block of userMsg.content) {
        parts.push(normalizeContentBlock(block, raw));
      }
    }
  }

  // Map tool_use_result to structured result on the corresponding tool-result part
  const structuredResult = normalizeToolUseResult(raw);

  // If we got a structured result but no tool-result part was in the content,
  // attach it to metadata so the merger can still detect skills
  const msg: NormalizedMessage = {
    id: nanoid(),
    role: 'user',
    parts,
    timestamp: new Date().toISOString(),
    parentToolUseId: raw.parent_tool_use_id ?? undefined,
    isSynthetic: raw.isSynthetic,
    metadata: {
      ...buildMetadata(raw),
      ...(structuredResult ? { structuredResult } : {}),
    },
  };

  return msg;
}

// --- Result messages ---

function normalizeResultMessage(raw: AgentMessage): NormalizedMessage {
  const parts: NormalizedPart[] = [];

  // Result text as a text part
  if (raw.result) {
    parts.push({ type: 'text', text: raw.result });
  }

  return {
    id: nanoid(),
    role: 'result',
    parts,
    timestamp: new Date().toISOString(),
    isError: raw.is_error,
    result: raw.result,
    durationMs: raw.duration_ms,
    cost: raw.cost_usd != null ? { costUsd: raw.cost_usd } : undefined,
    totalCost:
      raw.total_cost_usd != null ? { costUsd: raw.total_cost_usd } : undefined,
    usage: normalizeUsage(raw),
    modelUsage: normalizeModelUsage(raw),
    metadata: buildMetadata(raw),
  };
}

// --- Content block normalization ---

function normalizeContentBlock(
  block: ContentBlock,
  parentMessage: AgentMessage,
): NormalizedPart {
  switch (block.type) {
    case 'text':
      return normalizeTextBlock(block as TextBlock);
    case 'tool_use':
      return normalizeToolUseBlock(block as ToolUseBlock);
    case 'tool_result':
      return normalizeToolResultBlock(block as ToolResultBlock, parentMessage);
    default: {
      // Handle thinking blocks (not in our type system but SDK can emit them)
      const anyBlock = block as Record<string, unknown>;
      if (
        anyBlock.type === 'thinking' &&
        typeof anyBlock.thinking === 'string'
      ) {
        return { type: 'reasoning', text: anyBlock.thinking };
      }
      // Unknown block type — preserve as unknown part for debugging visibility
      return {
        type: 'unknown',
        originalType: String(anyBlock.type),
        data: block,
      };
    }
  }
}

function normalizeTextBlock(block: TextBlock): NormalizedPart {
  return { type: 'text', text: block.text };
}

function normalizeToolUseBlock(block: ToolUseBlock): NormalizedPart {
  return {
    type: 'tool-use',
    toolId: block.id,
    toolName: block.name,
    input: block.input,
  };
}

function normalizeToolResultBlock(
  block: ToolResultBlock,
  parentMessage: AgentMessage,
): NormalizedToolResultPart {
  // Try to get structured result from parent message's tool_use_result
  const structuredResult = normalizeToolUseResult(parentMessage);

  let content: string | NormalizedPart[];
  if (typeof block.content === 'string') {
    content = block.content;
  } else if (Array.isArray(block.content)) {
    content = block.content.map((b) => normalizeContentBlock(b, parentMessage));
  } else {
    content = '';
  }

  return {
    type: 'tool-result',
    toolId: block.tool_use_id,
    content,
    isError: block.is_error,
    structuredResult: structuredResult ?? undefined,
  };
}

// --- Structured tool result mapping ---

function normalizeToolUseResult(
  raw: AgentMessage,
): StructuredToolResult | null {
  if (!raw.tool_use_result) return null;

  if (isTodoToolUseResult(raw.tool_use_result)) {
    return {
      kind: 'todo',
      oldTodos: raw.tool_use_result.oldTodos,
      newTodos: raw.tool_use_result.newTodos,
    };
  }

  if (isWriteToolUseResult(raw.tool_use_result)) {
    return {
      kind: 'write',
      filePath: raw.tool_use_result.filePath,
      content: raw.tool_use_result.content,
      originalFile: raw.tool_use_result.originalFile,
      structuredPatch: raw.tool_use_result.structuredPatch,
    };
  }

  if (isSkillToolUseResult(raw.tool_use_result)) {
    return {
      kind: 'skill',
      success: raw.tool_use_result.success,
      commandName: raw.tool_use_result.commandName,
    };
  }

  return null;
}

// --- Usage normalization ---

function normalizeUsage(raw: AgentMessage): TokenUsage | undefined {
  if (!raw.usage) return undefined;

  return {
    inputTokens: raw.usage.input_tokens ?? 0,
    outputTokens: raw.usage.output_tokens ?? 0,
    cacheReadTokens: raw.usage.cache_read_input_tokens,
    cacheCreationTokens: raw.usage.cache_creation_input_tokens,
  };
}

function normalizeModelUsage(
  raw: AgentMessage,
): Record<string, NormalizedModelUsage> | undefined {
  if (!raw.modelUsage) return undefined;

  const result: Record<string, NormalizedModelUsage> = {};
  for (const [model, usage] of Object.entries(raw.modelUsage)) {
    result[model] = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      cacheCreationTokens: usage.cacheCreationInputTokens,
      contextWindow: usage.contextWindow,
      costUsd: usage.costUSD,
    };
  }
  return result;
}

// --- Metadata builder ---

/**
 * Build the opaque metadata bag from SDK-specific fields.
 * Only includes fields that aren't mapped to first-class normalized fields.
 */
function buildMetadata(raw: AgentMessage): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};

  if (raw.session_id) meta.session_id = raw.session_id;
  if (raw.subtype) meta.subtype = raw.subtype;
  if (raw.status) meta.status = raw.status;
  if (raw.duration_api_ms != null) meta.duration_api_ms = raw.duration_api_ms;
  if (raw.compact_metadata) meta.compact_metadata = raw.compact_metadata;
  if (raw.tool_use_result) meta.tool_use_result = raw.tool_use_result;

  // Preserve full usage breakdown in metadata for potential reprocessing
  if (raw.usage?.cache_creation) meta.cache_creation = raw.usage.cache_creation;
  if (raw.usage?.server_tool_use)
    meta.server_tool_use = raw.usage.server_tool_use;

  return Object.keys(meta).length > 0 ? meta : undefined;
}
