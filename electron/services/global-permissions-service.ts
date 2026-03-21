import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import writeFileAtomic from 'write-file-atomic';

import type {
  PermissionAction,
  PermissionScope,
  ResolvedPermissionRule,
  ToolPermissionConfig,
} from '../../shared/permission-types';
import { dbg } from '../lib/debug';

import {
  buildAllowedToolConfig,
  flattenScope,
  normalizeToolRequest,
} from './permission-settings-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOBAL_SETTINGS_DIR = path.join(os.homedir(), '.config', 'jean-claude');
const GLOBAL_SETTINGS_FILENAME = 'settings.json';

interface GlobalSettings {
  version: 1;
  permissions: PermissionScope;
}

// ---------------------------------------------------------------------------
// Write Mutex (prevents TOCTOU races on read-modify-write)
// ---------------------------------------------------------------------------

let writeLock = Promise.resolve();

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chain onto the existing lock so concurrent calls serialize
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  const previous = writeLock;
  writeLock = next;

  await previous;
  try {
    return await fn();
  } finally {
    resolve!();
  }
}

// ---------------------------------------------------------------------------
// In-memory Cache (invalidated on write)
// ---------------------------------------------------------------------------

let cachedPermissions: PermissionScope | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGlobalSettingsPath(): string {
  return path.join(GLOBAL_SETTINGS_DIR, GLOBAL_SETTINGS_FILENAME);
}

/**
 * Returns true if a permission string represents bare "bash" without a
 * specific command. Bare bash must never be allowed.
 */
function isBareBash(tool: string, pattern: string): boolean {
  const t = tool.toLowerCase();
  const p = pattern.trim();
  return t === 'bash' && (p === '*' || p === '' || p === '**');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_ACTIONS = new Set<string>(['allow', 'ask', 'deny']);

/**
 * Runtime validation for a PermissionScope object.
 * Rejects bare bash entries and invalid action values.
 */
export function validatePermissionScope(scope: unknown): PermissionScope {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    throw new Error('Invalid permission scope: must be a plain object');
  }

  const result: PermissionScope = {};
  for (const [tool, config] of Object.entries(
    scope as Record<string, unknown>,
  )) {
    if (typeof config === 'string') {
      if (!VALID_ACTIONS.has(config)) {
        throw new Error(
          `Invalid action "${config}" for tool "${tool}". Must be one of: allow, ask, deny`,
        );
      }
      // Scalar config — check for bare bash
      if (isBareBash(tool, '*')) {
        throw new Error(
          'Bare "bash" without a command pattern is not allowed globally',
        );
      }
      result[tool] = config as PermissionAction;
    } else if (typeof config === 'object' && config !== null) {
      const patterns: Record<string, PermissionAction> = {};
      for (const [pattern, action] of Object.entries(
        config as Record<string, unknown>,
      )) {
        if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) {
          throw new Error(
            `Invalid action "${String(action)}" for tool "${tool}" pattern "${pattern}"`,
          );
        }
        if (isBareBash(tool, pattern) && action === 'allow') {
          throw new Error(
            'Bare "bash" without a command pattern is not allowed globally',
          );
        }
        patterns[pattern] = action as PermissionAction;
      }
      result[tool] = patterns;
    } else {
      throw new Error(
        `Invalid config for tool "${tool}": must be a string or object`,
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Read global permissions from `~/.config/jean-claude/settings.json`.
 * Returns an empty `PermissionScope` if the file doesn't exist or is invalid.
 * Uses an in-memory cache; invalidated on write.
 */
export async function readGlobalPermissions(): Promise<PermissionScope> {
  if (cachedPermissions) return structuredClone(cachedPermissions);

  try {
    const content = await fs.readFile(getGlobalSettingsPath(), 'utf-8');
    const parsed = JSON.parse(content) as GlobalSettings;
    if (parsed.version !== 1 || !parsed.permissions) {
      dbg.agentPermission(
        'Invalid global settings format, returning empty scope',
      );
      return {};
    }
    cachedPermissions = parsed.permissions;
    return parsed.permissions;
  } catch {
    return {};
  }
}

/**
 * Write global permissions to `~/.config/jean-claude/settings.json`.
 * Creates the directory if it doesn't exist.
 * Validates the scope before writing and sets restrictive file permissions.
 */
export async function writeGlobalPermissions(
  permissions: PermissionScope,
): Promise<void> {
  // Validate before writing
  validatePermissionScope(permissions);

  const settings: GlobalSettings = {
    version: 1,
    permissions,
  };

  await fs.mkdir(GLOBAL_SETTINGS_DIR, { recursive: true, mode: 0o700 });
  await writeFileAtomic(
    getGlobalSettingsPath(),
    JSON.stringify(settings, null, 2) + '\n',
    { encoding: 'utf-8', mode: 0o600 },
  );

  // Invalidate cache after write
  cachedPermissions = null;
}

// ---------------------------------------------------------------------------
// Add / Remove Rules
// ---------------------------------------------------------------------------

/**
 * Add a permission rule to the global scope.
 *
 * Security: refuses to add bare bash (no command pattern).
 *
 * @returns `true` if the rule was added, `false` if it was rejected (bare bash).
 * @throws if validation or I/O fails.
 */
export async function addGlobalPermission({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}): Promise<boolean> {
  const { tool, matchValue } = normalizeToolRequest(toolName, input);

  if (isBareBash(tool, matchValue || '*')) {
    dbg.agentPermission(
      'Refusing to allow bare "bash" globally — a specific command pattern is required',
    );
    return false;
  }

  return withWriteLock(async () => {
    const permissions = await readGlobalPermissions();
    permissions[tool] = buildAllowedToolConfig({
      existing: permissions[tool],
      matchValue,
    });

    await writeGlobalPermissions(permissions);
    return true;
  });
}

/**
 * Remove a permission rule from the global scope.
 *
 * If `pattern` is provided, removes only that specific pattern entry from
 * the tool's config. If `pattern` is omitted, removes the entire tool entry.
 */
export async function removeGlobalPermission({
  tool,
  pattern,
}: {
  tool: string;
  pattern?: string;
}): Promise<void> {
  return withWriteLock(async () => {
    const permissions = await readGlobalPermissions();

    if (!pattern) {
      // Remove the entire tool entry
      delete permissions[tool];
    } else {
      const existing = permissions[tool];
      if (typeof existing === 'object' && existing !== null) {
        const config = { ...existing } as Record<string, PermissionAction>;
        delete config[pattern];

        // If no patterns remain, remove the tool entry entirely
        const remaining = Object.keys(config);
        if (remaining.length === 0) {
          delete permissions[tool];
        } else if (remaining.length === 1 && remaining[0] === '*') {
          // Collapse { "*": action } back to scalar
          permissions[tool] = config['*'] as ToolPermissionConfig;
        } else {
          permissions[tool] = config;
        }
      } else {
        // Scalar config — only remove if pattern is '*'
        if (pattern === '*') {
          delete permissions[tool];
        }
      }
    }

    await writeGlobalPermissions(permissions);
  });
}

// ---------------------------------------------------------------------------
// Rule Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve global permissions into a flat list of `ResolvedPermissionRule[]`.
 */
export async function resolveGlobalRules(): Promise<ResolvedPermissionRule[]> {
  const permissions = await readGlobalPermissions();
  return flattenScope(permissions);
}
