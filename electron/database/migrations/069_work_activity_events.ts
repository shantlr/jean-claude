import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('work_activity_events')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('occurredAt', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('projectId', 'text')
    .addColumn('projectName', 'text')
    .addColumn('providerId', 'text')
    .addColumn('azureOrgId', 'text')
    .addColumn('azureProjectId', 'text')
    .addColumn('repoId', 'text')
    .addColumn('taskId', 'text')
    .addColumn('taskTitle', 'text')
    .addColumn('stepId', 'text')
    .addColumn('promptSnippet', 'text')
    .addColumn('promptLength', 'integer')
    .addColumn('workItemIdsJson', 'text', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('workItemsJson', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('pullRequestJson', 'text')
    .addColumn('metadataJson', 'text', (col) => col.notNull().defaultTo('{}'))
    .execute();

  await db.schema
    .createIndex('idx_work_activity_events_occurred_at')
    .on('work_activity_events')
    .column('occurredAt')
    .execute();

  await db.schema
    .createIndex('idx_work_activity_events_type')
    .on('work_activity_events')
    .column('type')
    .execute();

  await db.schema
    .createIndex('idx_work_activity_events_project_id')
    .on('work_activity_events')
    .column('projectId')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('work_activity_events').execute();
}
