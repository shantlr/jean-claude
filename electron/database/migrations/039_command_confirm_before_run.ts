import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('project_commands')
    .addColumn('confirmBeforeRun', 'integer', (col) => col.defaultTo(0))
    .execute();

  await db.schema
    .alterTable('project_commands')
    .addColumn('confirmMessage', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('project_commands')
    .dropColumn('confirmBeforeRun')
    .execute();

  await db.schema
    .alterTable('project_commands')
    .dropColumn('confirmMessage')
    .execute();
}
