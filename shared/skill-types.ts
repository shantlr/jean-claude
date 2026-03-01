// Skill-related types shared between main and renderer processes

import type { AgentBackendType } from './agent-backend-types';

/** Read-only skill discovered from filesystem (used by existing message timeline) */
export interface Skill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
}

/** Skill with management metadata */
export interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  skillPath: string;
  enabled: boolean;
  backendType: AgentBackendType;
  editable: boolean;
}

/** Filesystem path config for a backend's skill directories */
export interface AgentSkillPathConfig {
  userSkillsDir: string;
  projectSkillsDir?: string; // relative to project root
  pluginSkillsDir?: string;
}

export type SkillScope = 'user' | 'project';
