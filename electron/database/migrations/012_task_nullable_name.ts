import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  // 1. Create new table with nullable name
  await db.schema
    .createTable('tasks_new')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('name', 'text') // Now nullable
    .addColumn('prompt', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('waiting'))
    .addColumn('sessionId', 'text')
    .addColumn('worktreePath', 'text')
    .addColumn('startCommitHash', 'text')
    .addColumn('readAt', 'text')
    .addColumn('lastReadIndex', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('interactionMode', 'text', (col) => col.notNull().defaultTo('plan'))
    .addColumn('userCompleted', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('sessionAllowedTools', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  // 2. Copy data from old table
  await sql`INSERT INTO tasks_new SELECT * FROM tasks`.execute(db);

  // 3. Drop old table
  await db.schema.dropTable('tasks').execute();

  // 4. Rename new table to original name
  await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate table with NOT NULL constraint on name
  await db.schema
    .createTable('tasks_new')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('prompt', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('waiting'))
    .addColumn('sessionId', 'text')
    .addColumn('worktreePath', 'text')
    .addColumn('startCommitHash', 'text')
    .addColumn('readAt', 'text')
    .addColumn('lastReadIndex', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('interactionMode', 'text', (col) => col.notNull().defaultTo('plan'))
    .addColumn('userCompleted', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('sessionAllowedTools', 'text')
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('updatedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .execute();

  // Copy data, using prompt's first line as fallback for null names
  await sql`INSERT INTO tasks_new SELECT
    id, projectId, COALESCE(name, substr(prompt, 1, 50)), prompt, status,
    sessionId, worktreePath, startCommitHash, readAt, lastReadIndex,
    interactionMode, userCompleted, sessionAllowedTools, createdAt, updatedAt
    FROM tasks`.execute(db);

  await db.schema.dropTable('tasks').execute();
  await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(db);
}
