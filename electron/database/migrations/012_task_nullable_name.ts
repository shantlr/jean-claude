import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  //
  // IMPORTANT: We use a transaction and disable foreign keys to:
  // 1. Ensure atomicity (all or nothing)
  // 2. Prevent CASCADE deletes from wiping related tables (e.g., agent_messages)
  await db.transaction().execute(async (trx) => {
    // Disable FK constraints to prevent cascade deletes when dropping the old table
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);

    // 1. Create new table with nullable name
    await trx.schema
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
      .addColumn('lastReadIndex', 'integer', (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn('interactionMode', 'text', (col) =>
        col.notNull().defaultTo('plan'),
      )
      .addColumn('userCompleted', 'integer', (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn('sessionAllowedTools', 'text')
      .addColumn('createdAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .addColumn('updatedAt', 'text', (col) =>
        col.notNull().defaultTo(sql`(datetime('now'))`),
      )
      .execute();

    // 2. Copy data from old table (explicitly list columns to handle different column orders)
    await sql`INSERT INTO tasks_new (
      id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash,
      readAt, lastReadIndex, interactionMode, userCompleted, sessionAllowedTools, createdAt, updatedAt
    ) SELECT
      id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash,
      readAt, lastReadIndex, interactionMode, userCompleted, sessionAllowedTools, createdAt, updatedAt
    FROM tasks`.execute(trx);

    // 3. Drop old table
    await trx.schema.dropTable('tasks').execute();

    // 4. Rename new table to original name
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    // Re-enable FK constraints
    await sql`PRAGMA foreign_keys = ON`.execute(trx);

    // Verify FK integrity after migration
    const fkCheck = await sql<{
      table: string;
    }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(
        `Foreign key violation after migration: ${JSON.stringify(fkCheck.rows)}`,
      );
    }
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);

    // Recreate table with NOT NULL constraint on name
    await trx.schema
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
      .addColumn('lastReadIndex', 'integer', (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn('interactionMode', 'text', (col) =>
        col.notNull().defaultTo('plan'),
      )
      .addColumn('userCompleted', 'integer', (col) =>
        col.notNull().defaultTo(0),
      )
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
      FROM tasks`.execute(trx);

    await trx.schema.dropTable('tasks').execute();
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    await sql`PRAGMA foreign_keys = ON`.execute(trx);

    const fkCheck = await sql<{
      table: string;
    }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(
        `Foreign key violation after migration: ${JSON.stringify(fkCheck.rows)}`,
      );
    }
  });
}
