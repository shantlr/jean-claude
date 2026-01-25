import { join } from 'path';

import Database from 'better-sqlite3';
import { app } from 'electron';
import { Kysely, Migrator, SqliteDialect } from 'kysely';

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
      console.log(`Migration "${result.migrationName}" executed successfully`);
    } else if (result.status === 'Error') {
      console.error(`Migration "${result.migrationName}" failed`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}
