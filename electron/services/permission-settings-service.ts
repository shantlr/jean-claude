import * as fs from 'fs/promises';
import * as path from 'path';

import picomatch from 'picomatch';
import { parse as shellParse } from 'shell-quote';

import type {
  JeanClaudeSettings,
  PermissionAction,
  PermissionEvalResult,
  PermissionScope,
  ResolvedPermissionRule,
  ToolPermissionConfig,
  WorktreePermissionScope,
} from '../../shared/permission-types';
import { dbg } from '../lib/debug';

// Re-export types for convenience
export type { JeanClaudeSettings, PermissionAction, PermissionEvalResult };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_FILENAME = 'settings.local.json';
const SETTINGS_DIR = '.jean-claude';

function createDefaultSettings(): JeanClaudeSettings {
  return {
    version: 1,
    permissions: {
      project: {},
    },
  };
}

function normalizeSettingsShape(
  parsed: JeanClaudeSettings,
): JeanClaudeSettings {
  return {
    version: 1,
    permissions: {
      project: parsed.permissions.project ?? {},
      ...(parsed.permissions.worktrees
        ? { worktrees: parsed.permissions.worktrees }
        : {}),
    },
  };
}

function parseLegacyPermissionEntry(
  entry: string,
): { tool: string; pattern: string | null } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('Bash(') && trimmed.endsWith(')')) {
    const command = trimmed.slice(5, -1).trim();
    return command ? { tool: 'bash', pattern: command } : null;
  }

  const toolMap: Record<string, string> = {
    Read: 'read',
    Edit: 'edit',
    Write: 'write',
    Glob: 'glob',
    Grep: 'grep',
    WebFetch: 'webfetch',
    WebSearch: 'websearch',
    Task: 'task',
    TodoWrite: 'todowrite',
    Skill: 'skill',
  };

  return {
    tool: toolMap[trimmed] ?? trimmed.toLowerCase(),
    pattern: null,
  };
}

type LegacyClaudeSettings = {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
};

function legacyArraysToScope(allow: string[], deny: string[]): PermissionScope {
  const scope: PermissionScope = {};

  const applyAction = (entry: string, action: PermissionAction): void => {
    const normalized = parseLegacyPermissionEntry(entry);
    if (!normalized) return;
    if (isBareBash(normalized.tool, normalized.pattern ?? '*')) return;

    if (!normalized.pattern) {
      scope[normalized.tool] = action;
      return;
    }

    const existing = scope[normalized.tool];
    if (typeof existing === 'object' && existing !== null) {
      scope[normalized.tool] = {
        ...existing,
        [normalized.pattern]: action,
      };
      return;
    }

    if (typeof existing === 'string') {
      scope[normalized.tool] = {
        '*': existing,
        [normalized.pattern]: action,
      };
      return;
    }

    scope[normalized.tool] = { [normalized.pattern]: action };
  };

  for (const entry of allow) applyAction(entry, 'allow');
  for (const entry of deny) applyAction(entry, 'deny');

  return scope;
}

async function readLegacySettings(
  rootDir: string,
): Promise<JeanClaudeSettings | null> {
  const readLegacyFile = async (
    filePath: string,
  ): Promise<LegacyClaudeSettings | null> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as LegacyClaudeSettings;
    } catch {
      return null;
    }
  };

  const [legacyProject, legacyWorktrees] = await Promise.all([
    readLegacyFile(getSettingsLocalPath(rootDir)),
    readLegacyFile(getWorktreeSettingsPath(rootDir)),
  ]);

  if (!legacyProject && !legacyWorktrees) {
    return null;
  }

  const projectScope = legacyArraysToScope(
    legacyProject?.permissions?.allow ?? [],
    legacyProject?.permissions?.deny ?? [],
  );
  const worktreeScope = legacyArraysToScope(
    legacyWorktrees?.permissions?.allow ?? [],
    legacyWorktrees?.permissions?.deny ?? [],
  );

  const settings: JeanClaudeSettings = {
    version: 1,
    permissions: {
      project: projectScope,
      ...(Object.keys(worktreeScope).length > 0
        ? { worktrees: { extends: 'project', ...worktreeScope } }
        : {}),
    },
  };

  return settings;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Gets the path to `.jean-claude/settings.local.json` for a given root directory.
 */
