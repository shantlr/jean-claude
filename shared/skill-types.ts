// Skill-related types shared between main and renderer processes

import type { AgentBackendType } from './agent-backend-types';

/** Skill with management metadata */
export interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
  /** Per-backend enabled status. Key present = backend is relevant; value = enabled. */
  enabledBackends: Partial<Record<AgentBackendType, boolean>>;
  editable: boolean;
}

/** Read-only skill subset exposed to the renderer for display */
export type Skill = Pick<
  ManagedSkill,
  'name' | 'description' | 'source' | 'pluginName' | 'skillPath'
>;

/** Filesystem path config for a backend's skill directories */
export interface AgentSkillPathConfig {
  userSkillsDir: string;
  projectSkillsDir?: string; // relative to project root
  /** Optional function to discover additional skills (e.g., active plugins) */
  discoverExternalSkills?: () => Promise<ManagedSkill[]>;
}

export type SkillScope = 'user' | 'project';

export type LegacySkillMigrationStatus =
  | 'migrate'
  | 'skip-conflict'
  | 'skip-invalid';

export interface LegacySkillMigrationPreviewItem {
  id: string;
  backendType: AgentBackendType;
  legacyPath: string;
  targetCanonicalPath: string;
  name: string;
  status: LegacySkillMigrationStatus;
  reason?: string;
}

export interface LegacySkillMigrationPreviewResult {
  items: LegacySkillMigrationPreviewItem[];
}

export interface LegacySkillMigrationExecuteItemResult {
  id: string;
  backendType: AgentBackendType;
  legacyPath: string;
  targetCanonicalPath: string;
  name: string;
  status: 'migrated' | 'failed' | 'skipped';
  reason?: string;
}

export interface LegacySkillMigrationExecuteResult {
  results: LegacySkillMigrationExecuteItemResult[];
}

// --- Registry types (skills.sh) ---

/** A skill from the skills.sh search API */
export interface RegistrySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** Search results from skills.sh */
export interface RegistrySearchResult {
  query: string;
  skills: RegistrySkill[];
  count: number;
}

/** Content fetched for a registry skill preview */
export interface RegistrySkillContent {
  name: string;
  description: string;
  content: string;
}
