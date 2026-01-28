import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agent_messages')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('taskId', 'text', (col) =>
      col.notNull().references('tasks.id').onDelete('cascade'),
    )
    .addColumn('messageIndex', 'integer', (col) => col.notNull())
    .addColumn('messageType', 'text', (col) => col.notNull())
    .addColumn('messageData', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  // Index for efficient querying by task
  await db.schema
    .createIndex('agent_messages_task_idx')
    .on('agent_messages')
    .columns(['taskId', 'messageIndex'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agent_messages').execute();
}
