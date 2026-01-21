import type { AgentMessage } from '../../../shared/agent-types';
import { db } from '../index';

export const AgentMessageRepository = {
  findByTaskId: async (taskId: string): Promise<AgentMessage[]> => {
    const rows = await db
      .selectFrom('agent_messages')
      .selectAll()
      .where('taskId', '=', taskId)
      .orderBy('messageIndex', 'asc')
      .execute();

    return rows.map((row) => JSON.parse(row.messageData) as AgentMessage);
  },

  create: async (taskId: string, messageIndex: number, message: AgentMessage) => {
    return db
      .insertInto('agent_messages')
      .values({
        taskId,
        messageIndex,
        messageType: message.type,
        messageData: JSON.stringify(message),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  deleteByTaskId: async (taskId: string) => {
    return db.deleteFrom('agent_messages').where('taskId', '=', taskId).execute();
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
