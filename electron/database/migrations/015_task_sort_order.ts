import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add sortOrder column with default 0
  await db.schema
    .alterTable('tasks')
    .addColumn('sortOrder', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();

  // Initialize existing tasks with sequential sortOrder based on creation date (newest first = lowest sortOrder)
  // Within each project, order by createdAt DESC so newest tasks have sortOrder 0
  await sql`
    UPDATE tasks
    SET sortOrder = (
      SELECT COUNT(*)
      FROM tasks t2
      WHERE t2.projectId = tasks.projectId
        AND (t2.createdAt > tasks.createdAt
             OR (t2.createdAt = tasks.createdAt AND t2.id < tasks.id))
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('sortOrder').execute();
}
