import type {
  NormalizedEntry,
  NormalizedResult,
  NormalizationEvent,
  TokenUsage,
} from '@shared/normalized-message-v2';

type UserPromptEntry = NormalizedEntry & { type: 'user-prompt' };
type AssistantEntry = NormalizedEntry & { type: 'assistant-message' };
type ToolUseEntry = NormalizedEntry & { type: 'tool-use' };
type ItemEntry =
  | UserPromptEntry
  | AssistantEntry
  | ToolUseEntry
  | NormalizedEntry;

export type { NormalizationEvent };

export type CodexNotification = {
  method: string;
  params?: Record<string, unknown>;
};

export type CodexNormalizationContext = {
  emittedSessionIds: Set<string>;
  itemEntries: Map<string, NormalizedEntry>;
  itemText: Map<string, string>;
  model?: string;
};

export function createCodexNormalizationContext(): CodexNormalizationContext {
  return {
    emittedSessionIds: new Set(),
    itemEntries: new Map(),
    itemText: new Map(),
  };
}

export function normalizeCodexNotification(
  notification: CodexNotification,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const params = notification.params ?? {};

  switch (notification.method) {
    case 'thread/started':
      return normalizeThreadStarted(params, ctx);
    case 'thread/status/changed':
      return normalizeThreadStatusChanged(params);
    case 'item/started':
      return normalizeItemStarted(params, ctx);
    case 'item/agentMessage/delta':
      return normalizeAgentMessageDelta(params, ctx);
    case 'item/commandExecution/outputDelta':
      return normalizeCommandOutputDelta(params, ctx);
    case 'item/completed':
      return normalizeItemCompleted(params, ctx);
    case 'turn/completed':
      return normalizeTurnCompleted(params, ctx);
    default:
      return [];
  }
}

function normalizeCommandOutputDelta(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const itemId = str(params.itemId) ?? str(params.item_id) ?? str(params.id);
  const delta = str(params.delta) ?? str(params.output) ?? str(params.text);
  if (itemId === undefined || delta === undefined) return [];

  const existingEntry = ctx.itemEntries.get(itemId);
  if (existingEntry?.type !== 'tool-use' || existingEntry.name !== 'bash') {
    return [];
  }

  const previousContent = bashResultContent(existingEntry.result);
  const entry: ToolUseEntry = {
    ...existingEntry,
    result: {
      content: previousContent + delta,
      isError: isErrorResult(existingEntry.result),
    },
  };

  ctx.itemEntries.set(itemId, entry);
  return [{ type: 'entry-update', entry }];
}

function normalizeThreadStatusChanged(
  params: Record<string, unknown>,
): NormalizationEvent[] {
  const status = record(params.status);
  if (str(status?.type) !== 'idle') return [];

  return [
    {
      type: 'complete',
      result: {
        isError: isErrorValue(status?.error) || isErrorValue(params.error),
      },
    },
  ];
}

function normalizeThreadStarted(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const thread = record(params.thread);
  const sessionId = str(thread?.id) ?? str(params.threadId) ?? str(params.id);
  if (sessionId === undefined || ctx.emittedSessionIds.has(sessionId)) {
    return [];
  }

  ctx.emittedSessionIds.add(sessionId);
  return [{ type: 'session-id', sessionId }];
}

function normalizeItemStarted(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const item = record(params.item);
  if (item === undefined) return [];

  const itemId = itemIdFromItem(item, params);
  if (itemId === undefined) return [];

  if (isAssistantMessageItem(item)) {
    const text = textFromItem(item) ?? '';
    const entry = createAssistantEntry(itemId, item, text);
    ctx.itemEntries.set(itemId, entry);
    ctx.itemText.set(itemId, text);
    return [{ type: 'entry', entry }];
  }

  if (isUserMessageItem(item)) {
    const text = textFromItem(item);
    if (text === undefined) return [];

    const entry: UserPromptEntry = {
      id: itemId,
      date: dateFromItem(item),
      type: 'user-prompt',
      value: text,
    };
    ctx.itemEntries.set(itemId, entry);
    return [{ type: 'entry', entry }];
  }

  const entry = createToolEntry(item, itemId);
  if (entry === undefined) return [];

  ctx.itemEntries.set(itemId, entry);
  return [{ type: 'entry', entry }];
}

function normalizeAgentMessageDelta(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const itemId = str(params.itemId) ?? str(params.item_id) ?? str(params.id);
  const delta = str(params.delta) ?? str(params.text) ?? str(params.content);
  if (itemId === undefined || delta === undefined) return [];

  const existingText = ctx.itemText.get(itemId) ?? '';
  const nextText = existingText + delta;
  const existingEntry = ctx.itemEntries.get(itemId);
  const entry: AssistantEntry = {
    ...(existingEntry?.type === 'assistant-message'
      ? existingEntry
      : {
          id: itemId,
          date: new Date().toISOString(),
          type: 'assistant-message' as const,
        }),
    value: nextText,
  };

  ctx.itemEntries.set(itemId, entry);
  ctx.itemText.set(itemId, nextText);
  return [
    {
      type:
        existingEntry?.type === 'assistant-message' ? 'entry-update' : 'entry',
      entry,
    },
  ];
}

