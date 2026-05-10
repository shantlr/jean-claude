import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('parentTaskId', 'text', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .createIndex('idx_tasks_parent_task_id')
    .on('tasks')
    .column('parentTaskId')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_tasks_parent_task_id').execute();
  await db.schema.alterTable('tasks').dropColumn('parentTaskId').execute();
}
