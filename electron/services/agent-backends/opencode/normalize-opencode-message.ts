// Normalizer for OpenCode SDK messages → NormalizedMessage.
// Converts OpenCode's Message + Part[] into the common NormalizedMessage format.
//
// OpenCode messages differ from Claude in several key ways:
// - Messages and parts are separate entities (parts have their own IDs)
// - Tool execution states are tracked on ToolPart (pending → running → completed → error)
// - Assistant messages carry cost/token info directly
// - There's no explicit "result" message type — adapter synthesizes one

import type {
  AssistantMessage,
  UserMessage,
  Part,
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  CompactionPart,
  RetryPart,
} from '@opencode-ai/sdk';
import { nanoid } from 'nanoid';

import type {
  NormalizedMessage,
  NormalizedPart,
  TokenUsage,
} from '@shared/agent-backend-types';

// --- Main normalization: message + its parts ---

/**
 * Normalize an OpenCode message (with its parts) into a NormalizedMessage.
 * OpenCode separates message metadata from parts, so both are required.
 *
 * @param message - The OpenCode Message object (UserMessage | AssistantMessage)
 * @param parts - The parts belonging to this message
 */
export function normalizeOpencodeMessage(
  message: UserMessage | AssistantMessage,
  parts: Part[],
): NormalizedMessage {
  if (message.role === 'user') {
    return normalizeUserMessage(message, parts);
  }
  return normalizeAssistantMessage(message, parts);
}

// --- User messages ---

function normalizeUserMessage(
  message: UserMessage,
  parts: Part[],
): NormalizedMessage {
  const normalizedParts: NormalizedPart[] = [];

  for (const part of parts) {
    const normalized = normalizePart(part);
    if (normalized) {
      normalizedParts.push(normalized);
    }
  }

  return {
    id: message.id,
    role: 'user',
    parts: normalizedParts,
    timestamp: new Date(message.time.created * 1000).toISOString(),
    model: `${message.model.providerID}/${message.model.modelID}`,
    metadata: {
      agent: message.agent,
      system: message.system,
    },
  };
}

// --- Assistant messages ---

function normalizeAssistantMessage(
  message: AssistantMessage,
  parts: Part[],
): NormalizedMessage {
  const normalizedParts: NormalizedPart[] = [];

  for (const part of parts) {
    const normalized = normalizePart(part);
    if (normalized) {
      normalizedParts.push(normalized);
    }
  }

  return {
    id: message.id,
    role: 'assistant',
    parts: normalizedParts,
    timestamp: new Date(message.time.created * 1000).toISOString(),
    model: `${message.providerID}/${message.modelID}`,
    parentToolUseId: message.parentID || undefined,
    cost:
      message.cost != null && message.cost > 0
        ? { costUsd: message.cost }
        : undefined,
    usage: normalizeTokens(message),
    metadata: {
      finish: message.finish,
      mode: message.mode,
      path: message.path,
      ...(message.error ? { error: message.error } : {}),
    },
  };
}

// --- Synthesize a result message ---

/**
 * Synthesize a NormalizedMessage with role='result' from session completion data.
 * OpenCode doesn't emit a distinct result message like Claude does,
 * so the adapter calls this when the session goes idle or is aborted.
 */
export function synthesizeResultMessage({
  isError,
  text,
  durationMs,
  totalCost,
  usage,
}: {
  isError: boolean;
  text?: string;
  durationMs?: number;
  totalCost?: number;
  usage?: TokenUsage;
}): NormalizedMessage {
  const parts: NormalizedPart[] = [];
  if (text) {
    parts.push({ type: 'text', text });
  }

  return {
    id: nanoid(),
    role: 'result',
    parts,
    timestamp: new Date().toISOString(),
    isError,
    result: text,
    durationMs,
    totalCost: totalCost != null ? { costUsd: totalCost } : undefined,
    usage,
  };
}

// --- Part normalization ---

