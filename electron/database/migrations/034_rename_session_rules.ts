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

function normalizeLegacyPermissionEntry(
  entry: string,
): { tool: string; pattern: string | null } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  // Legacy Claude format: Bash(git status)
  if (trimmed.startsWith('Bash(') && trimmed.endsWith(')')) {
    const command = trimmed.slice(5, -1).trim();
    return command ? { tool: 'bash', pattern: command } : null;
  }

  // Canonical intermediate format: tool:pattern
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const tool = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const pattern = trimmed.slice(colonIdx + 1).trim();
    return {
      tool,
      pattern: pattern || null,
    };
  }

  // Legacy Claude tool names were PascalCase; normalize to lowercase tool keys.
  const toolMap: Record<string, string> = {
    Read: 'read',
    Edit: 'edit',
    Write: 'write',
    Glob: 'glob',
    Grep: 'grep',
    WebFetch: 'webfetch',
    WebSearch: 'websearch',
    Task: 'task',
    TodoWrite: 'todowrite',
    Skill: 'skill',
  };

  return {
    tool: toolMap[trimmed] ?? trimmed.toLowerCase(),
    pattern: null,
  };
}

/**
 * Rename the `sessionAllowedTools` column to `sessionRules` on the tasks table
 * and migrate the stored data format from a flat `string[]` of canonical permission
 * strings (e.g. `["bash:git status", "read"]`) to a `PermissionScope` JSON object
 * (e.g. `{"bash": {"git status": "allow"}, "read": "allow"}`).
 *
 * SQLite doesn't support ALTER COLUMN, so we recreate the tasks table.
 * The sessions have FK references from agent_messages and raw_messages with ON DELETE CASCADE,
 * so we must disable FK constraints during the recreation to avoid cascade-deleting child rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const baselineViolations = await loadForeignKeyViolationKeys(db);

  // Read all tasks with their old sessionAllowedTools values before recreating the table
  const tasks = await db
    .selectFrom('tasks' as never)
    .select(['id', 'sessionAllowedTools'] as never[])
    .execute();

  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.transaction().execute(async (trx) => {
      // Create new tasks table with sessionRules instead of sessionAllowedTools.
      // We copy the full DDL from migration 033 and swap the column name.
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

      // Copy all columns except sessionAllowedTools; that column is handled separately
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
        userCompleted, NULL, sortOrder, workItemIds,
        workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
        createdAt, updatedAt
      FROM tasks
    `.execute(trx);

      // Convert old sessionAllowedTools string[] -> sessionRules JSON while both
      // old/new tables exist, so the full migration remains atomic.
      for (const task of tasks as Array<{
        id: string;
        sessionAllowedTools: string | null;
      }>) {
        if (!task.sessionAllowedTools) continue;

        let oldTools: string[];
        try {
          oldTools = JSON.parse(task.sessionAllowedTools);
        } catch {
          continue;
        }

        if (!Array.isArray(oldTools) || oldTools.length === 0) continue;

        const scope: Record<string, string | Record<string, string>> = {};
        for (const entry of oldTools) {
          const normalized = normalizeLegacyPermissionEntry(entry);
          if (!normalized) continue;

          if (!normalized.pattern) {
            scope[normalized.tool] = 'allow';
            continue;
          }

          const existing = scope[normalized.tool];
          if (typeof existing === 'object' && existing !== null) {
            existing[normalized.pattern] = 'allow';
          } else {
            scope[normalized.tool] = { [normalized.pattern]: 'allow' };
          }
        }

        await sql`UPDATE tasks_new SET sessionRules = ${JSON.stringify(scope)} WHERE id = ${task.id}`.execute(
          trx,
        );
      }

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
        sessionAllowedTools TEXT,
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
        userCompleted, sessionAllowedTools, sortOrder, workItemIds,
        workItemUrls, pullRequestId, pullRequestUrl, pendingMessage,
        createdAt, updatedAt
      )
      SELECT
        id, projectId, name, prompt, status, worktreePath,
        startCommitHash, sourceBranch, branchName, hasUnread,
        userCompleted, NULL, sortOrder, workItemIds,
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