function normalizeItemCompleted(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const item = record(params.item);
  if (item === undefined) return [];

  const itemId = itemIdFromItem(item, params);
  if (itemId === undefined) return [];

  if (isUserMessageItem(item)) {
    const text = textFromItem(item);
    if (text === undefined) return [];
    const existingEntry = ctx.itemEntries.get(itemId);

    const entry: UserPromptEntry = {
      id: itemId,
      date: dateFromItem(item),
      type: 'user-prompt',
      value: text,
    };
    ctx.itemEntries.set(itemId, entry);
    return [
      {
        type: existingEntry?.type === 'user-prompt' ? 'entry-update' : 'entry',
        entry,
      },
    ];
  }

  if (isAssistantMessageItem(item)) {
    const text = textFromItem(item) ?? ctx.itemText.get(itemId) ?? '';
    const existingEntry = ctx.itemEntries.get(itemId);
    const entry: AssistantEntry = {
      ...(existingEntry?.type === 'assistant-message'
        ? existingEntry
        : createAssistantEntry(itemId, item, text)),
      value: text,
    };
    ctx.itemEntries.set(itemId, entry);
    ctx.itemText.set(itemId, text);
    return [
      {
        type:
          existingEntry?.type === 'assistant-message'
            ? 'entry-update'
            : 'entry',
        entry,
      },
    ];
  }

  const existingEntry = ctx.itemEntries.get(itemId);
  if (existingEntry?.type === 'tool-use') {
    const entry = addToolResult(existingEntry, item);
    if (entry === undefined) return [];

    ctx.itemEntries.set(itemId, entry);
    return [{ type: 'entry-update', entry }];
  }

  const entry = createToolEntry(item, itemId);
  if (entry === undefined) return [];

  const entryWithResult =
    entry.type === 'tool-use' ? (addToolResult(entry, item) ?? entry) : entry;
  ctx.itemEntries.set(itemId, entryWithResult);
  return [{ type: 'entry', entry: entryWithResult }];
}

function normalizeTurnCompleted(
  params: Record<string, unknown>,
  ctx: CodexNormalizationContext,
): NormalizationEvent[] {
  const result: NormalizedResult = {
    isError: isErrorValue(params.isError) || isErrorValue(params.error),
  };
  const durationMs = num(params.durationMs) ?? num(params.duration_ms);
  const usage = usageFromUnknown(params.usage);
  const model = modelFromParams(params) ?? ctx.model;

  if (durationMs !== undefined) result.durationMs = durationMs;
  if (usage !== undefined) result.usage = usage;
  if (model !== undefined) result.model = model;

  return [{ type: 'complete', result }];
}

function createAssistantEntry(
  itemId: string,
  item: Record<string, unknown>,
  value: string,
): AssistantEntry {
  return {
    id: itemId,
    date: dateFromItem(item),
    type: 'assistant-message',
    value,
  };
}

function createToolEntry(
  item: Record<string, unknown>,
  itemId: string,
): ItemEntry | undefined {
  const type = str(item.type);
  if (
    type === undefined ||
    isUserMessageItem(item) ||
    isAssistantMessageItem(item)
  ) {
    return undefined;
  }

  if (type === 'command' || type === 'commandExecution') {
    const command = str(item.command) ?? str(item.cmd) ?? str(item.text);
    if (command === undefined || command.trim() === '') return undefined;

    const description = str(item.description) ?? str(item.summary);
    return {
      id: itemId,
      date: dateFromItem(item),
      type: 'tool-use',
      toolId: itemId,
      name: 'bash',
      input: {
        command,
        ...(description === undefined ? {} : { description }),
      },
    };
  }

  if (type === 'fileChange') {
    const files = filesFromFileChangeItem(item);
    if (files.length === 0) return undefined;
    const firstFile = files[0];

    return {
      id: itemId,
      date: dateFromItem(item),
      type: 'tool-use',
      toolId: itemId,
      name: 'edit',
      input: {
        filePath: firstFile.filePath,
        oldString: '',
        newString: '',
        files,
      },
    };
  }

  if (type === 'reasoning') {
    const text = reasoningTextFromItem(item);
    if (text === undefined) return undefined;

    return {
      id: itemId,
      date: dateFromItem(item),
      type: 'thinking',
      value: text,
    };
  }

  return {
    id: itemId,
    date: dateFromItem(item),
    type: 'tool-use',
    toolId: itemId,
    name: 'codex-tool',
    input: { originalType: type, item: { ...item } },
  };
}

function addToolResult(
  entry: ToolUseEntry,
  item: Record<string, unknown>,
): ToolUseEntry | undefined {
  const error = item.error;
  const result =
    str(item.result) ??
    str(item.output) ??
    str(item.aggregatedOutput) ??
    str(item.text);
  const errorText = errorTextFromUnknown(error);
  const isError =
    isErrorValue(item.isError) ||
    isErrorValue(error) ||
    isErrorExitCode(item.exitCode);
  const content = result ?? errorText;

  if (entry.name === 'bash') {
    return {
      ...entry,
      result: {
        content: content ?? bashResultContent(entry.result),
        isError,
      },
    };
  }

  if (entry.name === 'edit') {
    const status = str(item.status);
    if (status === 'completed' || status === 'failed') {
      return { ...entry, result: { changes: [] } };
    }
  }

  if (content === undefined && !isError) return undefined;

  return { ...entry, result: content ?? { isError, error } };
}

