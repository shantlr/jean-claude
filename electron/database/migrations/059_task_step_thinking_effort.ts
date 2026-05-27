import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('task_steps')
    .addColumn('thinkingEffort', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('task_steps')
    .dropColumn('thinkingEffort')
    .execute();
}
