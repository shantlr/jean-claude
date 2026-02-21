import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('hasUnread', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema.alterTable('tasks').dropColumn('lastReadIndex').execute();
  await db.schema.alterTable('tasks').dropColumn('readAt').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('lastReadIndex', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema.alterTable('tasks').addColumn('readAt', 'text').execute();

  await db.schema.alterTable('tasks').dropColumn('hasUnread').execute();
}