function isUserMessageItem(item: Record<string, unknown>): boolean {
  return str(item.type) === 'userMessage' || str(item.role) === 'user';
}

function isAssistantMessageItem(item: Record<string, unknown>): boolean {
  const type = str(item.type);
  const role = str(item.role);
  return type === 'agentMessage' || role === 'assistant' || role === 'agent';
}

function itemIdFromItem(
  item: Record<string, unknown>,
  params: Record<string, unknown>,
): string | undefined {
  return (
    str(item.id) ??
    str(item.itemId) ??
    str(item.item_id) ??
    str(params.itemId) ??
    str(params.item_id)
  );
}

function textFromItem(item: Record<string, unknown>): string | undefined {
  const direct = str(item.text) ?? str(item.content) ?? str(item.message);
  if (direct !== undefined) return direct;

  const content = item.content;
  if (!Array.isArray(content)) return undefined;

  const parts = content
    .map((part) => {
      if (typeof part === 'string') return part;
      const partRecord = record(part);
      return partRecord === undefined ? undefined : str(partRecord.text);
    })
    .filter((part): part is string => part !== undefined);

  return parts.length === 0 ? undefined : parts.join('');
}

function dateFromItem(item: Record<string, unknown>): string {
  return (
    str(item.timestamp) ??
    str(item.createdAt) ??
    str(item.created_at) ??
    str(item.time) ??
    new Date().toISOString()
  );
}

function usageFromUnknown(value: unknown): TokenUsage | undefined {
  const usage = record(value);
  if (usage === undefined) return undefined;

  const inputTokens = num(usage.inputTokens) ?? num(usage.input_tokens);
  const outputTokens = num(usage.outputTokens) ?? num(usage.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: num(usage.cacheReadTokens) ?? num(usage.cache_read_tokens),
    cacheCreationTokens:
      num(usage.cacheCreationTokens) ?? num(usage.cache_creation_tokens),
  };
}

function modelFromParams(params: Record<string, unknown>): string | undefined {
  const model =
    str(params.model) ?? str(params.modelId) ?? str(params.model_id);
  if (model !== undefined) return model;

  const nestedModel = record(params.model);
  return str(nestedModel?.id) ?? str(nestedModel?.modelId);
}

function filesFromFileChangeItem(item: Record<string, unknown>): Array<{
  filePath: string;
  type: 'add' | 'update' | 'delete';
  patch?: string;
}> {
  const changes = item.changes;
  if (!Array.isArray(changes)) return [];

  return changes.flatMap((change) => {
    const changeRecord = record(change);
    if (changeRecord === undefined) return [];

    const filePath = str(changeRecord.path) ?? str(changeRecord.filePath);
    if (filePath === undefined) return [];

    const kind = record(changeRecord.kind);
    const type = fileChangeType(str(kind?.type) ?? str(changeRecord.type));
    const patch = str(changeRecord.diff) ?? str(changeRecord.patch);

    return [
      {
        filePath,
        type,
        ...(patch === undefined ? {} : { patch }),
      },
    ];
  });
}

function fileChangeType(
  value: string | undefined,
): 'add' | 'update' | 'delete' {
  if (value === 'add' || value === 'create') return 'add';
  if (value === 'delete' || value === 'remove') return 'delete';
  return 'update';
}

function reasoningTextFromItem(
  item: Record<string, unknown>,
): string | undefined {
  const direct = str(item.text) ?? str(item.content) ?? str(item.summary);
  if (direct !== undefined && direct.trim() !== '') return direct;

  const content = textFromArray(item.content);
  if (content !== undefined) return content;

  return textFromArray(item.summary);
}

function textFromArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map((part) => {
      if (typeof part === 'string') return part;
      const partRecord = record(part);
      return partRecord === undefined
        ? undefined
        : (str(partRecord.text) ?? str(partRecord.summary));
    })
    .filter((part): part is string => part !== undefined && part !== '');

  return parts.length === 0 ? undefined : parts.join('');
}

function bashResultContent(result: unknown): string {
  const resultRecord = record(result);
  if (resultRecord === undefined)
    return typeof result === 'string' ? result : '';

  const content = str(resultRecord.content);
  return content ?? '';
}

function isErrorResult(result: unknown): boolean {
  const resultRecord = record(result);
  return resultRecord === undefined
    ? false
    : isErrorValue(resultRecord.isError);
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isErrorValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim() !== '';
  return typeof value === 'object' && value !== null;
}

function isErrorExitCode(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

function errorTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;

  const errorRecord = record(value);
  if (errorRecord === undefined) return undefined;

  return str(errorRecord.message) ?? str(errorRecord.error);
}