function normalizePart(part: Part): NormalizedPart | null {
  switch (part.type) {
    case 'text':
      return normalizeTextPart(part as TextPart);
    case 'reasoning':
      return normalizeReasoningPart(part as ReasoningPart);
    case 'file':
      return normalizeFilePart(part as FilePart);
    case 'tool':
      return normalizeToolPart(part as ToolPart);
    case 'compaction':
      return normalizeCompactionPart(part as CompactionPart);
    case 'retry':
      return normalizeRetryPart(part as RetryPart);
    case 'subtask':
      return normalizeSubtaskPart(
        part as Part & {
          prompt: string;
          description: string;
          agent: string;
        },
      );
    case 'step-start':
    case 'step-finish':
      // Step boundaries carry per-step cost/token info that's already present
      // on the AssistantMessage itself. Not displayed directly.
      return null;
    case 'snapshot':
    case 'patch':
      // Internal state management — serialized execution snapshots and
      // file change hashes. Not user-visible content.
      return null;
    case 'agent':
      // Agent identity marker (e.g. "plan", "build", "explore").
      // Preserved in rawData; the agent name is also on the message metadata.
      return null;
    default:
      // Unknown part type — preserve for debugging visibility
      return {
        type: 'unknown',
        originalType: String((part as { type: string }).type),
        data: part,
      };
  }
}

function normalizeTextPart(part: TextPart): NormalizedPart {
  return { type: 'text', text: part.text };
}

function normalizeReasoningPart(part: ReasoningPart): NormalizedPart {
  return { type: 'reasoning', text: part.text };
}

function normalizeFilePart(part: FilePart): NormalizedPart {
  return {
    type: 'file',
    path: part.url,
    mime: part.mime,
  };
}

/**
 * Normalize an OpenCode ToolPart based on its current state.
 *
 * OpenCode tracks tool lifecycle on a single ToolPart object:
 * - pending: tool invocation requested
 * - running: tool execution started
 * - completed: tool finished with result
 * - error: tool failed
 *
 * We map this to tool-use (for pending/running) or tool-result (for completed/error).
 */
function normalizeToolPart(part: ToolPart): NormalizedPart {
  const state = part.state;
  if (!state) {
    return {
      type: 'unknown',
      originalType: `tool:${part.tool}`,
      data: part,
    };
  }

  switch (state.status) {
    case 'pending':
      return {
        type: 'tool-use',
        toolId: part.callID,
        toolName: part.tool,
        input: state.input,
      };
    case 'running':
      return {
        type: 'tool-use',
        toolId: part.callID,
        toolName: part.tool,
        input: state.input,
      };
    case 'completed':
      return {
        type: 'tool-result',
        toolId: part.callID,
        content: state.output ?? '',
        title: state.title,
        attachments: state.attachments,
        isError: false,
      };
    case 'error':
      return {
        type: 'tool-result',
        toolId: part.callID,
        content: state.error ?? 'Unknown error',
        isError: true,
      };
    default:
      return {
        type: 'unknown',
        originalType: `tool:${part.tool}:${String((state as { status: string }).status)}`,
        data: part,
      };
  }
}

function normalizeCompactionPart(part: CompactionPart): NormalizedPart {
  return {
    type: 'compact',
    trigger: part.auto ? 'auto' : 'manual',
    preTokens: 0, // OpenCode doesn't provide pre-compaction token count
  };
}

/**
 * Retry parts tell the user the agent is retrying after an API error.
 * Map to system-status so the UI can display a retry indicator.
 */
function normalizeRetryPart(part: RetryPart): NormalizedPart {
  return {
    type: 'system-status',
    subtype: 'retry',
    status: `Retry attempt ${part.attempt}: ${part.error?.data?.message ?? 'API error'}`,
  };
}

/**
 * Subtask parts represent a sub-agent being spawned.
 * Map to tool-use so the UI can display it like a sub-agent invocation.
 */
function normalizeSubtaskPart(
  part: Part & { prompt: string; description: string; agent: string },
): NormalizedPart {
  return {
    type: 'tool-use',
    toolId: part.id,
    toolName: `subtask:${part.agent}`,
    input: { prompt: part.prompt, description: part.description },
  };
}

// --- Token usage normalization ---

function normalizeTokens(message: AssistantMessage): TokenUsage | undefined {
  if (!message.tokens) return undefined;

  return {
    inputTokens: message.tokens.input ?? 0,
    outputTokens: message.tokens.output ?? 0,
    cacheReadTokens: message.tokens.cache?.read,
    cacheCreationTokens: message.tokens.cache?.write,
  };
}
