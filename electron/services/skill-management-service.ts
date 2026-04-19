import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  AgentSkillPathConfig,
  LegacySkillMigrationExecuteResult,
  LegacySkillMigrationPreviewItem,
  LegacySkillMigrationPreviewResult,
  ManagedSkill,
  SkillScope,
} from '@shared/skill-types';

import { dbg } from '../lib/debug';
import { isEnoent } from '../lib/fs';
import {
  buildSkillMd,
  extractBody,
  parseFrontmatter,
} from '../lib/skill-frontmatter';

import { JC_BUILTIN_SKILLS_DIR } from './builtin-skills-service';

// --- Jean-Claude canonical skill storage ---
//
// All JC-managed user skills live under:
//   ~/.config/jean-claude/skills/user/<skillName>/
//
// Backend-expected paths contain symlinks pointing to this canonical location:
//   ~/.claude/skills/<skillName>  →  ~/.config/jean-claude/skills/user/<skillName>/
//   ~/.config/opencode/skills/<skillName>  →  ~/.config/jean-claude/skills/user/<skillName>/
//
// Enable  = create symlink in the backend's skills dir
// Disable = remove the symlink (canonical stays in JC folder, skill is never lost)

const JC_SKILLS_BASE_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'skills',
);

const JC_USER_SKILLS_DIR = path.join(JC_SKILLS_BASE_DIR, 'user');

// --- Claude Code plugin paths ---

const CLAUDE_SETTINGS_PATH = path.join(
  os.homedir(),
  '.claude',
  'settings.json',
);
const CLAUDE_PLUGINS_CACHE_DIR = path.join(
  os.homedir(),
  '.claude',
  'plugins',
  'cache',
);

// --- Backend path configurations ---

const SKILL_PATH_CONFIGS: Record<AgentBackendType, AgentSkillPathConfig> = {
  'claude-code': {
    userSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
    projectSkillsDir: '.claude/skills',
    discoverExternalSkills: () =>
      discoverActivePluginSkills({ backendType: 'claude-code' }),
  },
  opencode: {
    userSkillsDir: path.join(os.homedir(), '.config', 'opencode', 'skills'),
    projectSkillsDir: undefined,
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

/** Converts a skill name into a safe directory name (lowercase, alphanumeric + dashes). */
function normalizeSkillDirName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** Builds a unique migration item identifier from backend type and legacy path. */
function createMigrationId({
  backendType,
  legacyPath,
}: {
  backendType: AgentBackendType;
  legacyPath: string;
}): string {
  return `${backendType}:${legacyPath}`;
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
 * Scans the JC canonical directory for user skills (unified, all backends).
 * For each skill, checks whether a symlink exists in ALL backends'
 * expected skills directories to build the enabledBackends map.
 */
async function discoverJcManagedUserSkills(): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_USER_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const canonicalPath = path.join(JC_USER_SKILLS_DIR, entry.name);
      const info = await readSkillDir(canonicalPath);
      if (!info) continue;

      const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
      for (const [backend, config] of Object.entries(SKILL_PATH_CONFIGS)) {
        const symlinkPath = path.join(config.userSkillsDir, entry.name);
        enabledBackends[backend as AgentBackendType] =
          await isSymlink(symlinkPath);
      }

      skills.push({
        ...info,
        source: 'user',
        skillPath: canonicalPath,
        enabledBackends,
        editable: true,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading JC user skills dir %s: %O',
        JC_USER_SKILLS_DIR,
        error,
      );
    }
  }

  return skills;
}

/**
 * Scans the JC builtin skills directory.
 * Builtin skills are read-only and managed by the application.
 * They are symlinked into each backend's skills directory on startup
 * so agent backends can reference them.
 */
async function discoverBuiltinSkills(): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_BUILTIN_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(JC_BUILTIN_SKILLS_DIR, entry.name);
      const info = await readSkillDir(skillDir);
      if (!info) continue;

      // Check symlink state per backend (same as user skills)
      const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
      for (const [backend, config] of Object.entries(SKILL_PATH_CONFIGS)) {
        const symlinkPath = path.join(config.userSkillsDir, entry.name);
        enabledBackends[backend as AgentBackendType] =
          await isSymlink(symlinkPath);
      }

      skills.push({
        ...info,
        source: 'builtin',
        skillPath: skillDir,
        enabledBackends,
        editable: false,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading builtin skills dir %s: %O',
        JC_BUILTIN_SKILLS_DIR,
        error,
      );
    }
  }

  return skills;
}

