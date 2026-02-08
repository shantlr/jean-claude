import { nanoid } from 'nanoid';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { db } from '../index';

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
};
