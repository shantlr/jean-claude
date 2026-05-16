import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('usage_snapshots')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('limitKey', 'text', (col) => col.notNull())
    .addColumn('utilization', 'real', (col) => col.notNull())
    .addColumn('resetsAt', 'text', (col) => col.notNull())
    .addColumn('recordedAt', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_usage_snapshots_lookup')
    .on('usage_snapshots')
    .columns(['provider', 'limitKey', 'recordedAt'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('usage_snapshots').execute();
}
