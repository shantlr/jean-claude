// Skill-related types shared between main and renderer processes

export interface Skill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
}