export function getSettingsPath(rootDir: string): string {
  return path.join(rootDir, SETTINGS_DIR, SETTINGS_FILENAME);
}

/**
 * Reads the `.jean-claude/settings.local.json` file.
 * Returns default settings if the file doesn't exist or is invalid.
 */
export async function readSettings(
  rootDir: string,
): Promise<JeanClaudeSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(rootDir), 'utf-8');
    const parsed = JSON.parse(content) as JeanClaudeSettings;
    if (parsed.version !== 1 || !parsed.permissions) {
      throw new Error('Invalid .jean-claude settings format');
    }

    return normalizeSettingsShape(parsed);
  } catch {
    const legacySettings = await readLegacySettings(rootDir);
    if (legacySettings) {
      return legacySettings;
    }
    return createDefaultSettings();
  }
}

/**
 * Writes the `.jean-claude/settings.local.json` file.
 * Creates the `.jean-claude` directory if needed.
 */
export async function writeSettings(
  rootDir: string,
  settings: JeanClaudeSettings,
): Promise<void> {
  const filePath = getSettingsPath(rootDir);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(settings, null, 2) + '\n',
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Rule Resolution (scope merging)
// ---------------------------------------------------------------------------

/**
 * Flatten a permission scope into an ordered list of rules.
 * Rules are emitted in object-key order (insertion order in JSON).
 *
 * For scalar configs like `"read": "allow"`, the pattern is `"*"`.
 * For pattern maps like `"bash": { "git *": "allow", "*": "ask" }`,
 * each entry becomes a separate rule.
 */
export function flattenScope(
  scope: PermissionScope | WorktreePermissionScope,
): ResolvedPermissionRule[] {
  const rules: ResolvedPermissionRule[] = [];
  for (const [tool, config] of Object.entries(scope)) {
    if (tool === 'extends') continue; // skip meta key
    if (typeof config === 'string') {
      // Scalar: "read": "allow"
      rules.push({ tool, pattern: '*', action: config as PermissionAction });
    } else if (typeof config === 'object' && config !== null) {
      // Pattern map: "bash": { "git *": "allow", "*": "ask" }
      for (const [pattern, action] of Object.entries(
        config as Record<string, PermissionAction>,
      )) {
        rules.push({ tool, pattern, action });
      }
    }
  }
  return rules;
}

/**
 * Resolve effective rules for a given context.
 *
 * If `isWorktree` is true and the worktrees scope has `extends: "project"`,
 * project rules come first, then worktree rules are appended.
 * Last-match-wins semantics: later rules override earlier ones for the same
 * tool+pattern combination during evaluation.
 *
 * If `isWorktree` is false, only project rules are used.
 */
export function resolveRules(
  settings: JeanClaudeSettings,
  isWorktree: boolean,
  globalRules?: ResolvedPermissionRule[],
): ResolvedPermissionRule[] {
  const projectRules = flattenScope(settings.permissions.project);
  const baseRules = [...(globalRules ?? []), ...projectRules];

  if (!isWorktree || !settings.permissions.worktrees) {
    return baseRules;
  }

  const worktreeScope = settings.permissions.worktrees;
  const worktreeRules = flattenScope(worktreeScope);

  if (worktreeScope.extends === 'project') {
    // Append worktree rules after base rules (last-match-wins)
    return [...baseRules, ...worktreeRules];
  }

  // No extends — worktree rules only (but still include global)
  return [...(globalRules ?? []), ...worktreeRules];
}

// ---------------------------------------------------------------------------
// Permission Evaluation
// ---------------------------------------------------------------------------

/**
 * Strip shell output redirections from a bash command.
 *
 * Removes patterns like `2>&1`, `>/dev/null`, `1>/tmp/out`, `2>/dev/null`,
 * `&>/dev/null`, `&>>file`, `>>file`, `<input`, etc. so that redirection
 * suffixes don't affect permission matching.
 */
export function stripRedirections(command: string): string {
  // Order matters: match compound redirections first, then simple ones.
  // &>> &> are bash-specific "redirect stdout+stderr"
  // N>&M (fd duplication, e.g. 2>&1)
  // N>>file, N>file (fd redirect to file)
  // >>file, >file (stdout redirect to file)
  // <file, <<EOF, <<<string (input redirections)
  return command
    .replace(/\d*>&\d+/g, '') // 2>&1, >&2
    .replace(/&>>\s*\S+/g, '') // &>>/dev/null
    .replace(/&>\s*\S+/g, '') // &>/dev/null
    .replace(/\d*>>\s*\S+/g, '') // 2>>/tmp/err, >>file
    .replace(/\d*>\s*\S+/g, '') // 2>/dev/null, >/dev/null
    .replace(/<<<\s*\S+/g, '') // <<<string
    .replace(/<<\s*\S+/g, '') // <<EOF
    .replace(/<\s*\S+/g, '') // <input
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * Match a value against a glob pattern.
 * Supports `*` (any chars except `/`), `**` (any chars including `/`), `?`.
 */
function matchPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  return picomatch.isMatch(value, pattern);
}

/**
 * Parse a compound shell command into individual sub-commands.
 *
 * Splits on `&&`, `||`, `;`, and `|` operators using `shell-quote`,
 * which correctly handles quoting (single, double), escape sequences,
 * command substitutions, and other shell syntax.
 *
 * Returns an array of trimmed, non-empty sub-command strings.
 * If the command has no compound operators, returns a single-element array.
 */
export function parseCompoundCommand(command: string): string[] {
  const parsed = shellParse(command);
  const commands: string[] = [];
  let currentTokens: string[] = [];

  for (const token of parsed) {
    if (typeof token === 'object' && token !== null && 'op' in token) {
      // Operator token — flush current command
      if (currentTokens.length > 0) {
        commands.push(currentTokens.join(' '));
        currentTokens = [];
      }
    } else if (typeof token === 'string') {
      currentTokens.push(token);
    }
    // Skip other token types (glob patterns, etc.)
  }

  // Push the last segment
  if (currentTokens.length > 0) {
    commands.push(currentTokens.join(' '));
  }

  return commands.length > 0 ? commands : [command.trim()];
}

/**
 * Evaluate a tool request against resolved permission rules.
 *
 * For bash commands, parses compound operators (&&, ||, ;, |) and evaluates
 * each sub-command independently. All sub-commands must be allowed for the
 * compound command to be allowed. If any sub-command is denied, the whole
 * command is denied. If any sub-command requires asking, the result is ask.
 *
 * @param rules - Ordered list of resolved rules (last match wins)
 * @param toolKey - The tool key (e.g., "bash", "read", "edit", "webfetch")
 * @param matchValue - The value to match against patterns
 *
 * @returns The action of the last matching rule, or `'ask'` if no rule matches.
 */
export function evaluatePermission(
  rules: ResolvedPermissionRule[],
  toolKey: string,
  matchValue: string,
): PermissionEvalResult {
  // For bash commands, parse compound operators and evaluate each sub-command
  if (toolKey === 'bash' && matchValue) {
    const subCommands = parseCompoundCommand(matchValue);
    if (subCommands.length > 1) {
      return evaluateCompoundPermission(rules, subCommands);
    }
  }

  return evaluateSinglePermission(rules, toolKey, matchValue);
}

function evaluateSinglePermission(
  rules: ResolvedPermissionRule[],
  toolKey: string,
  matchValue: string,
): PermissionEvalResult {
  // Strip redirections from bash commands so patterns like "pnpm lint*"
  // match "pnpm lint --fix 2>&1" the same as "pnpm lint --fix"
  const normalized =
    toolKey === 'bash' ? stripRedirections(matchValue) : matchValue;
  let result: PermissionEvalResult = 'ask';

  for (const rule of rules) {
    if (rule.tool !== toolKey && rule.tool !== '*') continue;
    if (matchPattern(rule.pattern, normalized)) {
      result = rule.action;
    }
  }

  return result;
}

function evaluateCompoundPermission(
  rules: ResolvedPermissionRule[],
  subCommands: string[],
): PermissionEvalResult {
  let combined: PermissionEvalResult = 'allow';

  for (const subCommand of subCommands) {
    const result = evaluateSinglePermission(rules, 'bash', subCommand);
    if (result === 'deny') return 'deny';
    if (result === 'ask') combined = 'ask';
  }

  return combined;
}

// ---------------------------------------------------------------------------
// Adding Permissions (from "Allow for Project" / "Allow for Worktrees" buttons)
// ---------------------------------------------------------------------------

/**
 * Returns true if a permission string represents bare "bash" without a
 * specific command. Bare bash must never be allowed.
 */
function isBareBash(tool: string, pattern: string): boolean {
  return tool.toLowerCase() === 'bash' && (pattern === '*' || pattern === '');
}

/**
 * Build a tool key and match value from a tool name and input.
 *
 * This normalizes tool names from different backends to our canonical keys:
 * - Claude uses PascalCase: "Bash", "Edit", "Write", "Read", "WebFetch"
 * - OpenCode uses lowercase: "bash", "edit", "write", "read", "webfetch"
 *
 * Returns { tool, matchValue } where:
 * - tool is the lowercase canonical key
 * - matchValue is the primary value to match against patterns
 */
export function normalizeToolRequest(
  toolName: string,
  input: Record<string, unknown>,
): { tool: string; matchValue: string } {
  const tool = toolName.toLowerCase();

  switch (tool) {
    case 'bash':
      return {
        tool: 'bash',
        matchValue: stripRedirections(String(input.command ?? '')),
      };
    case 'read':
      return {
        tool: 'read',
        matchValue: String(input.filePath ?? input.file_path ?? ''),
      };
    case 'edit':
      return {
        tool: 'edit',
        matchValue: String(input.filePath ?? input.file_path ?? ''),
      };
    case 'write':
      return {
        tool: 'write',
        matchValue: String(input.filePath ?? input.file_path ?? ''),
      };
    case 'glob':
      return {
        tool: 'glob',
        matchValue: String(input.pattern ?? ''),
      };
    case 'grep':
      return {
        tool: 'grep',
        matchValue: String(input.pattern ?? ''),
      };
    case 'webfetch':
    case 'web_fetch':
      return { tool: 'webfetch', matchValue: String(input.url ?? '') };
    case 'websearch':
    case 'web_search':
      return { tool: 'websearch', matchValue: String(input.query ?? '') };
    case 'task':
      return { tool: 'task', matchValue: '' };
    case 'todowrite':
    case 'todo_write':
      return { tool: 'todowrite', matchValue: '' };
    case 'skill':
      return { tool: 'skill', matchValue: String(input.name ?? '') };
    default:
      return { tool, matchValue: '' };
  }
}

export function buildToolPermissionConfig({
  existing,
  matchValue,
  action = 'allow',
}: {
  existing: ToolPermissionConfig | undefined;
  matchValue: string;
  action?: PermissionAction;
}): ToolPermissionConfig {
  if (!matchValue) {
    return action;
  }

  if (existing === action) {
    return existing;
  }

  if (typeof existing === 'object' && existing !== null) {
    return {
      ...existing,
      [matchValue]: action,
    };
  }

  if (typeof existing === 'string') {
    return {
      '*': existing,
      [matchValue]: action,
    };
  }

  return { [matchValue]: action };
}

/**
 * Add a permission rule to the project scope.
 * Writes to `.jean-claude/settings.local.json`.
 *
 * Security: refuses to add bare bash (no command pattern).
 */
export async function addProjectPermission(
  projectPath: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  const { tool, matchValue } = normalizeToolRequest(toolName, input);

  if (isBareBash(tool, matchValue || '*')) {
    dbg.agentPermission(
      'Refusing to allow bare "bash" — a specific command pattern is required',
    );
    return;
  }

  const settings = await readSettings(projectPath);
  settings.permissions.project[tool] = buildToolPermissionConfig({
    existing: settings.permissions.project[tool],
    matchValue,
  });

  await writeSettings(projectPath, settings);
}

/**
 * Add a permission rule to the worktrees scope.
 * Writes to `.jean-claude/settings.local.json`.
 *
 * Security: refuses to add bare bash (no command pattern).
 */
export async function addWorktreePermission(
  projectPath: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  const { tool, matchValue } = normalizeToolRequest(toolName, input);

  if (isBareBash(tool, matchValue || '*')) {
    dbg.agentPermission(
      'Refusing to allow bare "bash" — a specific command pattern is required',
    );
    return;
  }

  const settings = await readSettings(projectPath);

  if (!settings.permissions.worktrees) {
    settings.permissions.worktrees = { extends: 'project' };
  }

  const existing = settings.permissions.worktrees[tool];
  settings.permissions.worktrees[tool] = buildToolPermissionConfig({
    existing:
      existing === 'project' || existing === undefined
        ? undefined
        : (existing as ToolPermissionConfig),
    matchValue,
  });

  await writeSettings(projectPath, settings);
}

// ---------------------------------------------------------------------------
// Backend Compilation
// ---------------------------------------------------------------------------

/**
 * Compile resolved rules to Claude Code's permission format.
 *
 * Claude uses `{ permissions: { allow: string[], deny: string[] } }` where:
 * - Allow strings: tool name ("Edit") or "Bash(exact command)"
 * - Deny strings: same format
 *
 * Only rules with action `allow` or `deny` are compiled. Pattern rules for
 * bash become exact `Bash(pattern)` entries. Pattern rules for other tools
 * become bare tool name entries (Claude doesn't support pattern-based file
 * permissions).
 *
 * Note: This produces a "best effort" compilation. Claude's permission model
 * is simpler (exact match only), so some patterns may not translate perfectly.
 */
export function compileForClaude(rules: ResolvedPermissionRule[]): {
  allow: string[];
  deny: string[];
} {
  const allow: string[] = [];
  const deny: string[] = [];

  // Claude tool name mapping (lowercase → PascalCase)
  const toolNameMap: Record<string, string> = {
    bash: 'Bash',
    read: 'Read',
    edit: 'Edit',
    write: 'Write',
    glob: 'Glob',
    grep: 'Grep',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
    task: 'Task',
    todowrite: 'TodoWrite',
    skill: 'Skill',
  };

  for (const rule of rules) {
    if (rule.tool === '*') continue; // Claude doesn't support wildcard tool
    const claudeName = toolNameMap[rule.tool] ?? rule.tool;

    if (rule.tool === 'bash' && rule.pattern !== '*') {
      // Bash with specific pattern → Bash(pattern)
      const entry = `Bash(${rule.pattern})`;
      if (rule.action === 'allow' && !allow.includes(entry)) {
        allow.push(entry);
      } else if (rule.action === 'deny' && !deny.includes(entry)) {
        deny.push(entry);
      }
    } else if (rule.pattern === '*') {
      // Scalar rule → bare tool name
      if (rule.action === 'allow' && !allow.includes(claudeName)) {
        allow.push(claudeName);
      } else if (rule.action === 'deny' && !deny.includes(claudeName)) {
        deny.push(claudeName);
      }
    }
    // Non-bash pattern rules (e.g., file path patterns) are not supported
    // by Claude's permission model — they're silently skipped.
  }

  return { allow, deny };
}

/**
 * Compile resolved rules to OpenCode's `PermissionRuleset` format.
 *
 * OpenCode uses `Array<{ permission: string, pattern: string,
 * action: "allow" | "deny" | "ask" }>`.
 * This maps directly to our internal rule format.
 */
export function compileForOpenCode(
  rules: ResolvedPermissionRule[],
): Array<{ permission: string; pattern: string; action: PermissionAction }> {
  return rules.map((rule) => ({
    permission: rule.tool,
    pattern: rule.pattern,
    action: rule.action,
  }));
}

// ---------------------------------------------------------------------------
// Worktree Settings Compilation
// ---------------------------------------------------------------------------

/**
 * Build backend-specific settings files for a new worktree.
 *
 * Reads `.jean-claude/settings.local.json` from the source project,
 * resolves effective rules for worktree context, and writes:
 * - `.claude/settings.local.json` with Claude-compatible permissions
 * - (OpenCode permissions are passed at session creation, not via files)
 *
 * @param sourcePath - The project root (source repo)
 * @param destPath - The worktree root
 */
export async function buildWorktreeSettings(
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const globalPermissions = await import('./global-permissions-service');
  const globalRules = await globalPermissions.resolveGlobalRules();

  const settings = await readSettings(sourcePath);
  const rules = resolveRules(settings, true, globalRules);

  // Write Claude-compatible settings to worktree
  const claudePerms = compileForClaude(rules);
  if (claudePerms.allow.length > 0 || claudePerms.deny.length > 0) {
    const claudeSettingsPath = path.join(
      destPath,
      '.claude',
      'settings.local.json',
    );
    const claudeDir = path.dirname(claudeSettingsPath);
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      claudeSettingsPath,
      JSON.stringify({ permissions: claudePerms }, null, 2) + '\n',
      'utf-8',
    );
  }
}

