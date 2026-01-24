import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add sortOrder column with default 0
  await db.schema
    .alterTable('projects')
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  // Initialize existing projects with sequential sortOrder based on creation date
  await sql`
    UPDATE projects
    SET sortOrder = (
      SELECT COUNT(*)
      FROM projects p2
      WHERE p2.createdAt < projects.createdAt
         OR (p2.createdAt = projects.createdAt AND p2.id < projects.id)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('sortOrder').execute();
}
