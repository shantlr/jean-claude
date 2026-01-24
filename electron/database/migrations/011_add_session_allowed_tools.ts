import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('sessionAllowedTools', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('sessionAllowedTools').execute();
}