/**
 * Ensures all builtin skills are symlinked into every backend's skills
 * directory. Called on app startup after `upsertBuiltinSkills()`.
 *
 * Symlinks that already exist are left in place. Missing symlinks are
 * created. Broken symlinks (pointing to a different target) are replaced.
 */
export async function syncBuiltinSkillSymlinks(): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await fs.readdir(JC_BUILTIN_SKILLS_DIR, { withFileTypes: true });
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading builtin skills dir for symlink sync: %O', error);
    }
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;

    const canonicalPath = path.join(JC_BUILTIN_SKILLS_DIR, entry.name);

    for (const config of Object.values(SKILL_PATH_CONFIGS)) {
      const symlinkPath = path.join(config.userSkillsDir, entry.name);

      try {
        await fs.mkdir(config.userSkillsDir, { recursive: true });

        // Check if a symlink already exists and points to the right target
        if (await isSymlink(symlinkPath)) {
          const target = await fs.readlink(symlinkPath);
          if (target === canonicalPath) continue; // already correct
          // If symlink points to a user skill, don't overwrite it
          if (target.startsWith(JC_USER_SKILLS_DIR + path.sep)) {
            dbg.skill(
              'Skipping builtin symlink %s: user skill symlink exists',
              symlinkPath,
            );
            continue;
          }
          // Points elsewhere — remove and recreate
          await fs.unlink(symlinkPath);
        } else if (await pathExists(symlinkPath)) {
          // A real directory/file exists at this path — skip to avoid conflict
          dbg.skill(
            'Skipping builtin symlink %s: non-symlink entry exists',
            symlinkPath,
          );
          continue;
        }

        await fs.symlink(canonicalPath, symlinkPath);
        dbg.skill(
          'Created builtin skill symlink: %s → %s',
          symlinkPath,
          canonicalPath,
        );
      } catch (error) {
        dbg.skill(
          'Failed to create builtin skill symlink %s: %O',
          symlinkPath,
          error,
        );
      }
    }
  }
}

/**
 * Scans the JC canonical directory for user skills (single backend).
 * For each skill, checks whether a symlink exists in the given backend's
 * expected skills directory to determine enabled/disabled status.
 */
