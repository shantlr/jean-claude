import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('task_summaries')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('taskId', 'text', (col) =>
      col.notNull().references('tasks.id').onDelete('cascade'),
    )
    .addColumn('commitHash', 'text', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('annotations', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addUniqueConstraint('task_summaries_task_commit_unique', [
      'taskId',
      'commitHash',
    ])
    .execute();

  // Index for efficient querying by task
  await db.schema
    .createIndex('task_summaries_task_idx')
    .on('task_summaries')
    .columns(['taskId'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('task_summaries').execute();
}
