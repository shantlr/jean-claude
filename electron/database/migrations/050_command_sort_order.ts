import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('project_commands')
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  // Initialize existing commands with sequential sortOrder based on creation date
  await sql`
    UPDATE project_commands
    SET sortOrder = (
      SELECT COUNT(*)
      FROM project_commands p2
      WHERE p2.projectId = project_commands.projectId
        AND (p2.createdAt < project_commands.createdAt
          OR (p2.createdAt = project_commands.createdAt AND p2.id < project_commands.id))
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('project_commands')
    .dropColumn('sortOrder')
    .execute();
}
