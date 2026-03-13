// Normalizer V2 for OpenCode SDK events → NormalizationEvent[].
//
// Key differences from V1:
// - Takes raw SSE events or prompt results as input (wrapped in OpenCodeRawInput)
// - Returns NormalizationEvent[] covering entries, lifecycle, permissions, errors
// - Emits flat entries (one per part) instead of messages with parts[]
// - Completed/errored tools include typed results directly on the entry
// - Context carries raw message/parts state for full message reconstruction
// - Handles most SSE event types — backend's event loop becomes a thin pass-through
// - Backend is responsible for updating context before calling this function

import type {
  Event as OcEvent,
  Part as OcPart,
  Message as OcMessage,
  AssistantMessage as OcAssistantMessage,
  UserMessage as OcUserMessage,
  Session as OcSession,
  PermissionRequest as OcPermission,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  CompactionPart,
  ToolStateCompleted,
  ToolStateError,
} from '@opencode-ai/sdk/v2';

import type {
  NormalizedEntry,
  NormalizedToolUse,
  NormalizationEvent,
} from '@shared/normalized-message-v2';

// --- Exported types ---

/**
 * Discriminated input for the normalizer.
 * The backend wraps each raw SDK datum before passing to normalize.
 */
export type OpenCodeRawInput =
  | { kind: 'event'; event: OcEvent }
  | { kind: 'prompt-result'; info: OcAssistantMessage; parts: OcPart[] };

/**
 * Context maintained by the backend per session.
 * The normalizer reads from this but never mutates it.
 * The backend must update rawMessages/rawParts BEFORE calling the normalizer.
 */
export type OpenCodeNormalizationContext = {
  /** Entry IDs emitted so far — used to decide entry vs entry-update */
  emittedEntryIds: Set<string>;
  /** Raw message info indexed by message ID */
  rawMessages: Map<string, OcMessage>;
  /** Raw parts indexed by message ID (accumulated across part.updated events) */
  rawParts: Map<string, OcPart[]>;
  /** Session start time (ms since epoch) — for computing durationMs in complete events */
  sessionStartTime: number;
  /** Accumulated cost in USD — backend updates from assistant message cost fields */
  totalCost: number;
};

// --- Main normalization function ---

/**
 * Normalize an OpenCode raw input into NormalizationEvent[].
 *
 * Pure function — reads from ctx but never mutates it.
 * Handles most SSE event types (messages, permissions, errors, lifecycle).
 * Returns an empty array only for events with no normalised representation
 * (file watchers, LSP, PTY, TUI, etc.).
 */
export function normalizeOpenCodeV2(
  input: OpenCodeRawInput,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  if (input.kind === 'prompt-result') {
    return normalizeFullMessage(input.info, input.parts, ctx);
  }

  return normalizeEvent(input.event, ctx);
}

// --- Event dispatch ---

