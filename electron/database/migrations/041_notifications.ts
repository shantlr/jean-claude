import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.references('projects.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('sourceUrl', 'text')
    .addColumn('read', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('meta', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').execute();
}
