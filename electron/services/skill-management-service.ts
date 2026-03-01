import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  AgentSkillPathConfig,
  ManagedSkill,
  SkillScope,
} from '@shared/skill-types';

import { dbg } from '../lib/debug';
import { isEnoent } from '../lib/fs';

// --- Jean-Claude canonical skill storage ---
//
// All JC-managed user skills live under:
//   ~/.config/jean-claude/skills/<backendType>/user/<skillName>/
//
// Backend-expected paths contain symlinks pointing to this canonical location:
//   ~/.claude/skills/<skillName>  →  ~/.config/jean-claude/skills/claude-code/user/<skillName>/
//   ~/.config/opencode/skills/<skillName>  →  ~/.config/jean-claude/skills/opencode/user/<skillName>/
//
// Enable  = create symlink in the backend's skills dir
// Disable = remove the symlink (canonical stays in JC folder, skill is never lost)

const JC_SKILLS_BASE_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'skills',
);

function getJcUserSkillsDir(backendType: AgentBackendType): string {
  return path.join(JC_SKILLS_BASE_DIR, backendType, 'user');
}

// --- Backend path configurations ---

const SKILL_PATH_CONFIGS: Record<AgentBackendType, AgentSkillPathConfig> = {
  'claude-code': {
    userSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
    projectSkillsDir: '.claude/skills',
    pluginSkillsDir: path.join(os.homedir(), '.claude', 'plugins', 'cache'),
  },
  opencode: {
    userSkillsDir: path.join(os.homedir(), '.config', 'opencode', 'skills'),
    projectSkillsDir: undefined,
    pluginSkillsDir: undefined,
  },
};

export function getSkillPathConfig(
  backendType: AgentBackendType,
): AgentSkillPathConfig {
  return SKILL_PATH_CONFIGS[backendType];
}

// --- Symlink helpers ---

/** Returns true if path exists AND is a symbolic link. */
async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Returns true if path exists (via lstat — does not follow symlinks). */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

// --- Frontmatter parsing ---

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === 'name') frontmatter.name = value;
    else if (key === 'description') frontmatter.description = value;
  }

  return frontmatter;
}

function buildSkillMd({
  name,
  description,
  content,
}: {
  name: string;
  description: string;
  content: string;
}): string {
  const lines = ['---'];
  lines.push(`name: ${name}`);
  if (description) lines.push(`description: ${description}`);
  lines.push('---');
  if (content) {
    lines.push('');
    lines.push(content);
  }
  return lines.join('\n') + '\n';
}

// --- Directory scanning ---

async function readSkillDir(
  skillDir: string,
): Promise<{ name: string; description: string } | null> {
  const skillFilePath = path.join(skillDir, 'SKILL.md');
  try {
    const content = await fs.readFile(skillFilePath, 'utf-8');
    const fm = parseFrontmatter(content);
    return {
      name: fm.name || path.basename(skillDir),
      description: fm.description || '',
    };
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Failed to parse skill at %s: %O', skillDir, error);
    }
    return null;
  }
}

async function discoverNestedSkillDirs(baseDir: string): Promise<string[]> {
  const discovered = new Set<string>();
  const visited = new Set<string>();

  const walk = async (dir: string): Promise<void> => {
    if (visited.has(dir)) return;
    visited.add(dir);

    const info = await readSkillDir(dir);
    if (info) {
      discovered.add(dir);
      return;
    }

    let entries: Array<{
      name: string;
      isDirectory: () => boolean;
      isSymbolicLink: () => boolean;
    }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const nestedPath = path.join(dir, entry.name);
      let resolvedPath = nestedPath;
      if (entry.isSymbolicLink()) {
        try {
          resolvedPath = await fs.realpath(nestedPath);
        } catch {
          continue;
        }
      }

      await walk(resolvedPath);
    }
  };

  await walk(baseDir);
  return Array.from(discovered);
}

/**
 * Scans the JC canonical directory for a backend's user skills.
 * For each skill, checks whether a symlink exists in the backend's expected
 * skills directory to determine enabled/disabled status.
 */
