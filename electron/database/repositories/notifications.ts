import { db } from '../index';
import type { NewNotificationRow } from '../schema';

export const NotificationRepository = {
  async create(notification: NewNotificationRow) {
    return db
      .insertInto('notifications')
      .values(notification)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async findAll({ limit = 100 }: { limit?: number } = {}) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  },

  async findByProject(
    projectId: string,
    { limit = 100 }: { limit?: number } = {},
  ) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  },

  async markAsRead(id: string) {
    await db
      .updateTable('notifications')
      .set({ read: 1 })
      .where('id', '=', id)
      .execute();
  },

  async markAllAsRead() {
    await db
      .updateTable('notifications')
      .set({ read: 1 })
      .where('read', '=', 0)
      .execute();
  },

  async deleteById(id: string) {
    await db.deleteFrom('notifications').where('id', '=', id).execute();
  },

  async deleteOlderThan(isoDate: string) {
    await db
      .deleteFrom('notifications')
      .where('createdAt', '<', isoDate)
      .execute();
  },

  async getUnreadCount() {
    const result = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('read', '=', 0)
      .executeTakeFirstOrThrow();
    return result.count;
  },
};
