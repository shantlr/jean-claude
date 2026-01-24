import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  // to change the default value from 'ask' to 'plan'
  await sql`DROP TABLE IF EXISTS tasks_new`.execute(db);
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
  `.execute(db);

  await sql`
    INSERT INTO tasks_new (id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, interactionMode, createdAt, updatedAt)
    SELECT id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, COALESCE(interactionMode, 'plan'), createdAt, updatedAt
    FROM tasks
  `.execute(db);

  await sql`DROP TABLE tasks`.execute(db);
  await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Revert default back to 'ask'
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
  `.execute(db);

  await sql`
    INSERT INTO tasks_new (id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, interactionMode, createdAt, updatedAt)
    SELECT id, projectId, name, prompt, status, sessionId, worktreePath, startCommitHash, readAt, lastReadIndex, COALESCE(interactionMode, 'ask'), createdAt, updatedAt
    FROM tasks
  `.execute(db);

  await sql`DROP TABLE tasks`.execute(db);
  await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(db);
}
