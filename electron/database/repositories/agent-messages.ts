import type {
  Event as OcEvent,
  Part as OcPart,
  Message as OcMessage,
  AssistantMessage as OcAssistantMessage,
} from '@opencode-ai/sdk';

import type { AgentMessage } from '@shared/agent-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';
import { CURRENT_NORMALIZATION_VERSION } from '@shared/normalized-message-v2';

import type { NormalizationContext } from '../../services/agent-backends/claude/normalize-claude-message-v2';
import { normalizeClaudeMessageV2 } from '../../services/agent-backends/claude/normalize-claude-message-v2';
import {
  normalizeOpenCodeV2,
  type OpenCodeNormalizationContext,
  type OpenCodeRawInput,
} from '../../services/agent-backends/opencode/normalize-opencode-message-v2';
import { db } from '../index';

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
   * Create a normalized entry row, optionally linked to a raw message.
   */
  create: async ({
    taskId,
    messageIndex,
    entry,
    rawMessageId,
  }: {
    taskId: string;
    messageIndex: number;
    entry: NormalizedEntry;
    rawMessageId?: string | null;
  }) => {
    return db
      .insertInto('agent_messages')
      .values({
        id: entry.id,
        taskId,
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

    // Patch the result onto the tool-use entry
    const patched = { ...entry, result } as NormalizedEntry;

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
   * Find all messages with raw data for a task, joining agent_messages with raw_messages.
   * Returns every raw message (even those with no normalized counterpart) alongside
   * any normalized message linked via rawMessageId, plus synthetic normalized messages
   * that have no raw counterpart. Used by the debug comparison view.
   */
  findWithRawDataByTaskId: async (
    taskId: string,
  ): Promise<
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
    const rawRows = await db
      .selectFrom('raw_messages')
      .select([
        'raw_messages.id as rawId',
        'raw_messages.messageIndex',
        'raw_messages.rawData',
        'raw_messages.rawFormat',
        'raw_messages.backendSessionId',
        'raw_messages.createdAt',
      ])
      .where('raw_messages.taskId', '=', taskId)
      .orderBy('raw_messages.messageIndex', 'asc')
      .execute();

    // Fetch all agent_messages (normalized) that link to raw messages
    const normalizedRows = await db
      .selectFrom('agent_messages')
      .select([
        'agent_messages.messageIndex',
        'agent_messages.data',
        'agent_messages.rawMessageId',
      ])
      .where('agent_messages.taskId', '=', taskId)
      .orderBy('agent_messages.messageIndex', 'asc')
      .execute();

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
        rawData: raw.rawData,
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
      .select(['id', 'messageIndex', 'rawData', 'rawFormat'])
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
        if (!raw.rawData || raw.rawFormat !== 'claude-code') continue;
        const rawMsg = JSON.parse(raw.rawData) as AgentMessage;
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
        if (!raw.rawData || raw.rawFormat !== 'opencode') continue;
        const parsed = JSON.parse(raw.rawData);

        // Determine if this is an SSE event or a prompt-result
        let input: OpenCodeRawInput;
        if (parsed.type && typeof parsed.type === 'string') {
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

    // Add synthetic entries back
    for (const syn of syntheticRows) {
      if (!syn.data) continue;
      entries.push({
        originalIndex: syn.messageIndex,
        rawMessageId: null,
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
      const { entry, rawMessageId } = entries[i];
      await db
        .insertInto('agent_messages')
        .values({
          id: entry.id,
          taskId,
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

/**
 * Replay OpenCode context updates for an SSE event.
 * Mirrors the pre-normalizer updates in opencode-backend.ts's mapEvent().
 */
function replayOpenCodeContextUpdate(
  event: OcEvent,
  ctx: OpenCodeNormalizationContext,
): void {
  switch (event.type) {
    case 'message.updated': {
      const props = event.properties as { info: OcMessage };
      ctx.rawMessages.set(props.info.id, props.info);
      if (props.info.role === 'assistant') {
        ctx.totalCost += (props.info as OcAssistantMessage).cost ?? 0;
      }
      break;
    }
    case 'message.part.updated': {
      const props = event.properties as { part: OcPart };
      const part = props.part;
      const existing = ctx.rawParts.get(part.messageID) ?? [];
      const idx = existing.findIndex((p) => p.id === part.id);
      if (idx >= 0) {
        existing[idx] = part;
      } else {
        existing.push(part);
      }
      ctx.rawParts.set(part.messageID, existing);
      break;
    }
    case 'message.removed': {
      const props = event.properties as { messageID: string };
      const prefix = `${props.messageID}:`;
      for (const entryId of ctx.emittedEntryIds) {
        if (entryId.startsWith(prefix)) {
          ctx.emittedEntryIds.delete(entryId);
        }
      }
      ctx.rawMessages.delete(props.messageID);
      ctx.rawParts.delete(props.messageID);
      break;
    }
    case 'message.part.removed': {
      const props = event.properties as {
        messageID: string;
        partID: string;
      };
      const parts = ctx.rawParts.get(props.messageID);
      if (parts) {
        const idx = parts.findIndex((p) => p.id === props.partID);
        if (idx >= 0) parts.splice(idx, 1);
      }
      break;
    }
    default:
      break;
  }
}
