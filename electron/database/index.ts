import { join } from 'path';

import Database from 'better-sqlite3';
import { app } from 'electron';
import { Kysely, Migrator, SqliteDialect, sql } from 'kysely';

import { dbg } from '../lib/debug';

import { migrationProvider } from './migrator';
import { Database as DatabaseSchema } from './schema';

const defaultDbPath = join(app.getPath('userData'), 'jean-claude.db');
const dbPath = process.env.JEAN_CLAUDE_DB_PATH || defaultDbPath;

dbg.main('Using database at: %s', dbPath);

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: new Database(dbPath),
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
