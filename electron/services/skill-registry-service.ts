import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  ManagedSkill,
  RegistrySearchResult,
  RegistrySkillContent,
} from '@shared/skill-types';

import { dbg } from '../lib/debug';
import { extractBody, parseFrontmatter } from '../lib/skill-frontmatter';

import { createSkill, getSkillContent } from './skill-management-service';

const execFileAsync = promisify(execFile);

const SKILLS_API_BASE = 'https://skills.sh/api';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const CLONE_TIMEOUT_MS = 60_000;

/**
 * Validates that a source string looks like a GitHub owner/repo reference.
 * Prevents path traversal and command injection via malicious source values.
 */
function validateGitHubSource(source: string): void {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(source)) {
    throw new Error(
      `Invalid source format: "${source}". Expected "owner/repo".`,
    );
  }
}

/**
 * Validates that a skill ID is a safe path segment (no traversal).
 */
function validateSkillId(skillId: string): void {
  if (
    !skillId ||
    skillId.includes('..') ||
    skillId.includes('/') ||
    skillId.includes('\\')
  ) {
    throw new Error(`Invalid skill ID: "${skillId}".`);
  }
}

// --- Public API ---

/**
 * Search the skills.sh registry for skills matching the given query.
 */
export async function searchRegistry({
  query,
}: {
  query: string;
}): Promise<RegistrySearchResult> {
  const url = `${SKILLS_API_BASE}/search?q=${encodeURIComponent(query)}`;
  dbg.skill('Registry search: %s', url);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `skills.sh search failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    query: string;
    skills: Array<{
      id: string;
      skillId: string;
      name: string;
      installs: number;
      source: string;
    }>;
    count: number;
  };

  return {
    query: data.query,
    skills: data.skills.map((s) => ({
      id: s.id,
      skillId: s.skillId,
      name: s.name,
      installs: s.installs,
      source: s.source,
    })),
    count: data.count,
  };
}

/**
 * Fetches the SKILL.md content from a GitHub repository for preview purposes.
 * Tries multiple path conventions to find the skill file.
 */
export async function fetchRegistrySkillContent({
  source,
  skillId,
}: {
  source: string;
  skillId: string;
}): Promise<RegistrySkillContent> {
  // Try common locations where skills live in repos
  const pathsToTry = [
    `${source}/main/skills/${skillId}/SKILL.md`,
    `${source}/main/skills/.curated/${skillId}/SKILL.md`,
    `${source}/main/${skillId}/SKILL.md`,
    `${source}/main/SKILL.md`, // single-skill repo
  ];

  let raw: string | null = null;
  for (const p of pathsToTry) {
    const url = `${GITHUB_RAW_BASE}/${p}`;
    dbg.skill('Trying to fetch SKILL.md from: %s', url);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        raw = await response.text();
        break;
      }
    } catch {
      // Try next path
    }
  }

  if (!raw) {
    throw new Error(
      `Could not find SKILL.md for ${skillId} in ${source}. Tried multiple paths.`,
    );
  }

  const fm = parseFrontmatter(raw);
  return {
    name: fm.name || skillId,
    description: fm.description || '',
    content: extractBody(raw),
  };
}

/**
 * Installs a skill from a GitHub repository into JC canonical storage.
 *
 * 1. Shallow-clone the repo to a temp directory
 * 2. Discover the SKILL.md at expected paths
 * 3. Copy the entire skill directory to canonical storage
 * 4. Create symlinks for enabled backends
 * 5. Clean up the temp directory
 */
export async function installFromRegistry({
  source,
  skillId,
  enabledBackends,
}: {
  source: string;
  skillId: string;
  enabledBackends: AgentBackendType[];
}): Promise<ManagedSkill> {
  validateGitHubSource(source);
  validateSkillId(skillId);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-skill-'));

  try {
    // 1. Shallow clone (using execFile to avoid shell injection)
    const cloneUrl = `https://github.com/${source}.git`;
    dbg.skill('Cloning %s to %s', cloneUrl, tmpDir);

    await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, 'repo'], {
      cwd: tmpDir,
      timeout: CLONE_TIMEOUT_MS,
    });

    const repoDir = path.join(tmpDir, 'repo');

    // 2. Discover the skill directory
    const pathsToTry = [
      path.join(repoDir, 'skills', skillId),
      path.join(repoDir, 'skills', '.curated', skillId),
      path.join(repoDir, skillId),
      repoDir, // single-skill repo
    ];

    let skillDir: string | null = null;
    for (const candidate of pathsToTry) {
      try {
        await fs.access(path.join(candidate, 'SKILL.md'));
        skillDir = candidate;
        break;
      } catch {
        // Try next path
      }
    }

    if (!skillDir) {
      throw new Error(
        `Could not find SKILL.md for "${skillId}" in ${source}. ` +
          `Searched: skills/${skillId}/, ${skillId}/, and repo root.`,
      );
    }

    dbg.skill('Found skill at %s', skillDir);

    // 3. Read the SKILL.md to get metadata
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const raw = await fs.readFile(skillMdPath, 'utf-8');
    const fm = parseFrontmatter(raw);
    const name = fm.name || skillId;
    const description = fm.description || '';
    const body = extractBody(raw);

    // 4. Use createSkill to handle canonical storage + symlink creation.
    //    But first check if there are companion files we need to copy after.
    const managed = await createSkill({
      enabledBackends,
      scope: 'user',
      name,
      description,
      content: body,
    });

    // 5. Copy companion files (AGENTS.md, resources/, rules/, etc.)
    //    createSkill only creates SKILL.md. We copy any other files from
    //    the source skill directory.
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'SKILL.md') continue; // already created
      if (entry.name.startsWith('.')) continue; // skip dotfiles

      const srcPath = path.join(skillDir, entry.name);
      const destPath = path.join(managed.skillPath, entry.name);

      await fs.cp(srcPath, destPath, { recursive: true });
      dbg.skill('Copied companion file: %s', entry.name);
    }

    // 6. Re-read the content to get the full picture after companion files
    const finalContent = await getSkillContent({
      skillPath: managed.skillPath,
    });
    dbg.skill(
      'Installed registry skill %s from %s (%d companion files)',
      name,
      source,
      entries.filter((e) => e.name !== 'SKILL.md' && !e.name.startsWith('.'))
        .length,
    );

    return {
      ...managed,
      name: finalContent.name,
      description: finalContent.description,
    };
  } finally {
    // Always clean up temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      dbg.skill('Failed to clean up temp dir %s: %O', tmpDir, cleanupError);
    }
  }
}
