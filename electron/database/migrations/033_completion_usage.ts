import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('completion_usage')
    .addColumn('date', 'text', (col) => col.primaryKey())
    .addColumn('promptTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('completionTokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('requests', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('completion_usage').execute();
}
