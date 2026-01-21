import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';
import * as m002 from './migrations/002_project_color';
import * as m003 from './migrations/003_task_read_at';
import * as m004 from './migrations/004_agent_messages';
import * as m005 from './migrations/005_task_last_read_index';
import * as m006 from './migrations/006_task_interaction_mode';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
  '003_task_read_at': m003,
  '004_agent_messages': m004,
  '005_task_last_read_index': m005,
  '006_task_interaction_mode': m006,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
