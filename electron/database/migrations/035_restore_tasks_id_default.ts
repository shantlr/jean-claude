import { Kysely, sql } from 'kysely';

function fkViolationKey(row: {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
}): string {
  return `${row.table}:${row.rowid}:${row.parent}:${row.fkid}`;
}

async function loadForeignKeyViolationKeys(
  db: Kysely<unknown>,
): Promise<Set<string>> {
  const result = await sql<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>`PRAGMA foreign_key_check`.execute(db);
  return new Set(result.rows.map((row) => fkViolationKey(row)));
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const baselineViolations = await loadForeignKeyViolationKeys(db);

  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.transaction().execute(async (trx) => {
      await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);
      await sql`
        CREATE TABLE tasks_new (
          id TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting',
          worktreePath TEXT,
          startCommitHash TEXT,
          sourceBranch TEXT,
          branchName TEXT,
          hasUnread INTEGER NOT NULL DEFAULT 0,
          userCompleted INTEGER NOT NULL DEFAULT 0,
          sessionRules TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          workItemIds TEXT,
          workItemUrls TEXT,
          pullRequestId TEXT,
          pullRequestUrl TEXT,
          pendingMessage TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL
        )
      `.execute(trx);

      await sql`
        INSERT INTO tasks_new (
          id, projectId, name, prompt, status, worktreePath,
          startCommitHash, sourceBranch, branchName, hasUnread,
          userCompleted, sessionRules, sortOrder, workItemIds,
          workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
          createdAt, updatedAt
        )
        SELECT
          id, projectId, name, prompt, status, worktreePath,
          startCommitHash, sourceBranch, branchName, hasUnread,
          userCompleted, sessionRules, sortOrder, workItemIds,
          workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
          createdAt, updatedAt
        FROM tasks
      `.execute(trx);

      await trx.schema.dropTable('tasks').execute();
      await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);
    });
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }

  const afterViolations = await sql<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>`PRAGMA foreign_key_check`.execute(db);
  const newViolations = afterViolations.rows.filter(
    (row) => !baselineViolations.has(fkViolationKey(row)),
  );
  if (newViolations.length > 0) {
    throw new Error(
      `Foreign key violation after migration: ${JSON.stringify(newViolations)}`,
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const baselineViolations = await loadForeignKeyViolationKeys(db);

  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.transaction().execute(async (trx) => {
      await sql`DROP TABLE IF EXISTS tasks_new`.execute(trx);
      await sql`
        CREATE TABLE tasks_new (
          id TEXT NOT NULL PRIMARY KEY,
          projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting',
          worktreePath TEXT,
          startCommitHash TEXT,
          sourceBranch TEXT,
          branchName TEXT,
          hasUnread INTEGER NOT NULL DEFAULT 0,
          userCompleted INTEGER NOT NULL DEFAULT 0,
          sessionRules TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          workItemIds TEXT,
          workItemUrls TEXT,
          pullRequestId TEXT,
          pullRequestUrl TEXT,
          pendingMessage TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL
        )
      `.execute(trx);

      await sql`
        INSERT INTO tasks_new (
          id, projectId, name, prompt, status, worktreePath,
          startCommitHash, sourceBranch, branchName, hasUnread,
          userCompleted, sessionRules, sortOrder, workItemIds,
          workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
          createdAt, updatedAt
        )
        SELECT
          id, projectId, name, prompt, status, worktreePath,
          startCommitHash, sourceBranch, branchName, hasUnread,
          userCompleted, sessionRules, sortOrder, workItemIds,
          workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
          createdAt, updatedAt
        FROM tasks
      `.execute(trx);

      await trx.schema.dropTable('tasks').execute();
      await sql`ALTER TABLE tasks_new RENAME TO tasks`.execute(trx);
    });
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }

  const afterViolations = await sql<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>`PRAGMA foreign_key_check`.execute(db);
  const newViolations = afterViolations.rows.filter(
    (row) => !baselineViolations.has(fkViolationKey(row)),
  );
  if (newViolations.length > 0) {
    throw new Error(
      `Foreign key violation after migration rollback: ${JSON.stringify(newViolations)}`,
    );
  }
}
