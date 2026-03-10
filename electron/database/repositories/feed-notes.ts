import { dbg } from '../../lib/debug';
import { db } from '../index';
import type { NewFeedNoteRow, UpdateFeedNoteRow } from '../schema';

export const FeedNoteRepository = {
  findAll: () =>
    db
      .selectFrom('feed_notes')
      .selectAll()
      .orderBy('sortOrder', 'asc')
      .execute(),

  create: async (data: Pick<NewFeedNoteRow, 'content'>) => {
    dbg.db('feedNotes.create');

    return db.transaction().execute(async (trx) => {
      const last = await trx
        .selectFrom('feed_notes')
        .select('sortOrder')
        .orderBy('sortOrder', 'desc')
        .executeTakeFirst();

      const sortOrder = (last?.sortOrder ?? -1) + 1;
      const now = new Date().toISOString();

      return trx
        .insertInto('feed_notes')
        .values({ content: data.content, sortOrder, updatedAt: now })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  update: (id: string, data: UpdateFeedNoteRow) => {
    dbg.db('feedNotes.update id=%s', id);
    return db
      .updateTable('feed_notes')
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  delete: (id: string) => {
    dbg.db('feedNotes.delete id=%s', id);
    return db.deleteFrom('feed_notes').where('id', '=', id).execute();
  },
};
