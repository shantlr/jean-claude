import type {
  Event as OcEvent,
  Part as OcPart,
  Message as OcMessage,
  AssistantMessage as OcAssistantMessage,
} from '@opencode-ai/sdk/v2';

import type { AgentMessage } from '@shared/agent-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import { CURRENT_NORMALIZATION_VERSION } from '@shared/normalized-message-v2';

import type { NormalizationContext } from '../../services/agent-backends/claude/normalize-claude-message-v2';
import { normalizeClaudeMessageV2 } from '../../services/agent-backends/claude/normalize-claude-message-v2';
import {
  createCodexNormalizationContext,
  normalizeCodexNotification,
} from '../../services/agent-backends/codex/normalize-codex-message-v2';
import {
  normalizeOpenCodeV2,
  type OpenCodeNormalizationContext,
  type OpenCodeRawInput,
} from '../../services/agent-backends/opencode/normalize-opencode-message-v2';
import { replayOpenCodeContextUpdate } from '../../services/agent-backends/opencode/opencode-context-replay';
import { db } from '../index';

import { decodeRawMessageData } from './raw-message-data';

export const AgentMessageRepository = {
  /**
   * Find all normalized entries for a task.
   * Each row is one entry — no deduplication needed.
   */
  findByTaskId: async (taskId: string): Promise<NormalizedEntry[]> => {
    const rows = await db
      .selectFrom('agent_messages')
      .select(['agent_messages.data'])
      .where('agent_messages.taskId', '=', taskId)
      .orderBy('agent_messages.messageIndex', 'asc')
      .execute();

    return rows
      .filter((row) => row.data)
      .map((row) => JSON.parse(row.data) as NormalizedEntry);
  },

  /**
   * Find all normalized entries for a step.
   * Each row is one entry — no deduplication needed.
   */
  findByStepId: async (stepId: string): Promise<NormalizedEntry[]> => {
    const rows = await db
      .selectFrom('agent_messages')
      .select(['agent_messages.data'])
      .where('agent_messages.stepId', '=', stepId)
      .orderBy('agent_messages.messageIndex', 'asc')
      .execute();

    return rows
      .filter((row) => row.data)
      .map((row) => JSON.parse(row.data) as NormalizedEntry);
  },

  /**
   * Get the count of normalized entries for a step.
   */
  getMessageCountByStepId: async (stepId: string): Promise<number> => {
    const result = await db
      .selectFrom('agent_messages')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('stepId', '=', stepId)
      .executeTakeFirst();
    return result?.count ?? 0;
  },

  /**
   * Create a normalized entry row, optionally linked to a raw message.
   */
  create: async ({
    taskId,
    stepId,
    messageIndex,
    entry,
    rawMessageId,
  }: {
    taskId: string;
    stepId?: string | null;
    messageIndex: number;
    entry: NormalizedEntry;
    rawMessageId?: string | null;
  }) => {
    return db
      .insertInto('agent_messages')
      .values({
        id: entry.id,
        taskId,
        stepId: stepId ?? null,
        messageIndex,
        type: entry.type,
        toolId: entry.type === 'tool-use' ? entry.toolId : null,
        parentToolId: entry.parentToolId ?? null,
        data: JSON.stringify(entry),
        model: entry.model ?? null,
        isSynthetic: entry.isSynthetic ? 1 : null,
        date: entry.date,
        normalizedVersion: CURRENT_NORMALIZATION_VERSION,
        rawMessageId: rawMessageId ?? null,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          data: JSON.stringify(entry),
          type: entry.type,
          toolId: entry.type === 'tool-use' ? entry.toolId : null,
          messageIndex,
          rawMessageId: rawMessageId ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Update an existing entry by its id (row PK = entry id).
   * Used for streaming updates where the same logical entry is emitted multiple
   * times with progressively more content.
   *
   * Returns the number of rows updated (0 or 1).
   */
  updateEntry: async ({
    taskId,
    entry,
  }: {
    taskId: string;
    entry: NormalizedEntry;
  }): Promise<number> => {
    const result = await db
      .updateTable('agent_messages')
      .set({
        data: JSON.stringify(entry),
        type: entry.type,
        toolId: entry.type === 'tool-use' ? entry.toolId : null,
      })
      .where('id', '=', entry.id)
      .where('taskId', '=', taskId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  },

  /**
   * Patch a tool-use entry's result by matching its toolId column.
   * Used when the tool result arrives as a separate event.
   *
   * Returns the number of rows updated (0 or 1).
   */
  updateToolResult: async ({
    taskId,
    toolId,
    result,
    isError: _isError,
    durationMs: _durationMs,
  }: {
    taskId: string;
    toolId: string;
    result?: string;
    isError: boolean;
    durationMs?: number;
  }): Promise<number> => {
    // Read current row, patch it, write back
    const row = await db
      .selectFrom('agent_messages')
      .select(['data'])
      .where('taskId', '=', taskId)
      .where('toolId', '=', toolId)
      .executeTakeFirst();

    if (!row?.data) return 0;

    const entry = JSON.parse(row.data) as NormalizedEntry;
    if (entry.type !== 'tool-use') return 0;

    // Patch the result onto the tool-use entry.
    // MCP results should be objects — wrap plain text in { content } to stay
    // consistent with the primary entry-update path in the normalizer.
    const patchedResult =
      entry.name === 'mcp' && typeof result === 'string'
        ? ((tryParseJson(result) as Record<string, unknown> | null) ?? {
            content: result,
          })
        : result;
    const patched = { ...entry, result: patchedResult } as NormalizedEntry;

    const updateResult = await db
      .updateTable('agent_messages')
      .set({ data: JSON.stringify(patched) })
      .where('taskId', '=', taskId)
      .where('toolId', '=', toolId)
      .executeTakeFirst();

    return Number(updateResult.numUpdatedRows);
  },

  deleteByTaskId: async (taskId: string) => {
    return db
      .deleteFrom('agent_messages')
      .where('taskId', '=', taskId)
      .execute();
  },

  /**
   * Find all messages with raw data for a task (optionally scoped to a step),
   * joining agent_messages with raw_messages.
   * Returns every raw message (even those with no normalized counterpart) alongside
   * any normalized message linked via rawMessageId, plus synthetic normalized messages
   * that have no raw counterpart. Used by the debug comparison view.
   */
  findWithRawDataByTaskId: async ({
    taskId,
    stepId,
  }: {
    taskId: string;
    stepId?: string;
  }): Promise<
    {
      messageIndex: number;
      rawData: string | null;
      rawFormat: string | null;
      backendSessionId: string | null;
      normalizedData: string | null;
      createdAt: string;
    }[]
  > => {
    // Fetch all raw messages for the task
    const rawQuery = db
      .selectFrom('raw_messages')
      .select([
        'raw_messages.id as rawId',
        'raw_messages.messageIndex',
        'raw_messages.rawData',
        'raw_messages.rawDataBlob',
        'raw_messages.rawDataEncoding',
        'raw_messages.rawFormat',
        'raw_messages.backendSessionId',
        'raw_messages.createdAt',
      ])
      .where('raw_messages.taskId', '=', taskId)
      .orderBy('raw_messages.messageIndex', 'asc');
    const rawRows = await (
      stepId ? rawQuery.where('raw_messages.stepId', '=', stepId) : rawQuery
    ).execute();

    // Fetch all agent_messages (normalized) that link to raw messages
    const normalizedQuery = db
      .selectFrom('agent_messages')
      .select([
        'agent_messages.messageIndex',
        'agent_messages.data',
        'agent_messages.rawMessageId',
      ])
      .where('agent_messages.taskId', '=', taskId)
      .orderBy('agent_messages.messageIndex', 'asc');
    const normalizedRows = await (
      stepId
        ? normalizedQuery.where('agent_messages.stepId', '=', stepId)
        : normalizedQuery
    ).execute();

    // Index normalized messages by rawMessageId for O(1) lookups
    const normalizedByRawId = new Map<string, string>();
    const syntheticNormalized: {
      messageIndex: number;
      normalizedData: string | null;
    }[] = [];

    for (const row of normalizedRows) {
      if (row.rawMessageId) {
        if (row.data) {
          normalizedByRawId.set(row.rawMessageId, row.data);
        }
      } else if (row.data) {
        // Synthetic message (no raw counterpart)
        syntheticNormalized.push({
          messageIndex: row.messageIndex,
          normalizedData: row.data,
        });
      }
    }

    // Build pairs: raw messages with their corresponding normalized data
    const pairs: {
      messageIndex: number;
      rawData: string | null;
      rawFormat: string | null;
      backendSessionId: string | null;
      normalizedData: string | null;
      createdAt: string;
    }[] = [];

    for (const raw of rawRows) {
      pairs.push({
        messageIndex: raw.messageIndex,
        rawData: decodeRawMessageData(raw),
        rawFormat: raw.rawFormat,
        backendSessionId: raw.backendSessionId,
        normalizedData: normalizedByRawId.get(raw.rawId) ?? null,
        createdAt: raw.createdAt,
      });
    }

    // Add synthetic normalized messages that have no raw counterpart
    for (const syn of syntheticNormalized) {
      pairs.push({
        messageIndex: syn.messageIndex,
        rawData: null,
        rawFormat: null,
        backendSessionId: null,
        normalizedData: syn.normalizedData,
        createdAt: '', // No raw timestamp for synthetic messages
      });
    }

    // Sort by messageIndex
    pairs.sort((a, b) => a.messageIndex - b.messageIndex);

    return pairs;
  },

  getMessageCount: async (taskId: string): Promise<number> => {
    const result = await db
      .selectFrom('agent_messages')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('taskId', '=', taskId)
      .executeTakeFirst();

    return result?.count ?? 0;
  },

  /**
   * Re-normalize all messages for a task from raw data.
   *
   * Reads all raw_messages, runs each through the normalizer to produce
   * flat entries, patches tool-result events onto matching tool-use entries,
   * preserves synthetic entries (rawMessageId = null), then deletes all
   * existing agent_messages and re-inserts the rebuilt set.
   */
  reprocessNormalization: async (taskId: string): Promise<number> => {
    const rawRows = await db
      .selectFrom('raw_messages')
      .select([
        'id',
        'messageIndex',
        'rawData',
        'rawDataBlob',
        'rawDataEncoding',
        'rawFormat',
        'stepId',
      ])
      .where('taskId', '=', taskId)
      .orderBy('messageIndex', 'asc')
      .execute();

    // Preserve synthetic entries (no rawMessageId)
    const syntheticRows = await db
      .selectFrom('agent_messages')
      .selectAll()
      .where('taskId', '=', taskId)
      .where('rawMessageId', 'is', null)
      .orderBy('messageIndex', 'asc')
      .execute();

    const entries: Array<{
      originalIndex: number;
      rawMessageId: string | null;
      stepId: string | null;
      entry: NormalizedEntry;
    }> = [];

    // Map toolId -> entry index for tool-result patching
    const toolIdToEntryIndex = new Map<string, number>();

    // Determine which format(s) are present
    const formats = new Set(rawRows.map((r) => r.rawFormat));

    if (formats.has('claude-code')) {
      const claudeCtx: NormalizationContext = {
        sessionIdEmitted: false,
        pendingToolUses: new Map(),
      };

      for (const raw of rawRows) {
        const rawData = decodeRawMessageData(raw);
        if (!rawData || raw.rawFormat !== 'claude-code') continue;
        const rawMsg = JSON.parse(rawData) as AgentMessage;
        const events = normalizeClaudeMessageV2(rawMsg, claudeCtx);

        for (const event of events) {
          if (event.type === 'session-id') {
            claudeCtx.sessionIdEmitted = true;
          }
          if (event.type === 'entry') {
            const idx = entries.length;
            entries.push({
              originalIndex: raw.messageIndex,
              rawMessageId: raw.id,
              stepId: raw.stepId,
              entry: event.entry,
            });
            if (event.entry.type === 'tool-use') {
              toolIdToEntryIndex.set(event.entry.toolId, idx);
            }
          }
          // entry-update: normalizer matched a tool result to its pending
          // tool-use and produced a properly typed result via addResultToToolUse
          if (event.type === 'entry-update') {
            const idx = entries.findIndex((e) => e.entry.id === event.entry.id);
            if (idx !== -1) {
              entries[idx].entry = event.entry;
            }
          }
          // Fallback: tool-result with string content (resumed sessions where
          // the pending tool-use wasn't tracked in ctx)
          if (event.type === 'tool-result') {
            const idx = toolIdToEntryIndex.get(event.toolId);
            if (idx !== undefined) {
              const existing = entries[idx].entry;
              if (existing.type === 'tool-use') {
                entries[idx].entry = {
                  ...existing,
                  result: event.result,
                } as NormalizedEntry;
              }
            }
          }
        }
      }
    }

    if (formats.has('opencode')) {
      const ocCtx: OpenCodeNormalizationContext = {
        emittedEntryIds: new Set(),
        rawMessages: new Map(),
        rawParts: new Map(),
        sessionStartTime: 0,
        totalCost: 0,
      };

      for (const raw of rawRows) {
        const rawData = decodeRawMessageData(raw);
        if (!rawData || raw.rawFormat !== 'opencode') continue;
        const parsed = JSON.parse(rawData);

        // Determine if this is an SSE event, child-session history row, or a prompt-result.
        let input: OpenCodeRawInput;
        if (parsed.type === 'child-session.message' && parsed.message) {
          const message = parsed.message as {
            info: OcMessage;
            parts: OcPart[];
          };
          ocCtx.rawMessages.set(message.info.id, message.info);
          ocCtx.rawParts.set(message.info.id, message.parts);
          if (message.info.role === 'assistant') {
            ocCtx.totalCost += (message.info as OcAssistantMessage).cost ?? 0;
          }
          input = {
            kind: 'event',
            event: {
              type: 'message.updated',
              properties: { info: message.info },
            } as OcEvent,
          };
        } else if (parsed.type && typeof parsed.type === 'string') {
          // SSE event — replay context updates before normalizing
          const event = parsed as OcEvent;
          replayOpenCodeContextUpdate(event, ocCtx);
          input = { kind: 'event', event };
        } else if (parsed.info && parsed.parts) {
          // Prompt result — update context then normalize
          const info = parsed.info as OcMessage;
          const parts = parsed.parts as OcPart[];
          ocCtx.rawMessages.set(info.id, info);
          ocCtx.rawParts.set(info.id, parts);
          if (info.role === 'assistant') {
            ocCtx.totalCost += (info as OcAssistantMessage).cost ?? 0;
          }
          input = {
            kind: 'prompt-result',
            info: info as OcAssistantMessage,
            parts,
          };
        } else {
          continue;
        }

        const events = normalizeOpenCodeV2(input, ocCtx);

        for (const event of events) {
          if (event.type === 'entry') {
            ocCtx.emittedEntryIds.add(event.entry.id);
            const idx = entries.length;
            entries.push({
              originalIndex: raw.messageIndex,
              rawMessageId: raw.id,
              stepId: raw.stepId,
              entry: event.entry,
            });
            if (event.entry.type === 'tool-use') {
              toolIdToEntryIndex.set(event.entry.toolId, idx);
            }
          }
          if (event.type === 'entry-update') {
            const idx = entries.findIndex((e) => e.entry.id === event.entry.id);
            if (idx !== -1) {
              entries[idx].entry = event.entry;
            }
          }
          if (event.type === 'tool-result') {
            const idx = toolIdToEntryIndex.get(event.toolId);
            if (idx !== undefined) {
              const existing = entries[idx].entry;
              if (existing.type === 'tool-use') {
                entries[idx].entry = {
                  ...existing,
                  result: event.result,
                } as NormalizedEntry;
              }
            }
          }
        }
      }
    }

    if (formats.has('codex')) {
      const codexCtx = createCodexNormalizationContext();

      for (const raw of rawRows) {
        const rawData = decodeRawMessageData(raw);
        if (!rawData || raw.rawFormat !== 'codex') continue;
        const parsed = JSON.parse(rawData) as {
          method?: unknown;
          params?: unknown;
        };
        if (typeof parsed.method !== 'string') continue;

        const events = normalizeCodexNotification(
          {
            method: parsed.method,
            params: record(parsed.params),
          },
          codexCtx,
        );

        for (const event of events) {
          if (event.type === 'entry') {
            const idx = entries.length;
            entries.push({
              originalIndex: raw.messageIndex,
              rawMessageId: raw.id,
              stepId: raw.stepId,
              entry: event.entry,
            });
            if (event.entry.type === 'tool-use') {
              toolIdToEntryIndex.set(event.entry.toolId, idx);
            }
          }
          if (event.type === 'entry-update') {
            const idx = entries.findIndex((e) => e.entry.id === event.entry.id);
            if (idx !== -1) {
              entries[idx].entry = event.entry;
            }
          }
          if (event.type === 'tool-result') {
            const idx = toolIdToEntryIndex.get(event.toolId);
            if (idx !== undefined) {
              const existing = entries[idx].entry;
              if (existing.type === 'tool-use') {
                entries[idx].entry = {
                  ...existing,
                  result: event.result,
                } as NormalizedEntry;
              }
            }
          }
        }
      }
    }

    // Add synthetic entries back (preserve stepId from original rows)
    for (const syn of syntheticRows) {
      if (!syn.data) continue;
      entries.push({
        originalIndex: syn.messageIndex,
        rawMessageId: null,
        stepId: syn.stepId,
        entry: JSON.parse(syn.data) as NormalizedEntry,
      });
    }

    entries.sort((a, b) => a.originalIndex - b.originalIndex);

    // Delete and re-insert
    await db
      .deleteFrom('agent_messages')
      .where('taskId', '=', taskId)
      .execute();

    for (let i = 0; i < entries.length; i++) {
      const { entry, rawMessageId, stepId } = entries[i];
      await db
        .insertInto('agent_messages')
        .values({
          id: entry.id,
          taskId,
          stepId: stepId ?? null,
          messageIndex: i,
          type: entry.type,
          toolId: entry.type === 'tool-use' ? entry.toolId : null,
          parentToolId: entry.parentToolId ?? null,
          data: JSON.stringify(entry),
          model: entry.model ?? null,
          isSynthetic: entry.isSynthetic ? 1 : null,
          date: entry.date,
          normalizedVersion: CURRENT_NORMALIZATION_VERSION,
          rawMessageId,
        })
        .execute();
    }

    return entries.length;
  },
};

function tryParseJson(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
