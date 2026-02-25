import { nanoid } from 'nanoid';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { db } from '../index';

// --- Type guards for OpenCode SSE events ---

function isOpenCodeDeltaEvent(value: unknown): value is {
  type: 'message.part.delta';
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
} {
  if (!value || typeof value !== 'object') return false;
  const event = value as {
    type?: unknown;
    properties?: Record<string, unknown>;
  };
  if (event.type !== 'message.part.delta') return false;
  const props = event.properties;
  if (!props || typeof props !== 'object') return false;
  return (
    typeof props.sessionID === 'string' &&
    typeof props.messageID === 'string' &&
    typeof props.partID === 'string' &&
    typeof props.field === 'string' &&
    typeof props.delta === 'string'
  );
}

function isOpenCodePartUpdatedEvent(value: unknown): value is {
  type: 'message.part.updated';
  properties: { part: { id: string } };
} {
  if (!value || typeof value !== 'object') return false;
  const event = value as {
    type?: unknown;
    properties?: Record<string, unknown>;
  };
  if (event.type !== 'message.part.updated') return false;
  const props = event.properties;
  if (!props || typeof props !== 'object') return false;
  const part = props.part;
  return (
    !!part &&
    typeof part === 'object' &&
    typeof (part as { id?: unknown }).id === 'string'
  );
}

function isOpenCodeMessageUpdatedEvent(
  value: unknown,
): value is { type: 'message.updated'; properties: { info: { id: string } } } {
  if (!value || typeof value !== 'object') return false;
  const event = value as {
    type?: unknown;
    properties?: Record<string, unknown>;
  };
  if (event.type !== 'message.updated') return false;
  const props = event.properties;
  if (!props || typeof props !== 'object') return false;
  const info = props.info;
  return (
    !!info &&
    typeof info === 'object' &&
    typeof (info as { id?: unknown }).id === 'string'
  );
}