// ---------------------------------------------------------------------------
// Effective Permission Evaluation (runtime)
// ---------------------------------------------------------------------------

/**
 * Load settings and evaluate a tool request.
 * This is the main entry point for runtime permission checking.
 *
 * @param projectPath - The project root (for reading settings)
 * @param isWorktree - Whether the task is running in a worktree
 * @param toolName - The tool name (backend-specific casing)
 * @param input - The tool input
 *
 * @returns The permission action: 'allow', 'deny', or 'ask'
 */
export async function evaluateToolPermission({
  projectPath,
  isWorktree,
  toolName,
  input,
}: {
  projectPath: string;
  isWorktree: boolean;
  toolName: string;
  input: Record<string, unknown>;
}): Promise<PermissionEvalResult> {
  const globalPermissions = await import('./global-permissions-service');
  const globalRules = await globalPermissions.resolveGlobalRules();

  const settings = await readSettings(projectPath);
  const rules = resolveRules(settings, isWorktree, globalRules);
  const { tool, matchValue } = normalizeToolRequest(toolName, input);
  return evaluatePermission(rules, tool, matchValue);
}

// ---------------------------------------------------------------------------
// Legacy Compatibility (to be removed when migration is complete)
// ---------------------------------------------------------------------------

/**
 * Gets the legacy path to .claude/settings.local.json for a given root directory.
 * @deprecated Use getSettingsPath() instead.
 */
export function getSettingsLocalPath(rootDir: string): string {
  return path.join(rootDir, '.claude', 'settings.local.json');
}

/**
 * Gets the legacy path to .claude/settings.local.worktrees.json for a given root directory.
 * @deprecated Use getSettingsPath() instead.
 */
export function getWorktreeSettingsPath(rootDir: string): string {
  return path.join(rootDir, '.claude', 'settings.local.worktrees.json');
}
