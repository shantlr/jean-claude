import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Project repo link columns
  await db.schema.alterTable('projects').addColumn('repoProviderId', 'text').execute();
  await db.schema.alterTable('projects').addColumn('repoProjectId', 'text').execute();
  await db.schema.alterTable('projects').addColumn('repoProjectName', 'text').execute();
  await db.schema.alterTable('projects').addColumn('repoId', 'text').execute();
  await db.schema.alterTable('projects').addColumn('repoName', 'text').execute();

  // Project work items link columns
  await db.schema.alterTable('projects').addColumn('workItemProviderId', 'text').execute();
  await db.schema.alterTable('projects').addColumn('workItemProjectId', 'text').execute();
  await db.schema.alterTable('projects').addColumn('workItemProjectName', 'text').execute();

  // Task work item and PR tracking columns
  await db.schema.alterTable('tasks').addColumn('workItemId', 'text').execute();
  await db.schema.alterTable('tasks').addColumn('workItemUrl', 'text').execute();
  await db.schema.alterTable('tasks').addColumn('pullRequestId', 'text').execute();
  await db.schema.alterTable('tasks').addColumn('pullRequestUrl', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('pullRequestUrl').execute();
  await db.schema.alterTable('tasks').dropColumn('pullRequestId').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemUrl').execute();
  await db.schema.alterTable('tasks').dropColumn('workItemId').execute();

  await db.schema.alterTable('projects').dropColumn('workItemProjectName').execute();
  await db.schema.alterTable('projects').dropColumn('workItemProjectId').execute();
  await db.schema.alterTable('projects').dropColumn('workItemProviderId').execute();

  await db.schema.alterTable('projects').dropColumn('repoName').execute();
  await db.schema.alterTable('projects').dropColumn('repoId').execute();
  await db.schema.alterTable('projects').dropColumn('repoProjectName').execute();
  await db.schema.alterTable('projects').dropColumn('repoProjectId').execute();
  await db.schema.alterTable('projects').dropColumn('repoProviderId').execute();
}
