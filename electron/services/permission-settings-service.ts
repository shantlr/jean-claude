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
 * Parse a command arguments string into individual arguments,
 * handling single and double quoted strings.
 */
function parseCommandArgs(argString: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < argString.length; i++) {
    const char = argString[i];

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
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Separate parsed args into flags (starting with -) and positional arguments.
 * Returns null if any flag is malformed (not matching the expected pattern).
 */
function separateFlagsAndPaths(
  args: string[],
  flagPattern: RegExp = /^-[a-zA-Z]+$/,
): { paths: string[] } | null {
  const paths: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (!flagPattern.test(arg)) return null;
      continue;
    }
    paths.push(arg);
  }
  return { paths };
}

/**
 * Checks if all paths are absolute and within the allowed directory.
 */
function allPathsWithinDirectory(paths: string[], allowedDir: string): boolean {
  return paths.every(
    (p) => path.isAbsolute(p) && isPathWithinDirectory(p, allowedDir),
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

  const paths = parseCommandArgs(mkdirMatch[1]);

  // All paths must be absolute and within the allowed directory
  return paths.length > 0 && allPathsWithinDirectory(paths, allowedDir);
}

/**
 * Checks if a Bash command is "cat" with all file paths within the allowed directory.
 * Handles optional flags (e.g., -n, -b, -E, -s, -v, -e, -t, -A).
 */
function isCatInAllowedPath(command: string, allowedDir: string): boolean {
  if (!command.match(/^cat\s/)) return false;

  const args = parseCommandArgs(command.slice(3).trim());
  const result = separateFlagsAndPaths(args);
  if (!result) return false;

  return (
    result.paths.length > 0 && allPathsWithinDirectory(result.paths, allowedDir)
  );
}

/**
 * Checks if a Bash command is "ls" with all paths within the allowed directory.
 * All ls flags are read-only so we only validate path arguments.
 * Bare "ls" or "ls -la" (no path) is also safe when working within the allowed dir.
 */
function isLsInAllowedPath(command: string, allowedDir: string): boolean {
  const trimmed = command.trim();
  if (trimmed === 'ls') return true;
  if (!trimmed.match(/^ls\s/)) return false;

  const args = parseCommandArgs(trimmed.slice(2).trim());
  const result = separateFlagsAndPaths(args, /^-[a-zA-Z0-9]+$/);
  if (!result) return false;

  // ls with no path args is safe (operates in cwd which is workingDir)
  if (result.paths.length === 0) return true;

  return allPathsWithinDirectory(result.paths, allowedDir);
}

/**
 * Checks if a Bash command is "mv" where all source and destination paths
 * are within the allowed directory. Handles optional flags like -f, -n, -v, -i.
 */
function isMvInAllowedPath(command: string, allowedDir: string): boolean {
  if (!command.match(/^mv\s/)) return false;

  const args = parseCommandArgs(command.slice(2).trim());
  const result = separateFlagsAndPaths(args);
  if (!result) return false;

  // mv requires at least 2 paths (source(s) + destination)
  return (
    result.paths.length >= 2 &&
    allPathsWithinDirectory(result.paths, allowedDir)
  );
}

/**
 * Checks if a tool use is allowed by a list of permission strings.
 * For Bash: requires exact match like "Bash(npm test)". Bare "Bash" never matches.
 * For others: requires tool name match like "Edit".
 *
 * When workingDir is provided and high-level permissions are granted, also auto-allows
 * certain Bash commands within workingDir:
 * - Write: "mkdir -p", "mv" (all paths within workingDir)
 * - Read: "cat", "ls" (all paths within workingDir)
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

    if (options?.workingDir) {
      // Write-level auto-allows
      if (permissions.includes('Write')) {
        if (isMkdirInAllowedPath(command, options.workingDir)) return true;
        if (isMvInAllowedPath(command, options.workingDir)) return true;
      }

      // Read-level auto-allows
      if (permissions.includes('Read')) {
        if (isCatInAllowedPath(command, options.workingDir)) return true;
        if (isLsInAllowedPath(command, options.workingDir)) return true;
      }
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

/**
 * Read the effective permissions.allow array for a given working directory.
 * For worktree paths, reads the worktree's own settings.local.json
 * (which already contains merged permissions from buildWorktreeSettings).
 * For project paths, reads the project's settings.local.json.
 *
 * Returns deduplicated allow list (excluding bare "Bash").
 */
export async function getEffectivePermissions(
  workingDir: string,
): Promise<string[]> {
  const settings = await readSettingsFile(getSettingsLocalPath(workingDir));
  const allow = settings.permissions?.allow ?? [];
  return allow.filter((p) => !isBareBash(p));
}