async function discoverJcManagedUserSkills(
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const jcDir = getJcUserSkillsDir(backendType);
  const config = SKILL_PATH_CONFIGS[backendType];
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(jcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const canonicalPath = path.join(jcDir, entry.name);
      const info = await readSkillDir(canonicalPath);
      if (!info) continue;

      // Enabled = symlink present in the backend's skills directory
      const symlinkPath = path.join(config.userSkillsDir, entry.name);
      const enabled = await isSymlink(symlinkPath);

      skills.push({
        ...info,
        source: 'user',
        skillPath: canonicalPath,
        enabled,
        backendType,
        editable: true,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading JC user skills dir %s: %O', jcDir, error);
    }
  }

  return skills;
}

/**
 * Scans the backend's expected skills directory for entries that are NOT
 * managed by Jean-Claude. This includes:
 * - Real directories (legacy skills created directly)
 * - Symlinks whose targets are outside the JC canonical directory (externally
 *   created symlinks, e.g. by opencode or the user)
 *
 * JC-managed symlinks (pointing into JC canonical dir) are skipped — they're
 * already covered by `discoverJcManagedUserSkills`.
 */
async function discoverLegacyUserSkills(
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const jcDir = getJcUserSkillsDir(backendType);
  const skills: ManagedSkill[] = [];
  const seenSkillPaths = new Set<string>();

  try {
    const entries = await fs.readdir(config.userSkillsDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(config.userSkillsDir, entry.name);

      // Skip if a JC canonical entry exists for this name (already covered)
      const jcEquivalent = path.join(jcDir, entry.name);
      if (await pathExists(jcEquivalent)) continue;

      // For symlinks, skip JC-managed ones (target inside canonical dir)
      // and resolve to actual path for reading
      let resolvedPath = skillDir;
      if (entry.isSymbolicLink()) {
        try {
          resolvedPath = await fs.realpath(skillDir);
        } catch {
          continue; // broken symlink
        }
        // If symlink points into JC canonical dir, it's JC-managed — skip
        if (resolvedPath.startsWith(jcDir + path.sep)) continue;
      }

      const info = await readSkillDir(resolvedPath);
      if (info) {
        if (seenSkillPaths.has(resolvedPath)) continue;
        seenSkillPaths.add(resolvedPath);

        skills.push({
          ...info,
          source: 'user',
          skillPath: resolvedPath,
          enabled: true,
          backendType,
          editable: false,
        });
        continue;
      }

      if (backendType !== 'opencode') {
        continue;
      }

      const nestedSkillDirs = await discoverNestedSkillDirs(resolvedPath);
      for (const nestedSkillDir of nestedSkillDirs) {
        if (seenSkillPaths.has(nestedSkillDir)) continue;

        const nestedInfo = await readSkillDir(nestedSkillDir);
        if (!nestedInfo) continue;

        const parentFolderName = path.basename(path.dirname(nestedSkillDir));
        const nestedSkillName = parentFolderName
          ? `${parentFolderName}/${nestedInfo.name}`
          : nestedInfo.name;

        seenSkillPaths.add(nestedSkillDir);

        skills.push({
          ...nestedInfo,
          name: nestedSkillName,
          source: 'user',
          skillPath: nestedSkillDir,
          enabled: true,
          backendType,
          editable: false,
        });
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading user skills dir %s: %O',
        config.userSkillsDir,
        error,
      );
    }
  }

  return skills;
}

async function discoverSkillsInDir({
  baseDir,
  source,
  backendType,
  enabled,
  editable,
  pluginName,
}: {
  baseDir: string;
  source: 'user' | 'project' | 'plugin';
  backendType: AgentBackendType;
  enabled: boolean;
  editable: boolean;
  pluginName?: string;
}): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(baseDir, entry.name);
      let resolvedPath = skillDir;
      try {
        resolvedPath = await fs.realpath(skillDir);
      } catch {
        continue; // broken symlink
      }

      const info = await readSkillDir(resolvedPath);
      if (info) {
        skills.push({
          ...info,
          source,
          pluginName,
          skillPath: resolvedPath,
          enabled,
          backendType,
          editable,
        });
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading skills dir %s: %O', baseDir, error);
    }
  }
  return skills;
}

