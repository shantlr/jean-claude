import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('pr_view_snapshots')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('pullRequestId', 'text', (col) => col.notNull())
    .addColumn('lastViewedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('lastCommitDate', 'text')
    .addColumn('lastThreadActivityDate', 'text')
    .addColumn('activeThreadCount', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  await db.schema
    .createIndex('idx_pr_view_snapshots_project_pr')
    .on('pr_view_snapshots')
    .columns(['projectId', 'pullRequestId'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pr_view_snapshots').execute();
}
