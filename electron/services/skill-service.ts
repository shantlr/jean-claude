import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { dbg } from '../lib/debug';
import { isEnoent } from '../lib/fs';

export interface ParsedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/**
 * Parse YAML frontmatter from a SKILL.md file content.
 * Frontmatter is delimited by --- at the start and end.
 */

function parseFrontmatter(content: string): SkillFrontmatter {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter: SkillFrontmatter = {};
  const lines = frontmatterMatch[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === 'name') {
      frontmatter.name = value;
    } else if (key === 'description') {
      frontmatter.description = value;
    }
  }

  return frontmatter;
}

/**
 * Read and parse a SKILL.md file.
 */
async function parseSkillFile(
  skillDir: string,
  source: 'user' | 'project' | 'plugin',
  pluginName?: string,
): Promise<ParsedSkill | null> {
  const skillFilePath = path.join(skillDir, 'SKILL.md');

  try {
    const content = await fs.readFile(skillFilePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    // Use frontmatter name or fall back to directory name
    const name = frontmatter.name || path.basename(skillDir);
    const description = frontmatter.description || '';

    return {
      name,
      description,
      source,
      pluginName,
      skillPath: skillDir,
    };
  } catch (error) {
    if (isEnoent(error)) {
      dbg.skill('No SKILL.md found at %s', skillFilePath);
    } else {
      dbg.skill('Failed to parse skill at %s: %O', skillDir, error);
    }
    return null;
  }
}

/**
 * Get all skills from the user's ~/.claude/skills directory.
 */
async function getUserSkills(): Promise<ParsedSkill[]> {
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const skills: ParsedSkill[] = [];

  try {
    const entries = await fs.readdir(userSkillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(userSkillsDir, entry.name);

      // Resolve symlinks to get actual path
      let resolvedPath = skillDir;
      try {
        resolvedPath = await fs.realpath(skillDir);
      } catch {
        // If symlink is broken, skip
        continue;
      }

      const skill = await parseSkillFile(resolvedPath, 'user');
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error) {
    if (isEnoent(error)) {
      dbg.skill('No user skills directory found at %s', userSkillsDir);
    } else {
      dbg.skill(
        'Error reading user skills directory at %s: %O',
        userSkillsDir,
        error,
      );
    }
  }

  return skills;
}

/**
 * Get all skills from a project's .claude/skills directory.
 */
async function getProjectSkills(projectPath: string): Promise<ParsedSkill[]> {
  const projectSkillsDir = path.join(projectPath, '.claude', 'skills');
  const skills: ParsedSkill[] = [];

  try {
    const entries = await fs.readdir(projectSkillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(projectSkillsDir, entry.name);

      // Resolve symlinks
      let resolvedPath = skillDir;
      try {
        resolvedPath = await fs.realpath(skillDir);
      } catch {
        continue;
      }

      const skill = await parseSkillFile(resolvedPath, 'project');
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error) {
    if (isEnoent(error)) {
      dbg.skill('No project skills directory found at %s', projectSkillsDir);
    } else {
      dbg.skill(
        'Error reading project skills directory at %s: %O',
        projectSkillsDir,
        error,
      );
    }
  }

  return skills;
}

/**
 * Get all skills from installed plugins in ~/.claude/plugins/cache.
 */
async function getPluginSkills(): Promise<ParsedSkill[]> {
  const pluginsCacheDir = path.join(
    os.homedir(),
    '.claude',
    'plugins',
    'cache',
  );
  const skills: ParsedSkill[] = [];

  try {
    // Structure: ~/.claude/plugins/cache/<package-name>/<plugin-name>/<version>/skills/<skill-name>/
    const packageDirs = await fs.readdir(pluginsCacheDir, {
      withFileTypes: true,
    });

    for (const packageDir of packageDirs) {
      if (!packageDir.isDirectory()) continue;

      const packagePath = path.join(pluginsCacheDir, packageDir.name);
      const pluginDirs = await fs.readdir(packagePath, { withFileTypes: true });

      for (const pluginDir of pluginDirs) {
        if (!pluginDir.isDirectory()) continue;

        const pluginPath = path.join(packagePath, pluginDir.name);
        const versionDirs = await fs.readdir(pluginPath, {
          withFileTypes: true,
        });

        for (const versionDir of versionDirs) {
          if (!versionDir.isDirectory()) continue;

          const skillsPath = path.join(pluginPath, versionDir.name, 'skills');

          try {
            const skillDirs = await fs.readdir(skillsPath, {
              withFileTypes: true,
            });

            for (const skillDir of skillDirs) {
              if (!skillDir.isDirectory()) continue;

              const skillPath = path.join(skillsPath, skillDir.name);
              const skill = await parseSkillFile(
                skillPath,
                'plugin',
                pluginDir.name,
              );
              if (skill) {
                skills.push(skill);
              }
            }
          } catch (error) {
            // No skills directory in this plugin version — expected for most plugins
            if (!isEnoent(error)) {
              dbg.skill(
                'Error reading plugin skills directory at %s: %O',
                skillsPath,
                error,
              );
            }
          }
        }
      }
    }
  } catch (error) {
    if (isEnoent(error)) {
      dbg.skill('No plugins cache directory found at %s', pluginsCacheDir);
    } else {
      dbg.skill(
        'Error reading plugins cache directory at %s: %O',
        pluginsCacheDir,
        error,
      );
    }
  }

  return skills;
}

/**
 * Get all available skills for a project.
 * Combines user skills, project skills, and plugin skills.
 * Deduplicates by name, with priority: project > user > plugin.
 */
export async function getAllSkills(
  projectPath: string,
): Promise<ParsedSkill[]> {
  const [userSkills, projectSkills, pluginSkills] = await Promise.all([
    getUserSkills(),
    getProjectSkills(projectPath),
    getPluginSkills(),
  ]);

  // Combine all skills, project skills take priority over user, which take priority over plugin
  const skillMap = new Map<string, ParsedSkill>();

  // Add plugin skills first (lowest priority)
  for (const skill of pluginSkills) {
    skillMap.set(skill.name, skill);
  }

  // Add user skills (medium priority)
  for (const skill of userSkills) {
    skillMap.set(skill.name, skill);
  }

  // Add project skills (highest priority)
  for (const skill of projectSkills) {
    skillMap.set(skill.name, skill);
  }

  // Sort by name
  return Array.from(skillMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