function normalizeEvent(
  event: OcEvent,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  switch (event.type) {
    case 'message.updated': {
      const props = event.properties as { info: OcMessage };
      return normalizeMessageUpdated(props.info, ctx);
    }

    case 'message.part.updated': {
      const props = event.properties as { part: OcPart };
      return normalizePartUpdated(props.part, ctx);
    }

    case 'message.removed': {
      // Message removal — no direct entry-level event for this in the flat model.
      // The backend handles cleanup of emittedEntryIds.
      return [];
    }

    case 'message.part.removed': {
      // Part removal — re-emit all entries for the parent message with updated parts.
      // (backend has already removed the part from ctx.rawParts)
      const props = event.properties as { messageID: string };
      const info = ctx.rawMessages.get(props.messageID);
      if (!info) return [];
      const parts = ctx.rawParts.get(props.messageID) ?? [];
      return buildEntries(info, parts, ctx);
    }

    // --- Session lifecycle ---

    case 'session.compacted':
      return normalizeCompacted(ctx);

    case 'session.updated': {
      const props = event.properties as { info: OcSession };
      return [{ type: 'session-updated', title: props.info.title }];
    }

    case 'session.idle':
      return [
        {
          type: 'complete',
          result: {
            isError: false,
            durationMs: Date.now() - ctx.sessionStartTime,
            cost: ctx.totalCost > 0 ? { costUsd: ctx.totalCost } : undefined,
          },
        },
      ];

    // --- Permissions ---

    case 'permission.asked': {
      const permission = event.properties as OcPermission;
      return [
        {
          type: 'permission-request',
          request: {
            requestId: permission.id,
            toolName: permission.permission,
            input: permission.metadata,
            description: permission.permission,
          },
        },
      ];
    }

    // --- Errors and retries ---

    case 'session.error': {
      const props = event.properties as { error?: unknown };
      return [
        {
          type: 'error',
          error: formatOpenCodeSessionError(props.error),
        },
      ];
    }

    case 'session.status': {
      const props = event.properties as {
        status: {
          type: string;
          attempt?: number;
          message?: string;
          next?: number;
        };
      };
      if (props.status.type === 'retry') {
        const msg = (props.status.message ?? '').toLowerCase();
        const isRateLimit =
          msg.includes('rate') ||
          msg.includes('limit') ||
          msg.includes('quota') ||
          msg.includes('throttl');
        if (isRateLimit) {
          const retryAfterMs =
            typeof props.status.next === 'number'
              ? Math.max(0, props.status.next - Date.now())
              : undefined;
          return [
            {
              type: 'rate-limit',
              retryAfterMs,
              message: props.status.message,
            },
          ];
        }
      }
      return [];
    }

    // --- Events with no normalised representation ---
    //
    // permission.replied:       Response confirmation — backend manages the resolve lifecycle.
    // session.created/deleted:  Session lifecycle — session ID is known from create() call.
    // file.edited / file.watcher.updated: File system changes. Informational only.
    // todo.updated:             Todo list changes. Could be a separate UI component.
    // vcs.branch.updated:       Git branch changes. Informational.
    // lsp.updated / lsp.client.diagnostics: Language server events. Internal.
    // server.instance.disposed / server.connected: Server lifecycle.
    // installation.updated / installation.update_available: Version management.
    // pty.created / pty.updated / pty.exited / pty.deleted: PTY lifecycle.
    // tui.prompt.append / tui.command.execute / tui.toast.show: TUI-specific.
    // command.executed:          Internal command tracking.
    // session.diff:             Diff information. Handled separately if needed.

    default:
      return [];
  }
}

// --- message.updated ---

function normalizeMessageUpdated(
  info: OcMessage,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  // Get accumulated parts from context (backend has already stored the message info)
  const parts = ctx.rawParts.get(info.id) ?? [];
  return buildEntries(info, parts, ctx);
}

// --- message.part.updated ---

function normalizePartUpdated(
  part: OcPart,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  // Look up the parent message from context
  const info = ctx.rawMessages.get(part.messageID);
  if (!info) return []; // Message not yet received — skip

  // Get all parts for this message (backend has already updated with the new part)
  const parts = ctx.rawParts.get(part.messageID) ?? [];
  return buildEntries(info, parts, ctx);
}

// --- session.compacted ---

function normalizeCompacted(
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const id = `compact-${Date.now()}`;
  const isUpdate = ctx.emittedEntryIds.has(id);
  return [
    {
      type: isUpdate ? 'entry-update' : 'entry',
      entry: {
        // Use a deterministic-ish ID for compaction entries
        id,
        date: new Date().toISOString(),
        type: 'system-status',
        status: null,
      },
    },
  ];
}

// --- prompt-result ---

function normalizeFullMessage(
  info: OcAssistantMessage,
  parts: OcPart[],
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  return buildEntries(info, parts, ctx);
}

// --- Core entry builder ---

/**
 * Build flat NormalizationEvent[] from an OpenCode message and its parts.
 * Each part becomes its own entry (or entry-update if already emitted).
 * Tool parts with completed/errored state include typed results on the entry.
 */
function buildEntries(
  info: OcMessage,
  parts: OcPart[],
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  if (info.role === 'user') {
    return buildUserEntries(info as OcUserMessage, parts, ctx);
  }
  return buildAssistantEntries(info as OcAssistantMessage, parts, ctx);
}

