import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
