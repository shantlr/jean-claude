import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('mcp_templates')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('commandTemplate', 'text', (col) => col.notNull())
    .addColumn('variables', 'text', (col) => col.notNull()) // JSON string
    .addColumn('installOnCreateWorktree', 'integer', (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn('presetId', 'text')
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('project_mcp_overrides')
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('mcpTemplateId', 'text', (col) =>
      col.notNull().references('mcp_templates.id').onDelete('cascade'),
    )
    .addColumn('enabled', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_project_mcp', ['projectId', 'mcpTemplateId'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_mcp_overrides').execute();
  await db.schema.dropTable('mcp_templates').execute();
}
