import * as fs from 'fs/promises';
import * as path from 'path';

import { dbg } from '../lib/debug';

interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: unknown;
}

/**
 * Reads a Claude settings JSON file. Returns empty object if file doesn't exist.
 */
async function readSettingsFile(filePath: string): Promise<ClaudeSettings> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Writes a Claude settings JSON file, creating the .claude directory if needed.
 */
async function writeSettingsFile(
  filePath: string,
  settings: ClaudeSettings,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(settings, null, 2) + '\n',
    'utf-8',
  );
}

/**
 * Returns true if the permission string is a bare "Bash" without a specific command.
 * Bare Bash must never be allowed — it would bypass all Bash permission checks.
 */
function isBareBash(permission: string): boolean {
  return permission === 'Bash' || permission === 'Bash()';
}

/**
 * Adds a permission string to a settings file's permissions.allow array.
 * Creates the file if it doesn't exist. Deduplicates entries.
 * Rejects bare "Bash" (without a specific command) for security.
 */
export async function addAllowPermission(
  settingsPath: string,
  permission: string,
): Promise<void> {
  if (isBareBash(permission)) {
    dbg.agentPermission(
      'Refusing to allow bare "Bash" — a specific command is required',
    );
    return;
  }
  const settings = await readSettingsFile(settingsPath);
  if (!settings.permissions) {
    settings.permissions = {};
  }
  if (!settings.permissions.allow) {
    settings.permissions.allow = [];
  }
  if (!settings.permissions.allow.includes(permission)) {
    settings.permissions.allow.push(permission);
  }
  await writeSettingsFile(settingsPath, settings);
}

/**
 * Builds the permission string for a tool + input combination.
 * Bash: "Bash(exact command)" — exact match on the command string.
 * All others: just the tool name (e.g., "Edit", "Write").
 * Returns null for Bash with no command (should not be allowed).
 */
export function buildPermissionString(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (toolName === 'Bash') {
    const command = String(input.command || '').trim();
    if (!command) return null;
    return `Bash(${command})`;
  }
  return toolName;
}

/**
 * Checks if a path is within an allowed directory (normalized, no symlink resolution).
 */
function isPathWithinDirectory(
  targetPath: string,
  allowedDir: string,
): boolean {
  const normalizedTarget = path.normalize(targetPath);
  const normalizedAllowed = path.normalize(allowedDir);
  // Ensure the path starts with the allowed directory followed by a separator or is exact match
  return (
    normalizedTarget === normalizedAllowed ||
    normalizedTarget.startsWith(normalizedAllowed + path.sep)
  );
}

/**
 * Checks if a Bash command is a "mkdir -p" with all paths within the allowed directory.
 * Returns true only if the command is exactly "mkdir -p <paths>" where all paths are subpaths
 * of the allowed directory.
 */
function isMkdirInAllowedPath(command: string, allowedDir: string): boolean {
  // Match "mkdir -p" followed by one or more paths
  // We need to be strict: only "mkdir -p", no other flags
  const mkdirMatch = command.match(/^mkdir\s+-p\s+(.+)$/);
  if (!mkdirMatch) return false;

  const pathsPart = mkdirMatch[1];

  // Parse the paths, handling quoted strings
  const paths: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < pathsPart.length; i++) {
    const char = pathsPart[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        paths.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    paths.push(current);
  }

  // All paths must be absolute and within the allowed directory
  return (
    paths.length > 0 &&
    paths.every(
      (p) => path.isAbsolute(p) && isPathWithinDirectory(p, allowedDir),
    )
  );
}

/**
 * Checks if a tool use is allowed by a list of permission strings.
 * For Bash: requires exact match like "Bash(npm test)". Bare "Bash" never matches.
 * For others: requires tool name match like "Edit".
 *
 * When workingDir is provided and Write permission is granted, also auto-allows
 * "mkdir -p <paths>" commands where all paths are within workingDir.
 */
export function isToolAllowedByPermissions(
  toolName: string,
  input: Record<string, unknown>,
  permissions: string[],
  options?: { workingDir?: string },
): boolean {
  if (toolName === 'Bash') {
    const command = String(input.command || '');
    const permStr = `Bash(${command})`;
    // Never allow bare "Bash" or "Bash()" — a specific command is required
    if (isBareBash(permStr)) return false;

    // Check exact permission match first
    if (permissions.includes(permStr)) return true;

    // If Write is allowed and workingDir is provided, auto-allow mkdir -p within workingDir
    if (
      options?.workingDir &&
      permissions.includes('Write') &&
      isMkdirInAllowedPath(command, options.workingDir)
    ) {
      return true;
    }

    return false;
  }
  // Never allow bare "Bash" in the permissions list for non-Bash tools either
  return !isBareBash(toolName) && permissions.includes(toolName);
}

/**
 * Merges permissions from settings.local.json and settings.local.worktrees.json.
 * Only merges permissions.allow and permissions.deny (union, deduplicated).
 * The base settings provide the full file; worktree settings only contribute permissions.
 */
export function mergePermissions(
  base: ClaudeSettings,
  worktreeOverrides: ClaudeSettings,
): ClaudeSettings {
  const merged = { ...base };
  const baseAllow = base.permissions?.allow ?? [];
  const overrideAllow = worktreeOverrides.permissions?.allow ?? [];
  const baseDeny = base.permissions?.deny ?? [];
  const overrideDeny = worktreeOverrides.permissions?.deny ?? [];

  merged.permissions = {
    ...merged.permissions,
    allow: [...new Set([...baseAllow, ...overrideAllow])],
    deny: [...new Set([...baseDeny, ...overrideDeny])],
  };

  return merged;
}

/**
 * Gets the path to .claude/settings.local.json for a given root directory.
 */
export function getSettingsLocalPath(rootDir: string): string {
  return path.join(rootDir, '.claude', 'settings.local.json');
}

/**
 * Gets the path to .claude/settings.local.worktrees.json for a given root directory.
 */
export function getWorktreeSettingsPath(rootDir: string): string {
  return path.join(rootDir, '.claude', 'settings.local.worktrees.json');
}

/**
 * Builds the merged settings.local.json for a new worktree.
 * Reads both settings.local.json and settings.local.worktrees.json from the source repo,
 * merges their permissions, and writes the result to the worktree.
 */
export async function buildWorktreeSettings(
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const baseSettings = await readSettingsFile(getSettingsLocalPath(sourcePath));
  const worktreeSettings = await readSettingsFile(
    getWorktreeSettingsPath(sourcePath),
  );
  const merged = mergePermissions(baseSettings, worktreeSettings);

  // Only write if there's something to write
  if (Object.keys(merged).length > 0) {
    await writeSettingsFile(getSettingsLocalPath(destPath), merged);
  }
}