function buildUserEntries(
  info: OcUserMessage,
  parts: OcPart[],
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const events: NormalizationEvent[] = [];
  const date = new Date(info.time.created * 1000).toISOString();
  const model = `${info.model.providerID}/${info.model.modelID}`;

  // Collect text and image sections, then emit a single user-prompt entry.
  // Images are embedded as markdown data URIs so they render in the timeline.
  const sections: string[] = [];
  // Use the first part ID for the entry ID (stable across updates).
  let firstPartId: string | undefined;

  for (const part of parts) {
    if (part.type === 'text') {
      const textPart = part as TextPart;
      if (textPart.text) {
        if (!firstPartId) firstPartId = part.id;
        sections.push(textPart.text);
      }
    } else if (part.type === 'file') {
      const filePart = part as FilePart;
      if (!firstPartId) firstPartId = part.id;
      const filename = (filePart.filename || 'image').replace(
        /[[\]()\\]/g,
        '_',
      );
      sections.push(`![${filename}](${filePart.url})`);
    }
  }

  if (sections.length > 0 && firstPartId) {
    const entryId = `${info.id}:${firstPartId}`;
    const isUpdate = ctx.emittedEntryIds.has(entryId);
    events.push({
      type: isUpdate ? 'entry-update' : 'entry',
      entry: {
        id: entryId,
        date,
        model,
        type: 'user-prompt',
        value: sections.join('\n\n'),
      },
    });
  }

  return events;
}

function buildAssistantEntries(
  info: OcAssistantMessage,
  parts: OcPart[],
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const events: NormalizationEvent[] = [];
  const date = new Date(info.time.created * 1000).toISOString();
  const model = `${info.providerID}/${info.modelID}`;

  for (const part of parts) {
    const entryEvents = normalizeAssistantPartToEntry(
      part,
      info.id,
      date,
      model,
      ctx,
    );
    events.push(...entryEvents);
  }

  return events;
}

// --- Part normalization (assistant message parts) → flat entries ---

function normalizeAssistantPartToEntry(
  part: OcPart,
  messageId: string,
  date: string,
  model: string,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  switch (part.type) {
    case 'text': {
      const textPart = part as TextPart;
      if (!textPart.text) return [];
      const entryId = `${messageId}:${part.id}`;
      const isUpdate = ctx.emittedEntryIds.has(entryId);
      return [
        {
          type: isUpdate ? 'entry-update' : 'entry',
          entry: {
            id: entryId,
            date,
            model,
            type: 'assistant-message',
            value: textPart.text,
          },
        },
      ];
    }

    case 'tool':
      return normalizeToolPartToEntry(
        part as ToolPart,
        messageId,
        date,
        model,
        ctx,
      );

    case 'subtask':
      return normalizeSubtaskPartToEntry(
        part as OcPart & { prompt: string; description: string; agent: string },
        messageId,
        date,
        model,
        ctx,
      );

    case 'compaction':
      return normalizeCompactionPartToEntry(
        part as CompactionPart,
        messageId,
        date,
        ctx,
      );

    case 'reasoning': {
      const reasoningPart = part as ReasoningPart;
      if (!reasoningPart.text) return [];
      const reasoningEntryId = `${messageId}:${part.id}`;
      const isReasoningUpdate = ctx.emittedEntryIds.has(reasoningEntryId);
      return [
        {
          type: isReasoningUpdate ? 'entry-update' : 'entry',
          entry: {
            id: reasoningEntryId,
            date,
            model,
            type: 'thinking',
            value: reasoningPart.text,
          },
        },
      ];
    }

    // --- Part types ignored in normalization ---
    //
    // retry:        Agent retrying after API error. Backend emits 'rate-limit' AgentEvents instead.
    // step-start/finish: Per-step cost/token boundaries. Already aggregated on AssistantMessage.
    // snapshot:     Serialized execution state checkpoint. Internal to OpenCode's resumption.
    // patch:        File change hashes for incremental state tracking. Internal bookkeeping.
    // agent:        Agent identity marker (e.g., "plan", "build"). Available on message metadata.
    case 'retry':
    case 'step-start':
    case 'step-finish':
    case 'snapshot':
    case 'patch':
    case 'agent':
      return [];

    default:
      return [];
  }
}

