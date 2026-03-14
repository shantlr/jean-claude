import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('showPrsInFeed', 'integer', (col) => col.notNull().defaultTo(1))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('showPrsInFeed').execute();
}
