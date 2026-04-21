import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new per-source priority columns
  await db.schema
    .alterTable('projects')
    .addColumn('prPriority', 'text', (col) => col.notNull().defaultTo('normal'))
    .execute();
  await db.schema
    .alterTable('projects')
    .addColumn('workItemPriority', 'text', (col) =>
      col.notNull().defaultTo('normal'),
    )
    .execute();

  // Initialize from old priority value
  await sql`UPDATE projects SET prPriority = priority, workItemPriority = priority`.execute(
    db,
  );

  // Drop old priority column
  await db.schema.alterTable('projects').dropColumn('priority').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add old priority column
  await db.schema
    .alterTable('projects')
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('normal'))
    .execute();

  // Copy prPriority back to priority
  await sql`UPDATE projects SET priority = prPriority`.execute(db);

  // Drop new columns
  await db.schema.alterTable('projects').dropColumn('prPriority').execute();
  await db.schema
    .alterTable('projects')
    .dropColumn('workItemPriority')
    .execute();
}