// --- Tool part → flat entry (with typed result when completed/errored) ---

function normalizeToolPartToEntry(
  part: ToolPart,
  messageId: string,
  date: string,
  model: string,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const state = part.state;
  if (!state) return [];

  const mapped = mapOpenCodeTool(part.tool, state.input);
  const entryId = `${messageId}:${part.id}`;
  const isUpdate = ctx.emittedEntryIds.has(entryId);
  const events: NormalizationEvent[] = [];

  // Build the base tool-use entry (without result — result comes as separate event)
  const baseEntry: NormalizedEntry = {
    id: entryId,
    date,
    model,
    type: 'tool-use',
    toolId: part.callID,
    ...mapped,
  } as NormalizedEntry;

  switch (state.status) {
    case 'pending':
    case 'running':
      // Tool invoked but no result yet — emit entry only
      events.push({
        type: isUpdate ? 'entry-update' : 'entry',
        entry: baseEntry,
      });
      break;

    case 'completed': {
      // Tool finished — emit entry-update with typed result attached
      const result = mapToolResult(mapped.name, state);
      const entryWithResult = {
        ...baseEntry,
        result,
      } as NormalizedEntry;
      events.push({
        type: isUpdate ? 'entry-update' : 'entry',
        entry: entryWithResult,
      });
      break;
    }

    case 'error': {
      // Tool errored — emit entry-update with error result attached
      const errorResult = mapToolError(mapped.name, state);
      const entryWithError = {
        ...baseEntry,
        result: errorResult,
      } as NormalizedEntry;
      events.push({
        type: isUpdate ? 'entry-update' : 'entry',
        entry: entryWithError,
      });
      break;
    }

    default:
      break;
  }

  return events;
}

// --- Subtask part → sub-agent tool-use entry ---

function normalizeSubtaskPartToEntry(
  part: OcPart & { prompt: string; description: string; agent: string },
  messageId: string,
  date: string,
  model: string,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const entryId = `${messageId}:${part.id}`;
  const isUpdate = ctx.emittedEntryIds.has(entryId);
  return [
    {
      type: isUpdate ? 'entry-update' : 'entry',
      entry: {
        id: entryId,
        date,
        model,
        type: 'tool-use',
        toolId: part.id,
        name: 'sub-agent',
        input: {
          agentType: part.agent,
          description: part.description,
          prompt: part.prompt,
        },
      } as NormalizedEntry,
    },
  ];
}

// --- Compaction part → system-status entry ---

function normalizeCompactionPartToEntry(
  _part: CompactionPart,
  messageId: string,
  date: string,
  ctx: OpenCodeNormalizationContext,
): NormalizationEvent[] {
  const entryId = `${messageId}:${_part.id}`;
  const isUpdate = ctx.emittedEntryIds.has(entryId);
  return [
    {
      type: isUpdate ? 'entry-update' : 'entry',
      entry: {
        id: entryId,
        date,
        type: 'system-status',
        status: null,
      },
    },
  ];
}

// --- Tool name + input mapping ---

/**
 * Map an OpenCode tool name + input to V2 typed tool-use.
 * OpenCode tool names may differ from Claude; this handles known mappings
 * and falls back to the generic variant for unknown tools.
 */