async function discoverPluginSkills(
  pluginsDir: string,
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];
  try {
    const packageDirs = await fs.readdir(pluginsDir, { withFileTypes: true });
    for (const packageDir of packageDirs) {
      if (!packageDir.isDirectory()) continue;
      const packagePath = path.join(pluginsDir, packageDir.name);
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

          const pluginSkills = await discoverSkillsInDir({
            baseDir: skillsPath,
            source: 'plugin',
            backendType,
            enabled: true,
            editable: false,
            pluginName: pluginDir.name,
          });
          skills.push(...pluginSkills);
        }
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading plugins dir %s: %O', pluginsDir, error);
    }
  }
  return skills;
}

// --- Public API ---

export async function getAllManagedSkills({
  backendType,
  projectPath,
}: {
  backendType: AgentBackendType;
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const results: ManagedSkill[] = [];

  // JC-managed user skills: canonical in JC folder, symlinked to backend path
  results.push(...(await discoverJcManagedUserSkills(backendType)));

  // Legacy user skills: directly in backend path, not JC-managed
  results.push(...(await discoverLegacyUserSkills(backendType)));

  // Project skills: in-place in project dir (always enabled)
  if (projectPath && config.projectSkillsDir) {
    const projectSkillsDir = path.join(projectPath, config.projectSkillsDir);
    results.push(
      ...(await discoverSkillsInDir({
        baseDir: projectSkillsDir,
        source: 'project',
        backendType,
        enabled: true,
        editable: true,
      })),
    );
  }

  // Plugin skills (read-only)
  if (config.pluginSkillsDir) {
    results.push(
      ...(await discoverPluginSkills(config.pluginSkillsDir, backendType)),
    );
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkillContent({
  skillPath,
}: {
  skillPath: string;
}): Promise<{ name: string; description: string; content: string }> {
  const filePath = path.join(skillPath, 'SKILL.md');
  const raw = await fs.readFile(filePath, 'utf-8');
  const fm = parseFrontmatter(raw);

  // Extract body (everything after the frontmatter block)
  let content = raw;
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (fmMatch) {
    content = raw.slice(fmMatch[0].length).trim();
  }

  return {
    name: fm.name || path.basename(skillPath),
    description: fm.description || '',
    content,
  };
}

export async function createSkill({
  backendType,
  scope,
  projectPath,
  name,
  description,
  content,
}: {
  backendType: AgentBackendType;
  scope: SkillScope;
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}): Promise<ManagedSkill> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const dirName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  if (scope === 'project') {
    // Project skills live directly in the project directory — no JC canonical store
    if (!projectPath || !config.projectSkillsDir) {
      throw new Error('Project path required for project-scoped skills');
    }
    const baseDir = path.join(projectPath, config.projectSkillsDir);
    const skillDir = path.join(baseDir, dirName);

    try {
      await fs.access(skillDir);
      throw new Error(`Skill directory already exists: ${skillDir}`);
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      buildSkillMd({ name, description, content }),
      'utf-8',
    );

    dbg.skill('Created project skill %s at %s', name, skillDir);

    return {
      name,
      description,
      source: 'project',
      skillPath: skillDir,
      enabled: true,
      backendType,
      editable: true,
    };
  }

  // User-scope: create in JC canonical dir, then symlink into backend's path
  const jcDir = getJcUserSkillsDir(backendType);
  const canonicalPath = path.join(jcDir, dirName);
  const symlinkPath = path.join(config.userSkillsDir, dirName);

  // Check for conflicts in the JC canonical store
  try {
    await fs.access(canonicalPath);
    throw new Error(`Skill already exists: ${canonicalPath}`);
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }

  // Create canonical dir + SKILL.md
  await fs.mkdir(canonicalPath, { recursive: true });
  await fs.writeFile(
    path.join(canonicalPath, 'SKILL.md'),
    buildSkillMd({ name, description, content }),
    'utf-8',
  );

  // Create symlink in backend's expected path (creates dir if needed).
  // Roll back canonical dir if symlink creation fails to avoid orphans.
  try {
    await fs.mkdir(config.userSkillsDir, { recursive: true });
    await fs.symlink(canonicalPath, symlinkPath);
  } catch (symlinkError) {
    dbg.skill(
      'Symlink creation failed for %s, rolling back canonical dir: %O',
      canonicalPath,
      symlinkError,
    );
    await fs.rm(canonicalPath, { recursive: true, force: true });
    throw symlinkError;
  }

  dbg.skill(
    'Created user skill %s: canonical=%s symlink=%s',
    name,
    canonicalPath,
    symlinkPath,
  );

  return {
    name,
    description,
    source: 'user',
    skillPath: canonicalPath,
    enabled: true,
    backendType,
    editable: true,
  };
}

export async function updateSkill({
  skillPath,
  backendType,
  name,
  description,
  content,
}: {
  skillPath: string;
  backendType: AgentBackendType;
  name?: string;
  description?: string;
  content?: string;
}): Promise<ManagedSkill> {
  const current = await getSkillContent({ skillPath });
  const updatedName = name ?? current.name;
  const updatedDesc = description ?? current.description;
  const updatedContent = content ?? current.content;

  const skillMd = buildSkillMd({
    name: updatedName,
    description: updatedDesc,
    content: updatedContent,
  });
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd, 'utf-8');

  dbg.skill('Updated skill at %s', skillPath);

  // Determine source and enabled status from path
  const jcDir = getJcUserSkillsDir(backendType);
  const isJcManaged = skillPath.startsWith(jcDir + path.sep);
  const config = SKILL_PATH_CONFIGS[backendType];
  const symlinkPath = path.join(config.userSkillsDir, path.basename(skillPath));
  const enabled = isJcManaged ? await isSymlink(symlinkPath) : true;
  const source = isJcManaged ? 'user' : 'project';

  return {
    name: updatedName,
    description: updatedDesc,
    source,
    skillPath,
    enabled,
    backendType,
    editable: true,
  };
}

export async function deleteSkill({
  skillPath,
  backendType,
}: {
  skillPath: string;
  backendType: AgentBackendType;
}): Promise<void> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const jcDir = getJcUserSkillsDir(backendType);
  const dirName = path.basename(skillPath);

  // If this is a JC-managed skill, also remove the symlink from the backend path
  if (skillPath.startsWith(jcDir + path.sep) || skillPath === jcDir) {
    const symlinkPath = path.join(config.userSkillsDir, dirName);
    try {
      if (await isSymlink(symlinkPath)) {
        await fs.unlink(symlinkPath);
      }
    } catch {
      // Symlink may already be absent (skill was disabled) — that's fine
    }
  }

  await fs.rm(skillPath, { recursive: true, force: true });
  dbg.skill('Deleted skill at %s', skillPath);
}

