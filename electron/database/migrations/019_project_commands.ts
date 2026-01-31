import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('project_commands')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('command', 'text', (col) => col.notNull())
    .addColumn('ports', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(new Date().toISOString()),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_commands').execute();
}
