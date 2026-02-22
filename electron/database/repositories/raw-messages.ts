import { nanoid } from 'nanoid';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { db } from '../index';

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

  compactOpenCodeDeltasForTask: async (taskId: string): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      const rows = await trx
        .selectFrom('raw_messages')
        .select(['id', 'rawData'])
        .where('taskId', '=', taskId)
        .where('rawFormat', '=', 'opencode')
        .orderBy('messageIndex', 'asc')
        .execute();

      const updates: Array<{ id: string; rawData: unknown }> = [];
      const deleteIds: string[] = [];

      let currentAnchorId: string | null = null;
      let currentAnchorEvent: {
        type: 'message.part.delta';
        properties: {
          sessionID: string;
          messageID: string;
          partID: string;
          field: string;
          delta: string;
        };
      } | null = null;
      let currentKey: string | null = null;
      let currentDelta = '';
      let currentRunLength = 0;

      const flushRun = () => {
        if (
          currentAnchorId &&
          currentAnchorEvent &&
          currentRunLength > 1 &&
          currentAnchorEvent.properties.delta !== currentDelta
        ) {
          updates.push({
            id: currentAnchorId,
            rawData: {
              ...currentAnchorEvent,
              properties: {
                ...currentAnchorEvent.properties,
                delta: currentDelta,
              },
            },
          });
        }

        currentAnchorId = null;
        currentAnchorEvent = null;
        currentKey = null;
        currentDelta = '';
        currentRunLength = 0;
      };

      for (const row of rows) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.rawData);
        } catch {
          flushRun();
          continue;
        }

        if (!isOpenCodeDeltaEvent(parsed)) {
          flushRun();
          continue;
        }

        const key = [
          parsed.properties.sessionID,
          parsed.properties.messageID,
          parsed.properties.partID,
          parsed.properties.field,
        ].join('::');

        if (currentKey && key === currentKey) {
          currentRunLength += 1;
          currentDelta += parsed.properties.delta;
          deleteIds.push(row.id);
          continue;
        }

        flushRun();
        currentAnchorId = row.id;
        currentAnchorEvent = parsed;
        currentKey = key;
        currentDelta = parsed.properties.delta;
        currentRunLength = 1;
      }

      flushRun();

      for (const update of updates) {
        await trx
          .updateTable('raw_messages')
          .set({ rawData: JSON.stringify(update.rawData) })
          .where('id', '=', update.id)
          .execute();
      }

      for (const id of deleteIds) {
        await trx.deleteFrom('raw_messages').where('id', '=', id).execute();
      }
    });
  },
};
