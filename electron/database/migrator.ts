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
import * as m018 from './migrations/018_tokens_and_providers_rework';
import * as m019 from './migrations/019_project_commands';
import * as m020 from './migrations/020_provider_integration';
import * as m021 from './migrations/021_mcp_templates';
import * as m022 from './migrations/022_task_source_branch';
import * as m023 from './migrations/023_add_task_summaries';
import * as m024 from './migrations/024_multi_work_items';
import * as m025 from './migrations/025_task_model_preference';
import * as m026 from './migrations/026_agent_backend_abstraction';
import * as m027 from './migrations/027_task_pending_message';
import * as m028 from './migrations/028_v2_normalization';
import * as m029 from './migrations/029_project_todos';
import * as m030 from './migrations/030_replace_lastreadindex_with_hasunread';
import * as m031 from './migrations/031_project_completion_context';
import * as m032 from './migrations/032_task_steps';
import * as m033 from './migrations/033_completion_usage';
import * as m034 from './migrations/034_rename_session_rules';
import * as m035 from './migrations/035_restore_tasks_id_default';
import * as m036 from './migrations/036_task_step_auto_start';
import * as m037 from './migrations/037_project_priority';
import * as m038 from './migrations/038_feed_notes';
import * as m039 from './migrations/039_command_confirm_before_run';
import * as m040 from './migrations/040_pr_view_snapshots';
import * as m041 from './migrations/041_notifications';
import * as m042 from './migrations/042_tracked_pipelines';
import * as m043 from './migrations/043_project_show_work_items_in_feed';
import * as m044 from './migrations/044_project_show_prs_in_feed';
import * as m045 from './migrations/045_tracked_pipeline_visible';
import * as m046 from './migrations/046_project_ai_skill_slots';
import * as m047 from './migrations/047_task_type';
import * as m048 from './migrations/048_project_protected_branches';

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
  '018_tokens_and_providers_rework': m018,
  '019_project_commands': m019,
  '020_provider_integration': m020,
  '021_mcp_templates': m021,
  '022_task_source_branch': m022,
  '023_add_task_summaries': m023,
  '024_multi_work_items': m024,
  '025_task_model_preference': m025,
  '026_agent_backend_abstraction': m026,
  '027_task_pending_message': m027,
  '028_v2_normalization': m028,
  '029_project_todos': m029,
  '030_replace_lastreadindex_with_hasunread': m030,
  '031_project_completion_context': m031,
  '032_task_steps': m032,
  '033_completion_usage': m033,
  '034_rename_session_rules': m034,
  '035_restore_tasks_id_default': m035,
  '036_task_step_auto_start': m036,
  '037_project_priority': m037,
  '038_feed_notes': m038,
  '039_command_confirm_before_run': m039,
  '040_pr_view_snapshots': m040,
  '041_notifications': m041,
  '042_tracked_pipelines': m042,
  '043_project_show_work_items_in_feed': m043,
  '044_project_show_prs_in_feed': m044,
  '045_tracked_pipeline_visible': m045,
  '046_project_ai_skill_slots': m046,
  '047_task_type': m047,
  '048_project_protected_branches': m048,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
