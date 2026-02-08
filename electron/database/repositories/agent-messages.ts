import type { NormalizedMessage } from '@shared/agent-backend-types';
import { CURRENT_NORMALIZATION_VERSION } from '@shared/agent-backend-types';
import type { AgentMessage } from '@shared/agent-types';

import { normalizeClaudeMessage } from '../../services/agent-backends/claude/normalize-claude-message';
import { db } from '../index';

export const AgentMessageRepository = {
  /**
   * Find all normalized messages for a task.
   * Falls back to on-the-fly normalization via the linked raw_message if normalizedData is missing.
   */
  findByTaskId: async (taskId: string): Promise<NormalizedMessage[]> => {
    // Only select lightweight columns — avoid joining raw_messages eagerly
    // since most rows already have normalizedData.
    const rows = await db
      .selectFrom('agent_messages')
      .select(['agent_messages.normalizedData', 'agent_messages.rawMessageId'])
      .where('agent_messages.taskId', '=', taskId)
      .orderBy('agent_messages.messageIndex', 'asc')
      .execute();

    const messages: NormalizedMessage[] = [];
    // Deduplicate by normalized message id: if multiple rows share the same
    // message id (e.g. from streaming snapshots persisted before the upsert fix),
    // keep only the last one (highest messageIndex = latest snapshot).
    const seenIds = new Map<string, number>();

    // Collect rawMessageIds for rows that need fallback normalization
    const fallbackRows: { index: number; rawMessageId: string }[] = [];

    for (const row of rows) {
      if (row.normalizedData) {
        const normalized = JSON.parse(row.normalizedData) as NormalizedMessage;
        const prevIndex = seenIds.get(normalized.id);
        if (prevIndex !== undefined) {
          messages[prevIndex] = normalized;
        } else {
          seenIds.set(normalized.id, messages.length);
          messages.push(normalized);
        }
      } else if (row.rawMessageId) {
        // Mark for lazy fallback — we'll batch-fetch raw data only for these
        fallbackRows.push({
          index: messages.length,
          rawMessageId: row.rawMessageId,
        });
        // Reserve a slot (may be replaced below)
        messages.push(undefined as unknown as NormalizedMessage);
      }
    }

    // Lazy fallback: fetch raw data only for the few rows that need it
    if (fallbackRows.length > 0) {
      const rawIds = fallbackRows.map((r) => r.rawMessageId);
      const rawRows = await db
        .selectFrom('raw_messages')
        .select([
          'raw_messages.id',
          'raw_messages.rawData',
          'raw_messages.rawFormat',
        ])
        .where('raw_messages.id', 'in', rawIds)
        .execute();

      const rawMap = new Map(rawRows.map((r) => [r.id, r]));

      // Process in reverse so we can safely splice out unfilled slots
      for (let i = fallbackRows.length - 1; i >= 0; i--) {
        const { index, rawMessageId } = fallbackRows[i];
        const rawRow = rawMap.get(rawMessageId);
        let normalized: NormalizedMessage | undefined;

        if (rawRow?.rawData && rawRow.rawFormat === 'claude-code') {
          const rawMsg = JSON.parse(rawRow.rawData) as AgentMessage;
          normalized = normalizeClaudeMessage(rawMsg) ?? undefined;
        }

        if (normalized) {
          const prevIndex = seenIds.get(normalized.id);
          if (prevIndex !== undefined) {
            messages[prevIndex] = normalized;
            messages.splice(index, 1);
          } else {
            seenIds.set(normalized.id, index);
            messages[index] = normalized;
          }
        } else {
          // Remove the reserved slot — no valid message
          messages.splice(index, 1);
        }
      }
    }

    return messages;
  },

  /**
   * Create a normalized task message, optionally linked to a raw message.
   */
  create: async ({
    taskId,
    messageIndex,
    normalized,
    rawMessageId,
  }: {
    taskId: string;
    messageIndex: number;
    normalized: NormalizedMessage;
    rawMessageId?: string | null;
  }) => {
    return db
      .insertInto('agent_messages')
      .values({
        taskId,
        messageIndex,
        messageType: normalized.role,
        normalizedData: JSON.stringify(normalized),
        normalizedVersion: CURRENT_NORMALIZATION_VERSION,
        rawMessageId: rawMessageId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Update an existing agent_messages row by matching the normalized message id
   * embedded in the normalizedData JSON. Used for streaming updates where the same
   * logical message is emitted multiple times with progressively more content.
   *
   * Returns the number of rows updated (0 or 1).
   */
  updateNormalizedData: async ({
    taskId,
    normalizedId,
    normalized,
    rawMessageId,
  }: {
    taskId: string;
    normalizedId: string;
    normalized: NormalizedMessage;
    rawMessageId?: string | null;
  }): Promise<number> => {
    const result = await db
      .updateTable('agent_messages')
      .set({
        normalizedData: JSON.stringify(normalized),
        rawMessageId: rawMessageId ?? undefined,
      })
      .where('taskId', '=', taskId)
      .where('normalizedData', 'like', `%"id":"${normalizedId}"%`)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
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
        'agent_messages.normalizedData',
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
        if (row.normalizedData) {
          normalizedByRawId.set(row.rawMessageId, row.normalizedData);
        }
      } else if (row.normalizedData) {
        // Synthetic message (no raw counterpart)
        syntheticNormalized.push({
          messageIndex: row.messageIndex,
          normalizedData: row.normalizedData,
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
};
