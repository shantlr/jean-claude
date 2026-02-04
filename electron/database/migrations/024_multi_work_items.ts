import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new JSON array columns for multiple work items
  await db.schema
    .alterTable('tasks')
    .addColumn('workItemIds', 'text') // JSON array: ["123", "456"]
    .execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('workItemUrls', 'text') // JSON array: ["url1", "url2"]
    .execute();

  // Migrate existing single work item data to arrays
  await sql`
    UPDATE tasks
    SET workItemIds = CASE
      WHEN workItemId IS NOT NULL THEN json_array(workItemId)
      ELSE NULL
    END,
    workItemUrls = CASE
      WHEN workItemUrl IS NOT NULL THEN json_array(workItemUrl)
      ELSE NULL
    END
  `.execute(db);

  // Drop old single-value columns
  await db.schema.alterTable('tasks').dropColumn('workItemId').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemUrl').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add old columns
  await db.schema.alterTable('tasks').addColumn('workItemId', 'text').execute();
  await db.schema
    .alterTable('tasks')
    .addColumn('workItemUrl', 'text')
    .execute();

  // Migrate first item from arrays back to single values
  await sql`
    UPDATE tasks
    SET workItemId = CASE
      WHEN workItemIds IS NOT NULL THEN json_extract(workItemIds, '$[0]')
      ELSE NULL
    END,
    workItemUrl = CASE
      WHEN workItemUrls IS NOT NULL THEN json_extract(workItemUrls, '$[0]')
      ELSE NULL
    END
  `.execute(db);

  // Drop array columns
  await db.schema.alterTable('tasks').dropColumn('workItemUrls').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemIds').execute();
}