/**
 * Disables a JC-managed user skill by removing its symlink from the backend's
 * expected skills directory. The canonical skill stays in the JC folder —
 * it is never moved or deleted.
 */
export async function disableSkill({
  skillPath,
  backendType,
}: {
  skillPath: string;
  backendType: AgentBackendType;
}): Promise<void> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const symlinkPath = path.join(config.userSkillsDir, path.basename(skillPath));

  try {
    if (await isSymlink(symlinkPath)) {
      await fs.unlink(symlinkPath);
      dbg.skill(
        'Disabled skill %s (removed symlink %s)',
        skillPath,
        symlinkPath,
      );
    }
    // If the symlink doesn't exist the skill is already disabled — no-op
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
}

/**
 * Enables a JC-managed user skill by creating a symlink in the backend's
 * expected skills directory pointing to the canonical JC location.
 */
export async function enableSkill({
  skillPath,
  backendType,
}: {
  skillPath: string;
  backendType: AgentBackendType;
}): Promise<void> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const symlinkPath = path.join(config.userSkillsDir, path.basename(skillPath));

  // Ensure the backend's skills directory exists
  await fs.mkdir(config.userSkillsDir, { recursive: true });

  try {
    await fs.symlink(skillPath, symlinkPath);
    dbg.skill('Enabled skill %s (created symlink %s)', skillPath, symlinkPath);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'EEXIST') {
      // Already enabled — no-op
    } else {
      throw error;
    }
  }
}