function mapOpenCodeTool(
  toolName: string,
  input: Record<string, unknown>,
): Omit<NormalizedToolUse, 'type' | 'toolId' | 'parentToolId'> {
  // Normalize the tool name for matching (OpenCode may use different casing/naming)
  const name = toolName.toLowerCase();

  switch (name) {
    case 'read':
    case 'read_file':
      return {
        name: 'read',
        input: {
          filePath: str(input.filePath ?? input.file_path ?? input.path),
        },
      };

    case 'write':
    case 'write_file':
      return {
        name: 'write',
        input: {
          filePath: str(input.filePath ?? input.file_path ?? input.path),
          value: str(input.content),
        },
      };

    case 'edit':
    case 'edit_file':
      return {
        name: 'edit',
        input: {
          filePath: str(input.filePath ?? input.file_path ?? input.path),
          oldString: str(input.oldString ?? input.old_string ?? input.old),
          newString: str(input.newString ?? input.new_string ?? input.new),
        },
      };

    case 'bash':
    case 'shell':
      return {
        name: 'bash',
        input: {
          command: str(input.command ?? input.cmd),
          description: input.description ? str(input.description) : undefined,
        },
      };

    case 'glob':
    case 'list_files':
      return {
        name: 'glob',
        input: { pattern: str(input.pattern ?? input.glob) },
      };

    case 'grep':
    case 'search':
      return {
        name: 'grep',
        input: { pattern: str(input.pattern ?? input.query) },
      };

    case 'web_search':
    case 'websearch':
      return { name: 'web-search', input: { query: str(input.query) } };

    case 'web_fetch':
    case 'webfetch':
      return {
        name: 'web-fetch',
        input: { url: str(input.url), prompt: str(input.prompt ?? '') },
      };

    case 'skill':
      return {
        name: 'skill' as const,
        skillName: str(input.name ?? input.skill ?? ''),
        input: {},
      } as Omit<NormalizedToolUse, 'type' | 'toolId' | 'parentToolId'>;

    case 'apply_patch': {
      const patchText = str(input.patchText ?? input.patch);
      const parsed = parsePatchText(patchText);
      return {
        name: 'edit',
        input: {
          filePath: parsed.filePath,
          oldString: parsed.oldString,
          newString: parsed.newString,
        },
      };
    }

    case 'todowrite':
    case 'todo_write':
      return {
        name: 'todo-write',
        input: { todos: extractOpenCodeTodos(input) },
      };

    case 'question':
    case 'ask-user-question':
    case 'askuserquestion':
      return {
        name: 'ask-user-question',
        input: {
          questions: extractOpenCodeQuestions(input),
        },
      };

    default:
      // Fallback — pass through as-is
      return { name: toolName, input } as Omit<
        NormalizedToolUse,
        'type' | 'toolId' | 'parentToolId'
      >;
  }
}

// --- Tool result mapping ---

function mapToolResult(name: string, state: ToolStateCompleted): unknown {
  switch (name) {
    case 'read':
    case 'glob':
    case 'grep':
      return state.output;

    case 'bash':
      return { content: state.output, isError: undefined };

    case 'write':
      return { success: true };

    case 'edit':
      return { changes: [] }; // OpenCode doesn't provide structured patch data

    case 'sub-agent':
      return { output: state.output };

    case 'skill':
      return {};

    case 'todo-write':
      return extractOpenCodeTodoResult(state);

    case 'web-fetch':
      return { content: state.output };

    case 'web-search':
      return { content: state.output };

    case 'ask-user-question':
      return { answers: [] };

    default:
      return state.output;
  }
}

function mapToolError(name: string, state: ToolStateError): unknown {
  switch (name) {
    case 'bash':
      return { content: state.error, isError: true };

    case 'write':
      return { success: false };

    case 'sub-agent':
      return { output: state.error };

    case 'web-fetch':
      return { content: state.error };

    case 'web-search':
      return { content: state.error };

    default:
      return state.error;
  }
}

// --- Utilities ---

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function formatOpenCodeSessionError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Unknown error';
  }

  const errorObj = error as {
    message?: unknown;
    data?: { message?: unknown; responseBody?: unknown };
  };

  const detailFromBody = extractDetailFromResponseBody(
    errorObj.data?.responseBody,
  );
  if (detailFromBody) {
    return detailFromBody;
  }

  const messageFromData = strOrUndefined(errorObj.data?.message);
  const detailFromDataMessage = messageFromData
    ? extractDetailFromWrappedMessage(messageFromData)
    : undefined;
  if (detailFromDataMessage) {
    return detailFromDataMessage;
  }
  if (messageFromData) {
    return messageFromData;
  }

  const message = strOrUndefined(errorObj.message);
  if (message) {
    return message;
  }

  return 'Unknown error';
}

