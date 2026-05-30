import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('logoPath', 'text')
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('logoSource', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('logoSource').execute();
  await db.schema.alterTable('projects').dropColumn('logoPath').execute();
}
