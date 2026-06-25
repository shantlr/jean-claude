import { join } from 'path';

import { Kysely, Migrator, sql, SqliteDialect } from 'kysely';
import { app } from 'electron';
import Database from 'better-sqlite3';

import type { PromptPrefaceEntry } from '@shared/prompt-preface-types';



import { dbg } from '../lib/debug';

import { Database as DatabaseSchema } from './schema';
import { migrationProvider } from './migrator';


const defaultDbPath = join(app.getPath('userData'), 'jean-claude.db');
const dbPath = process.env.JEAN_CLAUDE_DB_PATH || defaultDbPath;

dbg.main('Using database at: %s', dbPath);

const client = new Database(dbPath);
client.pragma('journal_mode = WAL');

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: client,
  }),
});

export async function migrateDatabase() {
  const migrator = new Migrator({
    db,
    provider: migrationProvider,
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      dbg.dbMigration(
        'Migration "%s" executed successfully',
        result.migrationName,
      );
    } else if (result.status === 'Error') {
      dbg.dbMigration('Migration "%s" failed', result.migrationName);
    }
  });

  if (error) {
    dbg.dbMigration('Migration failed: %O', error);
    throw error;
  }

  await ensureRunCommandEnvVarsSchema();

  // Post-migration: re-normalize all tasks after v2 schema change
  const v2Applied = results?.some(
    (r) => r.migrationName === '028_v2_normalization' && r.status === 'Success',
  );

  if (v2Applied) {
    dbg.dbMigration(
      'Post-migration: re-normalizing all tasks with v2 normalizer...',
    );
    await reprocessAllTasksAfterV2Migration();
    dbg.dbMigration('Post-migration: v2 re-normalization complete');
  }

  const rawCompressionApplied = results?.some(
    (r) =>
      r.migrationName === '065_compress_raw_messages' && r.status === 'Success',
  );

  if (rawCompressionApplied) {
    dbg.dbMigration('Post-migration: vacuuming compressed raw messages...');
    await sql`PRAGMA wal_checkpoint(TRUNCATE)`.execute(db);
    await sql`VACUUM`.execute(db);
    await sql`PRAGMA wal_checkpoint(TRUNCATE)`.execute(db);
    dbg.dbMigration('Post-migration: raw message vacuum complete');
  }

  const promptPrefaceMigrationApplied = results?.some(
    (r) =>
      r.migrationName === '070_migrate_prompt_preface_array' &&
      r.status === 'Success',
  );

  if (promptPrefaceMigrationApplied) {
    await migrateProjectPromptPrefaces();
  }
}

async function getTableColumnNames(tableName: string): Promise<Set<string>> {
  const result = await sql<{
    name: string;
  }>`PRAGMA table_info(${sql.raw(tableName)})`.execute(db);
  return new Set(result.rows.map((row) => row.name));
}

function migrateRunCommandEnvVarNames(value: string | null): string {
  if (!value) return '[]';

  try {
    const legacy = JSON.parse(value) as Record<string, unknown>;
    return JSON.stringify(
      ['taskName', 'projectName', 'availablePort']
        .map((source) => ({
          source,
          name: typeof legacy[source] === 'string' ? legacy[source].trim() : '',
        }))
        .filter((envVar) => envVar.name.length > 0),
    );
  } catch {
    return '[]';
  }
}

function hasExistingRunCommandEnvVars(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown[];
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

async function ensureRunCommandEnvVarsSchema(): Promise<void> {
  const columns = await getTableColumnNames('project_commands');

  if (!columns.has('envVars')) {
    await db.schema
      .alterTable('project_commands')
      .addColumn('envVars', 'text', (col) => col.defaultTo('[]').notNull())
      .execute();
  }

  if (!columns.has('envVarNames')) {
    return;
  }

  const rows = await sql<{
    id: string;
    envVarNames: string | null;
    envVars: string | null;
  }>`SELECT id, envVarNames, envVars FROM project_commands`.execute(db);

  for (const row of rows.rows) {
    if (hasExistingRunCommandEnvVars(row.envVars)) continue;

    await sql`UPDATE project_commands SET envVars = ${migrateRunCommandEnvVarNames(
      row.envVarNames,
    )} WHERE id = ${row.id}`.execute(db);
  }
}

async function getGlobalPromptPrefaceEntries(): Promise<PromptPrefaceEntry[]> {
  const row = await db
    .selectFrom('settings')
    .select('value')
    .where('key', '=', 'promptPreface')
    .executeTakeFirst();

  if (!row) return [];

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as PromptPrefaceEntry[]) : [];
  } catch {
    return [];
  }
}

async function migrateProjectPromptPrefaces(): Promise<void> {
  const { migrateProjectPromptPreface } = await import(
    '../services/permission-settings-service'
  );
  const globalEntries = await getGlobalPromptPrefaceEntries();
  const projects = await db.selectFrom('projects').select('path').execute();
  let migratedCount = 0;

  for (const project of projects) {
    try {
      if (await migrateProjectPromptPreface(project.path, globalEntries)) {
        migratedCount += 1;
      }
    } catch (error) {
      dbg.dbMigration(
        'Failed to migrate project prompt preface for %s: %O',
        project.path,
        error,
      );
    }
  }

  dbg.dbMigration(
    'Post-migration: migrated %d project prompt preface settings',
    migratedCount,
  );
}

/**
 * After migration 028 creates the new empty agent_messages table,
 * re-normalize all raw_messages and create synthetic user-prompt entries
 * from each task's original prompt.
 */
async function reprocessAllTasksAfterV2Migration() {
  // Dynamic import to avoid circular dependency (repositories import db from this file)
  const { AgentMessageRepository } =
    await import('./repositories/agent-messages');
  const { nanoid } = await import('nanoid');

  // Get all task IDs that have raw_messages
  const taskRows = await db
    .selectFrom('raw_messages')
    .select('taskId')
    .groupBy('taskId')
    .execute();

  dbg.dbMigration('Re-normalizing %d tasks...', taskRows.length);

  for (const { taskId } of taskRows) {
    // Re-normalize from raw_messages → new flat entries
    const count = await AgentMessageRepository.reprocessNormalization(taskId);
    dbg.dbMigration('  Task %s: %d entries from raw messages', taskId, count);

    // Create a synthetic user-prompt entry from the task's original prompt.
    // The old system didn't store user prompts as separate entries; the v2
    // system does via persistAndEmitSyntheticEntry. Without this, the
    // conversation starts with the agent's response (missing the user input).
    const task = await db
      .selectFrom('tasks')
      .select(['prompt', 'createdAt'])
      .where('id', '=', taskId)
      .executeTakeFirst();

    if (task?.prompt && count > 0) {
      // Shift all existing entries to make room for user-prompt at index 0
      await sql`UPDATE agent_messages SET messageIndex = messageIndex + 1 WHERE taskId = ${taskId}`.execute(
        db,
      );

      await AgentMessageRepository.create({
        taskId,
        messageIndex: 0,
        entry: {
          id: nanoid(),
          date: task.createdAt,
          isSynthetic: true,
          type: 'user-prompt',
          value: task.prompt,
        },
        rawMessageId: null,
      });
    }
  }
}
