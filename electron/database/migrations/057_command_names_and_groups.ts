import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('project_commands')
    .addColumn('name', 'text')
    .execute();

  await db.schema
    .createTable('project_command_groups')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('commandIds', 'text', (col) => col.notNull())
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_command_groups').execute();
  await db.schema.alterTable('project_commands').dropColumn('name').execute();
}