export const RawMessageRepository = {
  /**
   * Store a raw SDK message.
   * Returns the created row.
   */
  create: async ({
    taskId,
    messageIndex,
    backendSessionId,
    rawData,
    rawFormat,
  }: {
    taskId: string;
    messageIndex: number;
    backendSessionId: string | null;
    rawData: unknown;
    rawFormat: AgentBackendType;
  }) => {
    return db
      .insertInto('raw_messages')
      .values({
        id: nanoid(),
        taskId,
        messageIndex,
        backendSessionId,
        rawData: JSON.stringify(rawData),
        rawFormat,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Update an existing raw_messages row's rawData by its row id.
   * Used when a streaming update replaces a previous snapshot.
   */
  updateRawData: async (rowId: string, rawData: unknown) => {
    await db
      .updateTable('raw_messages')
      .set({ rawData: JSON.stringify(rawData) })
      .where('id', '=', rowId)
      .execute();
  },

  /**
   * Find all raw messages for a task, ordered by messageIndex.
   */
  findByTaskId: async (taskId: string) => {
    return db
      .selectFrom('raw_messages')
      .selectAll()
      .where('taskId', '=', taskId)
      .orderBy('messageIndex', 'asc')
      .execute();
  },

  /**
   * Delete all raw messages for a task.
   */
  deleteByTaskId: async (taskId: string) => {
    return db.deleteFrom('raw_messages').where('taskId', '=', taskId).execute();
  },

  /**
   * Compact OpenCode raw messages for a task.
   *
   * Two-pass approach:
   *   Pass 1 — Delta merge: Groups `message.part.delta` events by
   *            (sessionID, messageID, partID, field) across all rows
   *            (not just consecutive), merges deltas into the first anchor,
   *            and deletes the rest.
   *   Pass 2 — Snapshot dedup: For `message.part.updated` events sharing
   *            the same partID, keeps only the last one (highest messageIndex).
   *            Same for `message.updated` events sharing the same messageID.
   *
   * FK safety: `agent_messages.rawMessageId` has ON DELETE SET NULL,
   * so deleting raw rows safely nulls out the reference.
   */
  compactOpenCodeRawMessagesForTask: async (taskId: string): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      const rows = await trx
        .selectFrom('raw_messages')
        .select(['id', 'rawData', 'messageIndex'])
        .where('taskId', '=', taskId)
        .where('rawFormat', '=', 'opencode')
        .orderBy('messageIndex', 'asc')
        .execute();

      // Parse all rows once upfront to avoid double JSON.parse across passes
      const parsedRows = rows.map((row) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(row.rawData);
        } catch {
          // leave as null
        }
        return { ...row, parsed };
      });

      const updates: Array<{ id: string; rawData: unknown }> = [];
      const deleteIds: string[] = [];

      // --- Pass 1: Delta merge ---
      // Group all message.part.delta events by key, regardless of interleaving.
      const deltaGroups = new Map<
        string,
        Array<{
          id: string;
          event: {
            type: 'message.part.delta';
            properties: {
              sessionID: string;
              messageID: string;
              partID: string;
              field: string;
              delta: string;
            };
          };
        }>
      >();

      for (const row of parsedRows) {
        if (!isOpenCodeDeltaEvent(row.parsed)) continue;

        const key = [
          row.parsed.properties.sessionID,
          row.parsed.properties.messageID,
          row.parsed.properties.partID,
          row.parsed.properties.field,
        ].join('::');

        let group = deltaGroups.get(key);
        if (!group) {
          group = [];
          deltaGroups.set(key, group);
        }
        group.push({ id: row.id, event: row.parsed });
      }

      for (const group of deltaGroups.values()) {
        if (group.length <= 1) continue;

        // Merge all deltas into the first anchor
        const anchor = group[0];
        let accumulatedDelta = '';
        for (const item of group) {
          accumulatedDelta += item.event.properties.delta;
        }

        // Update anchor with full accumulated delta
        if (anchor.event.properties.delta !== accumulatedDelta) {
          updates.push({
            id: anchor.id,
            rawData: {
              ...anchor.event,
              properties: {
                ...anchor.event.properties,
                delta: accumulatedDelta,
              },
            },
          });
        }

        // Delete all non-anchor deltas
        for (let i = 1; i < group.length; i++) {
          deleteIds.push(group[i].id);
        }
      }

      // --- Pass 2: Snapshot dedup ---
      // For message.part.updated: keep only the last per partID.
      // For message.updated: keep only the last per messageID.
      const partUpdatedLast = new Map<
        string,
        { id: string; messageIndex: number }
      >();
      const partUpdatedAll = new Map<string, string[]>();

      const messageUpdatedLast = new Map<
        string,
        { id: string; messageIndex: number }
      >();
      const messageUpdatedAll = new Map<string, string[]>();

      for (const row of parsedRows) {
        if (isOpenCodePartUpdatedEvent(row.parsed)) {
          const partId = row.parsed.properties.part.id;
          const existing = partUpdatedLast.get(partId);
          if (!existing || row.messageIndex > existing.messageIndex) {
            partUpdatedLast.set(partId, {
              id: row.id,
              messageIndex: row.messageIndex,
            });
          }
          let all = partUpdatedAll.get(partId);
          if (!all) {
            all = [];
            partUpdatedAll.set(partId, all);
          }
          all.push(row.id);
        }

        if (isOpenCodeMessageUpdatedEvent(row.parsed)) {
          const messageId = row.parsed.properties.info.id;
          const existing = messageUpdatedLast.get(messageId);
          if (!existing || row.messageIndex > existing.messageIndex) {
            messageUpdatedLast.set(messageId, {
              id: row.id,
              messageIndex: row.messageIndex,
            });
          }
          let all = messageUpdatedAll.get(messageId);
          if (!all) {
            all = [];
            messageUpdatedAll.set(messageId, all);
          }
          all.push(row.id);
        }
      }

      // Delete all but the last message.part.updated per partID
      for (const [partId, allIds] of partUpdatedAll) {
        if (allIds.length <= 1) continue;
        const keepId = partUpdatedLast.get(partId)!.id;
        for (const id of allIds) {
          if (id !== keepId) deleteIds.push(id);
        }
      }

      // Delete all but the last message.updated per messageID
      for (const [msgId, allIds] of messageUpdatedAll) {
        if (allIds.length <= 1) continue;
        const keepId = messageUpdatedLast.get(msgId)!.id;
        for (const id of allIds) {
          if (id !== keepId) deleteIds.push(id);
        }
      }

      // --- Apply updates and deletes ---
      for (const update of updates) {
        await trx
          .updateTable('raw_messages')
          .set({ rawData: JSON.stringify(update.rawData) })
          .where('id', '=', update.id)
          .execute();
      }

      // Batch deletes for efficiency (SQLite variable limit ~999)
      const uniqueDeleteIds = [...new Set(deleteIds)];
      const DELETE_BATCH_SIZE = 500;
      for (let i = 0; i < uniqueDeleteIds.length; i += DELETE_BATCH_SIZE) {
        const batch = uniqueDeleteIds.slice(i, i + DELETE_BATCH_SIZE);
        await trx.deleteFrom('raw_messages').where('id', 'in', batch).execute();
      }
    });
  },
};