function extractDetailFromResponseBody(
  responseBody: unknown,
): string | undefined {
  const body = strOrUndefined(responseBody);
  if (!body) return undefined;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return strOrUndefined(parsed.detail ?? parsed.message ?? parsed.error);
  } catch {
    return undefined;
  }
}

function extractDetailFromWrappedMessage(message: string): string | undefined {
  const firstBrace = message.indexOf('{');
  if (firstBrace < 0) return undefined;

  const maybeJson = message.slice(firstBrace).trim();
  try {
    const parsed = JSON.parse(maybeJson) as Record<string, unknown>;
    return strOrUndefined(parsed.detail ?? parsed.message ?? parsed.error);
  } catch {
    return undefined;
  }
}

function strOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse an apply_patch patchText into filePath, oldString, and newString.
 *
 * The patch format looks like:
 *   *** Begin Patch
 *   *** Update File: /path/to/file.ts
 *   @@
 *      context line (leading space)
 *   -  removed line
 *   +  added line
 *      context line
 *   *** End Patch
 *
 * Lines prefixed with `-` are removed (old), `+` are added (new),
 * and lines with a leading space are context (present in both).
 */
function parsePatchText(patchText: string): {
  filePath: string;
  oldString: string;
  newString: string;
} {
  const fileMatch = patchText.match(
    /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)/,
  );
  const filePath = fileMatch?.[1]?.trim() ?? '';

  const lines = patchText.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    // Start of a hunk
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    // End markers — stop parsing
    if (
      line.startsWith('*** End Patch') ||
      line.startsWith('*** Update File:') ||
      line.startsWith('*** Add File:') ||
      line.startsWith('*** Delete File:')
    ) {
      // If we hit another file header, stop at the first file
      if (inHunk) break;
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith('-')) {
      // Removed line — only in old
      oldLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      // Added line — only in new
      newLines.push(line.slice(1));
    } else {
      // Context line (leading space) — in both old and new
      const content = line.startsWith(' ') ? line.slice(1) : line;
      oldLines.push(content);
      newLines.push(content);
    }
  }

  return {
    filePath,
    oldString: oldLines.join('\n'),
    newString: newLines.join('\n'),
  };
}

type TodoStatus = 'pending' | 'in_progress' | 'completed';

function mapOpenCodeTodoItem(item: unknown): {
  content: string;
  status: TodoStatus;
} {
  const obj = item as Record<string, unknown>;
  const status = String(obj.status ?? 'pending');
  return {
    content: str(obj.content),
    status: (status === 'in_progress' || status === 'completed'
      ? status
      : 'pending') as TodoStatus,
  };
}

function extractOpenCodeTodos(
  input: Record<string, unknown>,
): Array<{ content: string; status: TodoStatus }> | undefined {
  const todos = input.todos;
  if (!Array.isArray(todos)) return undefined;
  return (todos as unknown[]).map(mapOpenCodeTodoItem);
}

function extractOpenCodeTodoResult(state: ToolStateCompleted): {
  oldTodos: Array<{ content: string; status: TodoStatus }>;
  newTodos: Array<{ content: string; status: TodoStatus }>;
} {
  // OpenCode doesn't provide oldTodos — only the new state
  const metadata = state.metadata as Record<string, unknown> | undefined;
  const todos = metadata?.todos ?? state.input?.todos;
  const newTodos = Array.isArray(todos)
    ? (todos as unknown[]).map(mapOpenCodeTodoItem)
    : [];
  return { oldTodos: [], newTodos };
}

function extractOpenCodeQuestions(input: Record<string, unknown>): Array<{
  question: string;
  header: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description: string }>;
}> {
  const questions = input.questions;
  if (!Array.isArray(questions)) return [];
  return (questions as unknown[]).map((q) => {
    const obj = q as Record<string, unknown>;
    return {
      question: str(obj.question),
      header: str(obj.header),
      multiSelect: obj.multiSelect === true ? true : undefined,
      options: Array.isArray(obj.options)
        ? (obj.options as unknown[]).map((o) => {
            const opt = o as Record<string, unknown>;
            return {
              label: str(opt.label),
              description: str(opt.description),
            };
          })
        : [],
    };
  });
}
