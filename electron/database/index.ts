import { join } from 'path';

import Database from 'better-sqlite3';
import { app } from 'electron';
import { Kysely, Migrator, SqliteDialect } from 'kysely';

import { dbg } from '../lib/debug';

import { migrationProvider } from './migrator';
import { Database as DatabaseSchema } from './schema';

const dbPath = join(app.getPath('userData'), 'jean-claude.db');

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
      dbg.dbMigration('Migration "%s" executed successfully', result.migrationName);
    } else if (result.status === 'Error') {
      dbg.dbMigration('Migration "%s" failed', result.migrationName);
    }
  });

  if (error) {
    dbg.dbMigration('Migration failed: %O', error);
    throw error;
  }
}