async function discoverJcManagedUserSkillsForBackend(
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_USER_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const canonicalPath = path.join(JC_USER_SKILLS_DIR, entry.name);
      const info = await readSkillDir(canonicalPath);
      if (!info) continue;

      const symlinkPath = path.join(config.userSkillsDir, entry.name);
      const enabled = await isSymlink(symlinkPath);

      skills.push({
        ...info,
        source: 'user',
        skillPath: canonicalPath,
        enabledBackends: { [backendType]: enabled },
        editable: true,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading JC user skills dir %s: %O',
        JC_USER_SKILLS_DIR,
        error,
      );
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
      const jcEquivalent = path.join(JC_USER_SKILLS_DIR, entry.name);
      if (await pathExists(jcEquivalent)) continue;

      // For symlinks, skip JC-managed ones (target inside canonical dir —
      // covers both user/ and builtin/ subdirectories)
      // and resolve to actual path for reading
      let resolvedPath = skillDir;
      if (entry.isSymbolicLink()) {
        try {
          resolvedPath = await fs.realpath(skillDir);
        } catch {
          continue; // broken symlink
        }
        // If symlink points into JC canonical dir, it's JC-managed — skip
        if (resolvedPath.startsWith(JC_SKILLS_BASE_DIR + path.sep)) continue;
      }

      const info = await readSkillDir(resolvedPath);
      if (info) {
        if (seenSkillPaths.has(resolvedPath)) continue;
        seenSkillPaths.add(resolvedPath);

        skills.push({
          ...info,
          source: 'user',
          skillPath: resolvedPath,
          enabledBackends: { [backendType]: true },
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

        seenSkillPaths.add(nestedSkillDir);

        skills.push({
          ...nestedInfo,
          name: `${entry.name}/${nestedInfo.name}`,
          source: 'user',
          skillPath: nestedSkillDir,
          enabledBackends: { [backendType]: true },
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
  enabledBackends,
  editable,
  pluginName,
}: {
  baseDir: string;
  source: 'user' | 'project' | 'plugin';
  enabledBackends: Partial<Record<AgentBackendType, boolean>>;
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
          enabledBackends,
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

// --- Active plugin discovery ---

/**
 * Reads ~/.claude/settings.json and returns the enabledPlugins map.
 * Keys are in "pluginName@marketplaceName" format, values are booleans.
 */
async function readEnabledPlugins(): Promise<Record<string, boolean>> {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(content) as {
      enabledPlugins?: Record<string, boolean>;
    };
    return settings.enabledPlugins ?? {};
  } catch {
    return {};
  }
}

/**
 * Discovers skills from active (enabled) Claude Code plugins only.
 * Reads enabledPlugins from ~/.claude/settings.json, then scans the
 * plugin cache for matching entries instead of scanning the entire cache.
 */
async function discoverActivePluginSkills({
  backendType,
}: {
  backendType: AgentBackendType;
}): Promise<ManagedSkill[]> {
  const enabledPlugins = await readEnabledPlugins();
  const skills: ManagedSkill[] = [];

  for (const [key, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;

    // Key format: "pluginName@marketplaceName"
    const atIdx = key.indexOf('@');
    if (atIdx === -1) continue;

    const pluginName = key.slice(0, atIdx);
    const marketplaceName = key.slice(atIdx + 1);
    const pluginDir = path.join(
      CLAUDE_PLUGINS_CACHE_DIR,
      marketplaceName,
      pluginName,
    );

    try {
      const versionDirs = await fs.readdir(pluginDir, { withFileTypes: true });
      for (const versionDir of versionDirs) {
        if (!versionDir.isDirectory()) continue;
        const skillsPath = path.join(pluginDir, versionDir.name, 'skills');

        const pluginSkills = await discoverSkillsInDir({
          baseDir: skillsPath,
          source: 'plugin',
          enabledBackends: { [backendType]: true },
          editable: false,
          pluginName,
        });
        skills.push(...pluginSkills);
      }
    } catch (error) {
      if (!isEnoent(error)) {
        dbg.skill('Error reading plugin dir %s: %O', pluginDir, error);
      }
    }
  }

  return skills;
}

/**
 * Scans a backend's user skills directory for entries that are NOT managed by
 * Jean-Claude and classifies each as migratable, conflicting, or invalid.
 * Used by the migration preview to show users what will happen before they confirm.
 */
async function discoverLegacyMigrationCandidates({
  backendType,
}: {
  backendType: AgentBackendType;
}): Promise<
  Array<{
    backendType: AgentBackendType;
    name: string;
    legacyPath: string;
    targetCanonicalPath: string;
    status: 'migrate' | 'skip-conflict' | 'skip-invalid';
    reason?: string;
  }>
> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const candidates: Array<{
    backendType: AgentBackendType;
    name: string;
    legacyPath: string;
    targetCanonicalPath: string;
    status: 'migrate' | 'skip-conflict' | 'skip-invalid';
    reason?: string;
  }> = [];

  const pushCandidate = ({
    name,
    legacyPath,
    status,
    reason,
  }: {
    name: string;
    legacyPath: string;
    status: 'migrate' | 'skip-conflict' | 'skip-invalid';
    reason?: string;
  }) => {
    const targetCanonicalPath = path.join(
      JC_USER_SKILLS_DIR,
      normalizeSkillDirName(name),
    );
    candidates.push({
      backendType,
      name,
      legacyPath,
      targetCanonicalPath,
      status,
      reason,
    });
  };

  try {
    const entries = await fs.readdir(config.userSkillsDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(config.userSkillsDir, entry.name);
      const jcEquivalent = path.join(JC_USER_SKILLS_DIR, entry.name);
      if (await pathExists(jcEquivalent)) continue;

      let resolvedPath = skillDir;
      if (entry.isSymbolicLink()) {
        try {
          resolvedPath = await fs.realpath(skillDir);
        } catch {
          pushCandidate({
            name: entry.name,
            legacyPath: skillDir,
            status: 'skip-invalid',
            reason: 'Broken symlink',
          });
          continue;
        }

        if (resolvedPath.startsWith(JC_SKILLS_BASE_DIR + path.sep)) {
          continue;
        }
      }

      const info = await readSkillDir(resolvedPath);
      if (info) {
        const normalizedName = normalizeSkillDirName(info.name);
        const conflictPath = path.join(JC_USER_SKILLS_DIR, normalizedName);
        const hasConflict = await pathExists(conflictPath);
        pushCandidate({
          name: info.name,
          legacyPath: skillDir,
          status: hasConflict ? 'skip-conflict' : 'migrate',
          reason: hasConflict
            ? `Canonical skill already exists at ${conflictPath}`
            : undefined,
        });
        continue;
      }

      if (backendType !== 'opencode') {
        pushCandidate({
          name: entry.name,
          legacyPath: skillDir,
          status: 'skip-invalid',
          reason: 'SKILL.md not found',
        });
        continue;
      }

      const nestedSkillDirs = await discoverNestedSkillDirs(resolvedPath);
      if (nestedSkillDirs.length === 0) {
        pushCandidate({
          name: entry.name,
          legacyPath: skillDir,
          status: 'skip-invalid',
          reason: 'No nested SKILL.md found',
        });
        continue;
      }

      for (const nestedSkillDir of nestedSkillDirs) {
        const nestedInfo = await readSkillDir(nestedSkillDir);
        if (!nestedInfo) {
          pushCandidate({
            name: entry.name,
            legacyPath: nestedSkillDir,
            status: 'skip-invalid',
            reason: 'Invalid nested SKILL.md',
          });
          continue;
        }

        const nestedSkillName = `${entry.name}/${nestedInfo.name}`;
        const normalizedName = normalizeSkillDirName(nestedSkillName);
        const conflictPath = path.join(JC_USER_SKILLS_DIR, normalizedName);
        const hasConflict = await pathExists(conflictPath);
        pushCandidate({
          name: nestedSkillName,
          legacyPath: nestedSkillDir,
          status: hasConflict ? 'skip-conflict' : 'migrate',
          reason: hasConflict
            ? `Canonical skill already exists at ${conflictPath}`
            : undefined,
        });
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error preparing migration candidates for %s: %O',
        backendType,
        error,
      );
    }
  }

  return candidates;
}

// --- Shared discovery utility ---

/**
 * Discovers all skill sources for a single backend: JC-managed, legacy,
 * project, and external (e.g., active plugins). Used by both the per-backend
 * and unified public APIs to avoid duplicating discovery logic.
 */
async function discoverSkillsForBackend({
  backendType,
  projectPath,
}: {
  backendType: AgentBackendType;
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const results: ManagedSkill[] = [];

  // JC-managed user skills: canonical in JC folder, symlinked to backend path
  results.push(...(await discoverJcManagedUserSkillsForBackend(backendType)));

  // Legacy user skills: directly in backend path, not JC-managed
  results.push(...(await discoverLegacyUserSkills(backendType)));

  // Project skills: in-place in project dir (always enabled)
  if (projectPath && config.projectSkillsDir) {
    const projectSkillsDir = path.join(projectPath, config.projectSkillsDir);
    results.push(
      ...(await discoverSkillsInDir({
        baseDir: projectSkillsDir,
        source: 'project',
        enabledBackends: { [backendType]: true },
        editable: true,
      })),
    );
  }

  // External skills (e.g., active plugins)
  if (config.discoverExternalSkills) {
    results.push(...(await config.discoverExternalSkills()));
  }

  // Builtin skills: managed by JC, symlinked to backends on startup
  results.push(...(await discoverBuiltinSkills()));

  return results;
}

// --- Public API ---

export async function getAllManagedSkills({
  backendType,
  projectPath,
}: {
  backendType: AgentBackendType;
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const results = await discoverSkillsForBackend({ backendType, projectPath });
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAllManagedSkillsUnified({
  projectPath,
}: {
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const results: ManagedSkill[] = [];
  const seenPaths = new Set<string>();

  // JC-managed skills first (unified across all backends)
  const jcSkills = await discoverJcManagedUserSkills();
  for (const skill of jcSkills) {
    seenPaths.add(skill.skillPath);
    results.push(skill);
  }

  // Builtin skills (before per-backend so they win dedup races)
  const builtinSkills = await discoverBuiltinSkills();
  for (const skill of builtinSkills) {
    seenPaths.add(skill.skillPath);
    results.push(skill);
  }

  // Per-backend: legacy, project, and external skills (deduplicated)
  for (const [backend, config] of Object.entries(SKILL_PATH_CONFIGS)) {
    const backendType = backend as AgentBackendType;

    const legacy = await discoverLegacyUserSkills(backendType);
    for (const skill of legacy) {
      if (seenPaths.has(skill.skillPath)) continue;
      seenPaths.add(skill.skillPath);
      results.push(skill);
    }

    if (projectPath && config.projectSkillsDir) {
      const projectSkillsDir = path.join(projectPath, config.projectSkillsDir);
      const projectSkills = await discoverSkillsInDir({
        baseDir: projectSkillsDir,
        source: 'project',
        enabledBackends: { [backendType]: true },
        editable: true,
      });
      for (const skill of projectSkills) {
        if (seenPaths.has(skill.skillPath)) continue;
        seenPaths.add(skill.skillPath);
        results.push(skill);
      }
    }

    if (config.discoverExternalSkills) {
      const externalSkills = await config.discoverExternalSkills();
      for (const skill of externalSkills) {
        if (seenPaths.has(skill.skillPath)) continue;
        seenPaths.add(skill.skillPath);
        results.push(skill);
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a preview of all legacy skills across both backends, classifying each
 * as migratable, conflicting, or invalid. No filesystem changes are made.
 */
export async function previewLegacySkillMigration(): Promise<LegacySkillMigrationPreviewResult> {
  const claudeCandidates = await discoverLegacyMigrationCandidates({
    backendType: 'claude-code',
  });
  const opencodeCandidates = await discoverLegacyMigrationCandidates({
    backendType: 'opencode',
  });

  const items: LegacySkillMigrationPreviewItem[] = [
    ...claudeCandidates,
    ...opencodeCandidates,
  ].map((candidate) => ({
    id: createMigrationId({
      backendType: candidate.backendType,
      legacyPath: candidate.legacyPath,
    }),
    backendType: candidate.backendType,
    legacyPath: candidate.legacyPath,
    targetCanonicalPath: candidate.targetCanonicalPath,
    name: candidate.name,
    status: candidate.status,
    reason: candidate.reason,
  }));

  return { items };
}

/**
 * Executes migration for the given item IDs: copies each legacy skill into JC
 * canonical storage, removes the legacy entry, and replaces it with a symlink.
 * Re-validates each item before mutating the filesystem. Per-item failures are
 * captured without aborting the remaining items, with rollback on partial failure.
 */
export async function executeLegacySkillMigration({
  itemIds,
}: {
  itemIds: string[];
}): Promise<LegacySkillMigrationExecuteResult> {
  const preview = await previewLegacySkillMigration();
  const migratableById = new Map(
    preview.items
      .filter((item) => item.status === 'migrate')
      .map((item) => [item.id, item]),
  );

  const results: LegacySkillMigrationExecuteResult['results'] = [];

  for (const itemId of itemIds) {
    const item = migratableById.get(itemId);
    if (!item) {
      const colonIdx = itemId.indexOf(':');
      const parsedBackend =
        colonIdx > 0 ? itemId.slice(0, colonIdx) : 'claude-code';
      results.push({
        id: itemId,
        backendType: parsedBackend as AgentBackendType,
        legacyPath: colonIdx > 0 ? itemId.slice(colonIdx + 1) : '',
        targetCanonicalPath: '',
        name: '',
        status: 'skipped',
        reason: 'Item is no longer migratable. Run preview again.',
      });
      continue;
    }

    const targetCanonicalPath = item.targetCanonicalPath;
    const tempCanonicalPath = `${targetCanonicalPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let legacyRemoved = false;

    try {
      const currentInfo = await readSkillDir(item.legacyPath);
      if (!currentInfo) {
        throw new Error('Legacy skill is no longer valid');
      }

      if (await pathExists(targetCanonicalPath)) {
        throw new Error(
          `Canonical target already exists: ${targetCanonicalPath}`,
        );
      }

      await fs.mkdir(path.dirname(targetCanonicalPath), { recursive: true });
      await fs.cp(item.legacyPath, tempCanonicalPath, {
        recursive: true,
        dereference: true,
        errorOnExist: true,
      });
      await fs.rename(tempCanonicalPath, targetCanonicalPath);

      const stat = await fs.lstat(item.legacyPath);
      if (stat.isSymbolicLink()) {
        await fs.unlink(item.legacyPath);
      } else {
        await fs.rm(item.legacyPath, { recursive: true, force: true });
      }
      legacyRemoved = true;

      await fs.symlink(targetCanonicalPath, item.legacyPath);

      const resolved = await fs.realpath(item.legacyPath);
      if (resolved !== targetCanonicalPath) {
        throw new Error('Created symlink does not resolve to canonical target');
      }

      results.push({
        id: item.id,
        backendType: item.backendType,
        legacyPath: item.legacyPath,
        targetCanonicalPath: item.targetCanonicalPath,
        name: item.name,
        status: 'migrated',
      });
    } catch (error) {
      if (legacyRemoved) {
        try {
          await fs.cp(targetCanonicalPath, item.legacyPath, {
            recursive: true,
            dereference: true,
            force: true,
          });
        } catch (rollbackCopyError) {
          dbg.skill(
            'Rollback copy failed for migrated skill %s: %O',
            item.id,
            rollbackCopyError,
          );
        }
        try {
          await fs.rm(targetCanonicalPath, { recursive: true, force: true });
        } catch (rollbackCleanupError) {
          dbg.skill(
            'Rollback cleanup failed for migrated skill %s (canonical orphan at %s): %O',
            item.id,
            targetCanonicalPath,
            rollbackCleanupError,
          );
        }
      }

      await fs.rm(tempCanonicalPath, { recursive: true, force: true });

      results.push({
        id: item.id,
        backendType: item.backendType,
        legacyPath: item.legacyPath,
        targetCanonicalPath: item.targetCanonicalPath,
        name: item.name,
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'Failed to migrate skill',
      });
    }
  }

  return { results };
}

export async function getSkillContent({
  skillPath,
}: {
  skillPath: string;
}): Promise<{ name: string; description: string; content: string }> {
  const filePath = path.join(skillPath, 'SKILL.md');
  const raw = await fs.readFile(filePath, 'utf-8');
  const fm = parseFrontmatter(raw);

  return {
    name: fm.name || path.basename(skillPath),
    description: fm.description || '',
    content: extractBody(raw),
  };
}

export async function createSkill({
  enabledBackends: enabledBackendsList,
  scope,
  projectPath,
  name,
  description,
  content,
}: {
  enabledBackends: AgentBackendType[];
  scope: SkillScope;
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}): Promise<ManagedSkill> {
  const dirName = normalizeSkillDirName(name);

  if (scope === 'project') {
    // Project skills live directly in the project directory — no JC canonical store
    const projectBackend = enabledBackendsList[0];
    const config = SKILL_PATH_CONFIGS[projectBackend];
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
      enabledBackends: { [projectBackend]: true },
      editable: true,
    };
  }

  // User-scope: create in JC canonical dir, then symlink into each enabled backend's path
  const canonicalPath = path.join(JC_USER_SKILLS_DIR, dirName);

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

  // Create symlinks in each enabled backend's expected path (creates dir if needed).
  // Roll back canonical dir if symlink creation fails to avoid orphans.
  const createdSymlinks: string[] = [];
  try {
    for (const backend of enabledBackendsList) {
      const cfg = SKILL_PATH_CONFIGS[backend];
      const symlinkPath = path.join(cfg.userSkillsDir, dirName);
      await fs.mkdir(cfg.userSkillsDir, { recursive: true });
      await fs.symlink(canonicalPath, symlinkPath);
      createdSymlinks.push(symlinkPath);
    }
  } catch (symlinkError) {
    dbg.skill(
      'Symlink creation failed for %s, rolling back canonical dir: %O',
      canonicalPath,
      symlinkError,
    );
    for (const sl of createdSymlinks) {
      try {
        await fs.unlink(sl);
      } catch {
        /* ignore */
      }
    }
    await fs.rm(canonicalPath, { recursive: true, force: true });
    throw symlinkError;
  }

  const enabledBackendsMap: Partial<Record<AgentBackendType, boolean>> = {};
  for (const backend of enabledBackendsList) {
    enabledBackendsMap[backend] = true;
  }

  dbg.skill(
    'Created user skill %s: canonical=%s backends=%o',
    name,
    canonicalPath,
    enabledBackendsList,
  );

  return {
    name,
    description,
    source: 'user',
    skillPath: canonicalPath,
    enabledBackends: enabledBackendsMap,
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
  if (skillPath.startsWith(JC_BUILTIN_SKILLS_DIR + path.sep)) {
    throw new Error('Cannot modify builtin skills');
  }

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
  const isJcManaged = skillPath.startsWith(JC_USER_SKILLS_DIR + path.sep);
  const source = isJcManaged ? 'user' : 'project';

  const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
  if (isJcManaged) {
    for (const [backend, cfg] of Object.entries(SKILL_PATH_CONFIGS)) {
      const sl = path.join(cfg.userSkillsDir, path.basename(skillPath));
      enabledBackends[backend as AgentBackendType] = await isSymlink(sl);
    }
  } else {
    enabledBackends[backendType] = true;
  }

  return {
    name: updatedName,
    description: updatedDesc,
    source,
    skillPath,
    enabledBackends,
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
  if (skillPath.startsWith(JC_BUILTIN_SKILLS_DIR + path.sep)) {
    throw new Error('Cannot delete builtin skills');
  }

  const dirName = path.basename(skillPath);

  // If this is a JC-managed skill, remove symlinks from all backend paths
  if (
    skillPath.startsWith(JC_USER_SKILLS_DIR + path.sep) ||
    skillPath === JC_USER_SKILLS_DIR
  ) {
    for (const cfg of Object.values(SKILL_PATH_CONFIGS)) {
      const symlinkPath = path.join(cfg.userSkillsDir, dirName);
      try {
        if (await isSymlink(symlinkPath)) {
          await fs.unlink(symlinkPath);
        }
      } catch {
        // Symlink may already be absent (skill was disabled) — that's fine
      }
    }
  }

  await fs.rm(skillPath, { recursive: true, force: true });
  dbg.skill('Deleted skill at %s (backend hint: %s)', skillPath, backendType);
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
