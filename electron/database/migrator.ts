import { Migration, MigrationProvider } from 'kysely';

import * as m001 from './migrations/001_initial';
import * as m002 from './migrations/002_project_color';
import * as m003 from './migrations/003_task_read_at';
import * as m004 from './migrations/004_agent_messages';
import * as m005 from './migrations/005_task_last_read_index';
import * as m006 from './migrations/006_task_interaction_mode';
import * as m007 from './migrations/007_task_interaction_mode_default_plan';
import * as m008 from './migrations/008_settings';
import * as m009 from './migrations/009_task_user_completed';
import * as m011 from './migrations/011_add_session_allowed_tools';
import * as m012 from './migrations/012_task_nullable_name';
import * as m013 from './migrations/013_project_sort_order';
import * as m014 from './migrations/014_project_worktrees_path';
import * as m015 from './migrations/015_task_sort_order';
import * as m016 from './migrations/016_project_default_branch';
import * as m017 from './migrations/017_task_branch_name';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
  '003_task_read_at': m003,
  '004_agent_messages': m004,
  '005_task_last_read_index': m005,
  '006_task_interaction_mode': m006,
  '007_task_interaction_mode_default_plan': m007,
  '008_settings': m008,
  '009_task_user_completed': m009,
  '011_add_session_allowed_tools': m011,
  '012_task_nullable_name': m012,
  '013_project_sort_order': m013,
  '014_project_worktrees_path': m014,
  '015_task_sort_order': m015,
  '016_project_default_branch': m016,
  '017_task_branch_name': m017,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
