import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';
import * as m002 from './migrations/002_project_color';
import * as m003 from './migrations/003_task_read_at';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
  '003_task_read_at': m003,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
