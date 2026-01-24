import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  // to change the default value from 'ask' to 'plan'
  //
  // IMPORTANT: We use a transaction and disable foreign keys to:
  // 1. Ensure atomicity (all or nothing)
  // 2. Prevent CASCADE deletes from wiping related tables (e.g., agent_messages)
  await db.transaction().execute(async (trx) => {
    // Disable FK constraints to prevent cascade deletes when dropping the old table
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);
    await sql`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        sessionId TEXT,
        worktreePath TEXT,
        startCommitHash TEXT,
        readAt TEXT,
        lastReadIndex INTEGER NOT NULL DEFAULT 0,
        interactionMode TEXT NOT NULL DEFAULT 'plan',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `.execute(trx);

    await sql`
      INSERT INTO tasks_new (id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, interactionMode, createdAt, updatedAt)
      SELECT id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, COALESCE(interactionMode, 'plan'), createdAt, updatedAt
      FROM tasks
    `.execute(trx);

    await sql`DROP TABLE tasks`.execute(trx);
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    // Re-enable FK constraints
    await sql`PRAGMA foreign_keys = ON`.execute(trx);

    // Verify FK integrity after migration
    const fkCheck = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation after migration: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Revert default back to 'ask'
  await db.transaction().execute(async (trx) => {
    await sql`PRAGMA foreign_keys = OFF`.execute(trx);

    await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);
    await sql`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY NOT NULL,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        sessionId TEXT,
        worktreePath TEXT,
        startCommitHash TEXT,
        readAt TEXT,
        lastReadIndex INTEGER NOT NULL DEFAULT 0,
        interactionMode TEXT NOT NULL DEFAULT 'ask',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `.execute(trx);

    await sql`
      INSERT INTO tasks_new (id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, interactionMode, createdAt, updatedAt)
      SELECT id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, COALESCE(interactionMode, 'ask'), createdAt, updatedAt
      FROM tasks
    `.execute(trx);

    await sql`DROP TABLE tasks`.execute(trx);
    await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);

    await sql`PRAGMA foreign_keys = ON`.execute(trx);

    const fkCheck = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(trx);
    if (fkCheck.rows.length > 0) {
      throw new Error(`Foreign key violation after migration: ${JSON.stringify(fkCheck.rows)}`);
    }
  });
}
