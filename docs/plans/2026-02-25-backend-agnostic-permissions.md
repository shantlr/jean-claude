# Backend-Agnostic Permissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Claude-specific permission settings system (`.claude/settings.local.json` + `.claude/settings.local.worktrees.json`) with a backend-agnostic permission system stored in `.jean-claude/settings.local.json` that supports pattern-based rules, compiles to both Claude and OpenCode formats, and handles runtime permission auto-allow/auto-deny.

**Architecture:** A single `.jean-claude/settings.local.json` file holds all permission rules in a terse format (tool key → action or pattern map). The permission service reads this file, resolves effective permissions (merging `worktrees` scope over `project` scope with last-match-wins), and exposes functions to: (1) evaluate a tool request against rules at runtime, (2) compile rules to backend-specific formats for session creation, and (3) add new rules when the user clicks "Allow for Project" / "Allow for Project Worktrees". Each backend adapter uses the compiled rules: Claude gets `{ permissions: { allow: [...] } }`, OpenCode gets `PermissionRuleset` at session creation. At runtime, both backends call the shared evaluator before forwarding permission requests to the UI.

**Tech Stack:** TypeScript, Node.js `fs`, `path`, glob pattern matching via `picomatch`, OpenCode SDK `PermissionRuleset` types, existing Claude permission format.

**Design doc:** See conversation history — all design decisions are locked.

---

### Task 1: Create Shared Permission Types

**Files:**
- Create: `shared/permission-types.ts`

**Step 1: Create the types file**

Create `shared/permission-types.ts` with the following types:

```typescript
/**
 * Backend-agnostic permission system types.
 *
 * Permissions are stored in `.jean-claude/settings.local.json` with two scopes:
 * - `project`: base rules for the project
 * - `worktrees`: overrides that extend project rules (append, last-match-wins)
 */

/** Action for a single permission rule */
export type PermissionAction = 'allow' | 'ask' | 'deny';

/**
 * A tool's permission config — either a scalar action for the whole tool,
 * or a pattern map where keys are glob patterns and values are actions.
 *
 * Examples:
 *   "read": "allow"                         — scalar: allow all reads
 *   "bash": { "git status*": "allow", "*": "ask" }  — pattern map
 */
export type ToolPermissionConfig = PermissionAction | Record<string, PermissionAction>;

/** The `project` scope — tool key → config, plus optional wildcard `*` default */
export type PermissionScope = Record<string, ToolPermissionConfig>;

/**
 * The `worktrees` scope — extends project scope.
 * `extends: "project"` means "start from project rules, then append these".
 * Only tool keys present here override project; others inherit unchanged.
 */
export interface WorktreePermissionScope extends PermissionScope {
  extends?: 'project';
}

/** Top-level permissions object in the settings file */
export interface PermissionSettings {
  project: PermissionScope;
  worktrees?: WorktreePermissionScope;
}

/** The full `.jean-claude/settings.local.json` file shape */
export interface JeanClaudeSettings {
  version: 1;
  permissions: PermissionSettings;
}

/**
 * A single resolved permission rule after flattening.
 * Used internally by the matcher — not serialized.
 */
export interface ResolvedPermissionRule {
  tool: string;
  pattern: string; // '*' for scalar rules, glob pattern for pattern-map rules
  action: PermissionAction;
}

/**
 * Result of evaluating a tool request against permission rules.
 * - `allow`: auto-allow, don't prompt the user
 * - `deny`: auto-deny silently, don't prompt the user
 * - `ask`: show the permission UI to the user
 */
export type PermissionEvalResult = PermissionAction;
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No errors related to `shared/permission-types.ts`

**Step 3: Commit**

```bash
git add shared/permission-types.ts
git commit -m "feat: add shared permission types for backend-agnostic permission system"
```

---

### Task 2: Install `picomatch` for Glob Pattern Matching

**Files:**
- Modify: `package.json`

**Step 1: Install picomatch**

```bash
pnpm add picomatch
pnpm add -D @types/picomatch
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add picomatch for glob pattern matching in permissions"
```

---

### Task 3: Rewrite Permission Settings Service — Core Logic

This is the largest task. The old service is completely replaced with new logic.

**Files:**
- Rewrite: `electron/services/permission-settings-service.ts` (365 lines → ~300 lines)

**Step 1: Replace the entire file**

Replace `electron/services/permission-settings-service.ts` with the following implementation:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import picomatch from 'picomatch';

import { dbg } from '../lib/debug';
import type {
  JeanClaudeSettings,
  PermissionAction,
  PermissionEvalResult,
  PermissionScope,
  ResolvedPermissionRule,
  ToolPermissionConfig,
  WorktreePermissionScope,
} from '../../shared/permission-types';

// Re-export types for convenience
export type { JeanClaudeSettings, PermissionAction, PermissionEvalResult };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_FILENAME = 'settings.local.json';
const SETTINGS_DIR = '.jean-claude';

const DEFAULT_SETTINGS: JeanClaudeSettings = {
  version: 1,
  permissions: {
    project: {},
  },
};

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
      return { ...DEFAULT_SETTINGS };
    }
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
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
function flattenScope(scope: PermissionScope): ResolvedPermissionRule[] {
  const rules: ResolvedPermissionRule[] = [];
  for (const [tool, config] of Object.entries(scope)) {
    if (tool === 'extends') continue; // skip meta key
    if (typeof config === 'string') {
      // Scalar: "read": "allow"
      rules.push({ tool, pattern: '*', action: config });
    } else if (typeof config === 'object' && config !== null) {
      // Pattern map: "bash": { "git *": "allow", "*": "ask" }
      for (const [pattern, action] of Object.entries(config)) {
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
): ResolvedPermissionRule[] {
  const projectRules = flattenScope(settings.permissions.project);

  if (!isWorktree || !settings.permissions.worktrees) {
    return projectRules;
  }

  const worktreeScope = settings.permissions.worktrees;
  const worktreeRules = flattenScope(worktreeScope);

  if (worktreeScope.extends === 'project') {
    // Append worktree rules after project rules (last-match-wins)
    return [...projectRules, ...worktreeRules];
  }

  // No extends — worktree rules only
  return worktreeRules;
}

// ---------------------------------------------------------------------------
// Permission Evaluation
// ---------------------------------------------------------------------------

/**
 * Match a value against a glob pattern.
 * Supports `*` (any chars except `/`), `**` (any chars including `/`), `?`.
 */
function matchPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  return picomatch.isMatch(value, pattern);
}

/**
 * Evaluate a tool request against resolved permission rules.
 *
 * @param rules - Ordered list of resolved rules (last match wins)
 * @param toolKey - The tool key (e.g., "bash", "read", "edit", "webfetch")
 * @param matchValue - The value to match against patterns:
 *   - For bash: the command string
 *   - For read/edit/write: the file path
 *   - For webfetch: the URL
 *   - For tools with no pattern: empty string (matches `*`)
 *
 * @returns The action of the last matching rule, or `'ask'` if no rule matches.
 *
 * Matching logic (last-match-wins):
 * 1. Iterate all rules in order
 * 2. For each rule where `rule.tool` matches the toolKey (or is `*`):
 *    - If `rule.pattern` is `*`, it matches anything
 *    - Otherwise, test `rule.pattern` against `matchValue` via glob
 * 3. The action of the *last* matching rule wins
 * 4. If no rule matches, return `'ask'`
 */
export function evaluatePermission(
  rules: ResolvedPermissionRule[],
  toolKey: string,
  matchValue: string,
): PermissionEvalResult {
  let result: PermissionEvalResult = 'ask';

  for (const rule of rules) {
    // Tool must match exactly or be wildcard
    if (rule.tool !== toolKey && rule.tool !== '*') continue;

    // Pattern matching
    if (matchPattern(rule.pattern, matchValue)) {
      result = rule.action;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Adding Permissions (from "Allow for Project" / "Allow for Worktrees" buttons)
// ---------------------------------------------------------------------------

/**
 * Returns true if a permission string represents bare "bash" without a specific command.
 * Bare bash must never be allowed.
 */
function isBareBash(tool: string, pattern: string): boolean {
  return (
    tool.toLowerCase() === 'bash' && (pattern === '*' || pattern === '')
  );
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
      return { tool: 'bash', matchValue: String(input.command ?? '').trim() };
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

  if (matchValue) {
    // Pattern-based: add/update in pattern map
    const existing = settings.permissions.project[tool];
    if (typeof existing === 'object' && existing !== null) {
      existing[matchValue] = 'allow';
    } else {
      settings.permissions.project[tool] = { [matchValue]: 'allow' };
    }
  } else {
    // Scalar: set the whole tool to allow
    settings.permissions.project[tool] = 'allow';
  }

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

  if (matchValue) {
    const existing = settings.permissions.worktrees[tool];
    if (typeof existing === 'object' && existing !== null) {
      (existing as Record<string, PermissionAction>)[matchValue] = 'allow';
    } else {
      settings.permissions.worktrees[tool] = { [matchValue]: 'allow' };
    }
  } else {
    settings.permissions.worktrees[tool] = 'allow';
  }

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
 * Only rules with action `allow` are compiled. Pattern rules for bash become
 * exact `Bash(pattern)` entries. Pattern rules for other tools become bare
 * tool name entries (Claude doesn't support pattern-based file permissions).
 *
 * Note: This produces a "best effort" compilation. Claude's permission model
 * is simpler (exact match only), so some patterns may not translate perfectly.
 */
export function compileForClaude(
  rules: ResolvedPermissionRule[],
): { allow: string[]; deny: string[] } {
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
 * OpenCode uses `Array<{ permission: string, pattern: string, action: "allow" | "deny" | "ask" }>`.
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
  const settings = await readSettings(sourcePath);
  const rules = resolveRules(settings, true);

  // Write Claude-compatible settings to worktree
  const claudePerms = compileForClaude(rules);
  if (claudePerms.allow.length > 0 || claudePerms.deny.length > 0) {
    const claudeSettingsPath = path.join(destPath, '.claude', 'settings.local.json');
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
 * @param workingDir - The task's working directory (project root or worktree)
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
  const settings = await readSettings(projectPath);
  const rules = resolveRules(settings, isWorktree);
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
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: Some errors in files that import removed functions (`isToolAllowedByPermissions`, `buildPermissionString`, `mergePermissions`, `getEffectivePermissions`, `addAllowPermission`). These will be fixed in subsequent tasks.

Run: `pnpm lint --fix`

**Step 3: Commit**

```bash
git add electron/services/permission-settings-service.ts
git commit -m "feat: rewrite permission-settings-service with backend-agnostic rules"
```

---

### Task 4: Update Agent Service — Runtime Permission Evaluation

**Files:**
- Modify: `electron/services/agent-service.ts:241-266`

**Step 1: Update imports**

At the top of `agent-service.ts`, find the import from `permission-settings-service`:

```typescript
import { getEffectivePermissions } from './permission-settings-service';
```

Replace with:

```typescript
import {
  evaluateToolPermission,
  readSettings,
  resolveRules,
  compileForClaude,
  compileForOpenCode,
} from './permission-settings-service';
```

**Step 2: Update `runBackend` to pass compiled permissions**

In `runBackend()`, replace the permission loading block (around lines 241-249):

```typescript
    // Load settings file permissions and merge with task's sessionAllowedTools.
    // This ensures permissions set via "Allow for Project" / "Allow for Worktrees"
    // are available for auto-allow logic (e.g., Bash commands auto-allowed when
    // Read/Write is permitted via settings files).
    const settingsPermissions = await getEffectivePermissions(workingDir);
    const taskAllowedTools = task.sessionAllowedTools ?? [];
    const mergedAllowedTools = [
      ...new Set([...taskAllowedTools, ...settingsPermissions]),
    ];
```

With:

```typescript
    // Load backend-agnostic permissions and compile for the target backend.
    const isWorktree = !!task.worktreePath;
    const settings = await readSettings(project.path);
    const rules = resolveRules(settings, isWorktree);

    // Compile to backend-specific format
    let sessionAllowedTools: string[] = [];
    if (session.backendType === 'claude-code') {
      const claudePerms = compileForClaude(rules);
      sessionAllowedTools = [
        ...new Set([
          ...claudePerms.allow,
          ...(task.sessionAllowedTools ?? []),
        ]),
      ];
    }
    // For OpenCode, permissions are passed via PermissionRuleset at session creation
    // (handled in opencode-backend.ts). sessionAllowedTools is not used.
```

**Step 3: Update the backend start call**

Update the `session.backend.start()` call to pass the resolved rules via the config. First, add a new field to `AgentBackendConfig` (done in Task 5). For now, pass `sessionAllowedTools` as before for Claude, and add the rules for OpenCode:

Replace:

```typescript
    const agentSession = await session.backend.start(
      {
        type: session.backendType,
        cwd: workingDir,
        interactionMode: normalizeInteractionModeForBackend({
          backend: session.backendType,
          mode: (task.interactionMode ?? 'ask') as InteractionMode,
        }),
        model:
          task.modelPreference && task.modelPreference !== 'default'
            ? task.modelPreference
            : undefined,
        sessionId: session.sdkSessionId ?? undefined,
        sessionAllowedTools: mergedAllowedTools,
      },
      prompt,
    );
```

With:

```typescript
    const agentSession = await session.backend.start(
      {
        type: session.backendType,
        cwd: workingDir,
        interactionMode: normalizeInteractionModeForBackend({
          backend: session.backendType,
          mode: (task.interactionMode ?? 'ask') as InteractionMode,
        }),
        model:
          task.modelPreference && task.modelPreference !== 'default'
            ? task.modelPreference
            : undefined,
        sessionId: session.sdkSessionId ?? undefined,
        sessionAllowedTools,
        permissionRules: rules,
      },
      prompt,
    );
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: Error about `permissionRules` not existing on `AgentBackendConfig` — fixed in Task 5.

**Step 5: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat: use backend-agnostic permissions in agent service"
```

---

### Task 5: Update AgentBackendConfig Type

**Files:**
- Modify: `shared/agent-backend-types.ts:23-30`

**Step 1: Add permissionRules to AgentBackendConfig**

Add the import at the top of the file:

```typescript
import type { ResolvedPermissionRule } from './permission-types';
```

Update `AgentBackendConfig` to add the new field:

```typescript
export interface AgentBackendConfig {
  type: AgentBackendType;
  cwd: string;
  interactionMode: InteractionMode;
  model?: string;
  sessionId?: string; // for session resumption
  sessionAllowedTools?: string[];
  /** Backend-agnostic permission rules for runtime evaluation */
  permissionRules?: ResolvedPermissionRule[];
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No new errors from this change.

**Step 3: Commit**

```bash
git add shared/agent-backend-types.ts
git commit -m "feat: add permissionRules to AgentBackendConfig"
```

---

### Task 6: Update OpenCode Backend — Pass Permissions at Session Creation

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts:330-344`

**Step 1: Update imports**

Add import at the top of the file:

```typescript
import {
  compileForOpenCode,
  evaluatePermission,
  normalizeToolRequest,
} from '../../permission-settings-service';
```

**Step 2: Update `createSession` to pass PermissionRuleset**

Replace the `createSession` method (lines 330-344):

```typescript
  private async createSession(
    client: OpencodeClient,
    config: AgentBackendConfig,
  ): Promise<OcSession> {
    const result = await client.session.create({
      directory: config.cwd,
    });

    if (!result.data) {
      throw new Error('Failed to create OpenCode session');
    }

    dbg.agent('Created OpenCode session %s', result.data.id);
    return result.data;
  }
```

With:

```typescript
  private async createSession(
    client: OpencodeClient,
    config: AgentBackendConfig,
  ): Promise<OcSession> {
    // Compile permission rules to OpenCode's PermissionRuleset format
    const permission = config.permissionRules
      ? compileForOpenCode(config.permissionRules)
      : undefined;

    const result = await client.session.create({
      directory: config.cwd,
      ...(permission && permission.length > 0
        ? { body: { permission } }
        : {}),
    });

    if (!result.data) {
      throw new Error('Failed to create OpenCode session');
    }

    dbg.agent(
      'Created OpenCode session %s with %d permission rules',
      result.data.id,
      permission?.length ?? 0,
    );
    return result.data;
  }
```

**Step 3: Store permission rules in session state for runtime evaluation**

Find the `OpenCodeSessionState` interface (search for it in the file) and add:

```typescript
  /** Resolved permission rules for runtime evaluation */
  permissionRules: ResolvedPermissionRule[];
```

Update wherever `OpenCodeSessionState` is constructed (in the `start()` method) to include:

```typescript
  permissionRules: config.permissionRules ?? [],
```

**Step 4: Add auto-response logic for permission.asked events**

In the `createEventStream` method, find where `permission.asked` events are processed. The normalizer emits `permission-request` events. After normalization, before yielding, add auto-response logic:

Find the section in `createEventStream` that handles events from the SSE stream. Look for where normalized events are yielded. Add a check:

```typescript
// After normalizing the event, before yielding permission-request events:
if (normalizedEvent.type === 'permission-request') {
  const req = normalizedEvent.request;
  const { tool, matchValue } = normalizeToolRequest(
    req.toolName,
    req.input,
  );
  const action = evaluatePermission(
    state.permissionRules,
    tool,
    matchValue,
  );

  if (action === 'allow') {
    // Auto-allow: respond immediately without showing UI
    dbg.agentPermission(
      'Auto-allowing %s (pattern match)',
      req.toolName,
    );
    const { client: ocClient } = await getOrCreateServer();
    await ocClient.permission.reply({
      requestID: req.requestId,
      directory: state.cwd,
      reply: 'once',
    });
    continue; // Don't yield the permission-request event
  }

  if (action === 'deny') {
    // Auto-deny: respond immediately without showing UI
    dbg.agentPermission(
      'Auto-denying %s (pattern match)',
      req.toolName,
    );
    const { client: ocClient } = await getOrCreateServer();
    await ocClient.permission.reply({
      requestID: req.requestId,
      directory: state.cwd,
      reply: 'reject',
    });
    continue; // Don't yield the permission-request event
  }
}
```

> **Important implementation note:** The exact location of this code depends on how normalized events are processed in the event stream loop. The implementer should find the loop that processes SSE events, normalizes them, and yields AgentEvents. The auto-response check goes between normalization and yielding for `permission-request` type events.

**Step 5: Verify**

Run: `pnpm ts-check`
Expected: May need to adjust the `session.create` call shape depending on SDK types. The `body` parameter wrapping may need adjustment — check `SessionCreateData` type.

Run: `pnpm lint --fix`

**Step 6: Commit**

```bash
git add electron/services/agent-backends/opencode/opencode-backend.ts
git commit -m "feat: pass permission rules at OpenCode session creation and auto-respond"
```

---

### Task 7: Update Claude Backend — Use New Permission Evaluation

**Files:**
- Modify: `electron/services/agent-backends/claude/claude-code-backend.ts:424-439`

**Step 1: Update imports**

Replace the import of `isToolAllowedByPermissions`:

```typescript
import { isToolAllowedByPermissions } from '../../permission-settings-service';
```

With:

```typescript
import {
  evaluatePermission,
  normalizeToolRequest,
} from '../../permission-settings-service';
import type { ResolvedPermissionRule } from '../../../shared/permission-types';
```

**Step 2: Store permission rules in session state**

Find the `ClaudeSession` interface/type and add:

```typescript
  permissionRules: ResolvedPermissionRule[];
```

Update wherever `ClaudeSession` is constructed to include:

```typescript
  permissionRules: config.permissionRules ?? [],
```

**Step 3: Update `handleToolRequest` to use new evaluator**

In `handleToolRequest` (line 424), replace the permission check block:

```typescript
    // Check if tool is in session-allowed list
    if (
      isToolAllowedByPermissions(toolName, input, session.sessionAllowedTools, {
        workingDir: session.workingDir,
      })
    ) {
      dbg.agentPermission('Tool %s is session-allowed', toolName);
      return Promise.resolve({ behavior: 'allow', updatedInput: input });
    }
```

With:

```typescript
    // Check against backend-agnostic permission rules
    const { tool, matchValue } = normalizeToolRequest(toolName, input);
    const action = evaluatePermission(
      session.permissionRules,
      tool,
      matchValue,
    );
    if (action === 'allow') {
      dbg.agentPermission('Tool %s auto-allowed by permission rules', toolName);
      return Promise.resolve({ behavior: 'allow', updatedInput: input });
    }
    if (action === 'deny') {
      dbg.agentPermission('Tool %s auto-denied by permission rules', toolName);
      return Promise.resolve({ behavior: 'deny', updatedInput: input });
    }

    // Also check legacy session-allowed tools for backward compat
    if (session.sessionAllowedTools.includes(toolName)) {
      dbg.agentPermission('Tool %s is session-allowed (legacy)', toolName);
      return Promise.resolve({ behavior: 'allow', updatedInput: input });
    }
```

**Step 4: Verify**

Run: `pnpm ts-check`
Run: `pnpm lint --fix`
Expected: Clean

**Step 5: Commit**

```bash
git add electron/services/agent-backends/claude/claude-code-backend.ts
git commit -m "feat: use backend-agnostic permission evaluation in Claude backend"
```

---

### Task 8: Update IPC Handlers — Write to `.jean-claude/settings.local.json`

**Files:**
- Modify: `electron/ipc/handlers.ts:446-558`

**Step 1: Update imports**

Replace the import from `permission-settings-service`:

```typescript
import {
  addAllowPermission,
  buildPermissionString,
  getSettingsLocalPath,
  getWorktreeSettingsPath,
} from '../services/permission-settings-service';
```

With:

```typescript
import {
  addProjectPermission,
  addWorktreePermission,
  normalizeToolRequest,
} from '../services/permission-settings-service';
```

**Step 2: Update `tasks:addSessionAllowedTool`**

Replace the handler at line 446:

```typescript
  ipcMain.handle(
    'tasks:addSessionAllowedTool',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      const currentTools = task?.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }
      return TaskRepository.findById(taskId);
    },
  );
```

With:

```typescript
  ipcMain.handle(
    'tasks:addSessionAllowedTool',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      // Build a legacy-compatible permission string for session-level tracking
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const permission =
        tool === 'bash' && matchValue
          ? `Bash(${matchValue})`
          : toolName;
      if (tool === 'bash' && !matchValue) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      const currentTools = task?.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }
      return TaskRepository.findById(taskId);
    },
  );
```

**Step 3: Update `tasks:allowForProject`**

Replace the handler at line 479:

```typescript
  ipcMain.handle(
    'tasks:allowForProject',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Update original repo settings.local.json
      await addAllowPermission(getSettingsLocalPath(project.path), permission);

      // If worktree task, also update worktree settings.local.json
      if (task.worktreePath) {
        await addAllowPermission(
          getSettingsLocalPath(task.worktreePath),
          permission,
        );
      }

      // Also add to session allowed tools
      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

      return TaskRepository.findById(taskId);
    },
  );
```

With:

```typescript
  ipcMain.handle(
    'tasks:allowForProject',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (project scope)
      await addProjectPermission(project.path, toolName, input);

      // Also add to session allowed tools for immediate effect
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const permission =
        tool === 'bash' && matchValue
          ? `Bash(${matchValue})`
          : toolName;
      if (tool === 'bash' && !matchValue) return TaskRepository.findById(taskId);

      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

      return TaskRepository.findById(taskId);
    },
  );
```

**Step 4: Update `tasks:allowForProjectWorktrees`**

Replace the handler at line 518:

```typescript
  ipcMain.handle(
    'tasks:allowForProjectWorktrees',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Update original repo settings.local.worktrees.json
      await addAllowPermission(
        getWorktreeSettingsPath(project.path),
        permission,
      );

      // Update worktree settings.local.json (task must be worktree task)
      if (task.worktreePath) {
        await addAllowPermission(
          getSettingsLocalPath(task.worktreePath),
          permission,
        );
      }

      // Also add to session allowed tools
      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

      return TaskRepository.findById(taskId);
    },
  );
```

With:

```typescript
  ipcMain.handle(
    'tasks:allowForProjectWorktrees',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (worktrees scope)
      await addWorktreePermission(project.path, toolName, input);

      // Also add to session allowed tools for immediate effect
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const permission =
        tool === 'bash' && matchValue
          ? `Bash(${matchValue})`
          : toolName;
      if (tool === 'bash' && !matchValue) return TaskRepository.findById(taskId);

      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

      return TaskRepository.findById(taskId);
    },
  );
```

**Step 5: Verify**

Run: `pnpm ts-check`
Run: `pnpm lint --fix`
Expected: Clean

**Step 6: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: update IPC handlers to write to .jean-claude/settings.local.json"
```

---

### Task 9: Update Worktree Service — Use New `buildWorktreeSettings`

**Files:**
- Modify: `electron/services/worktree-service.ts:613-618`

**Step 1: Update import**

The import of `buildWorktreeSettings` should already point to `permission-settings-service`. Verify it's correct:

```typescript
import { buildWorktreeSettings } from './permission-settings-service';
```

The new `buildWorktreeSettings` has the same signature `(sourcePath, destPath) => Promise<void>`, so no call-site changes are needed.

**Step 2: Update the comment**

At line 613, update the comment:

```typescript
  // Build Claude local settings by merging settings.local.json and settings.local.worktrees.json
```

To:

```typescript
  // Build backend-specific permission settings for the worktree
```

**Step 3: Update the error message**

At line 617, update:

```typescript
    dbg.worktree('Failed to build Claude settings for worktree: %O', error);
```

To:

```typescript
    dbg.worktree('Failed to build permission settings for worktree: %O', error);
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: Clean

**Step 5: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "refactor: update worktree service to use backend-agnostic permission settings"
```

---

### Task 10: Fix Any Remaining Compilation Errors and Lint

**Files:**
- Various (any files with remaining import/usage errors)

**Step 1: Run ts-check and fix errors**

Run: `pnpm ts-check`

Look for any remaining references to removed functions:
- `isToolAllowedByPermissions` — should be replaced by `evaluatePermission`
- `buildPermissionString` — should be replaced by `normalizeToolRequest`
- `addAllowPermission` — should be replaced by `addProjectPermission` / `addWorktreePermission`
- `mergePermissions` — removed (merging now handled by `resolveRules`)
- `getEffectivePermissions` — removed (replaced by `evaluateToolPermission`)

Fix any remaining references.

**Step 2: Run lint**

Run: `pnpm lint --fix`

Fix any lint errors.

**Step 3: Verify everything compiles**

Run: `pnpm ts-check`
Expected: Clean, no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve remaining compilation and lint errors from permission refactor"
```

---

### Task 11: Verify OpenCode Session.create API Shape

**Files:**
- Modify (if needed): `electron/services/agent-backends/opencode/opencode-backend.ts`

**Step 1: Verify the SDK's session.create call signature**

The OpenCode SDK `SessionCreateData` type shows:

```typescript
type SessionCreateData = {
  body?: {
    parentID?: string;
    title?: string;
    permission?: PermissionRuleset;
  };
  query?: { directory?: string };
};
```

The SDK client's `session.create()` method accepts the top-level object, so check whether `directory` should be in `query` or passed differently. The current code uses:

```typescript
client.session.create({ directory: config.cwd })
```

The new code should be:

```typescript
client.session.create({
  directory: config.cwd,
  ...(permission && permission.length > 0
    ? { body: { permission } }
    : {}),
});
```

> **Note for implementer:** The SDK may flatten `body` and `query` parameters. Check how the existing `directory` parameter is passed and follow the same pattern for `permission`. If `directory` is a top-level param, then `permission` might also be top-level. Inspect the actual SDK client wrapper to confirm.

**Step 2: Test manually**

Start the app with `pnpm dev`. Create a project. Create a `.jean-claude/settings.local.json` file in the project directory with:

```json
{
  "version": 1,
  "permissions": {
    "project": {
      "read": "allow",
      "edit": "ask",
      "bash": {
        "git status": "allow",
        "git diff*": "allow",
        "*": "ask"
      }
    }
  }
}
```

Start a task with OpenCode backend. Verify:
- `git status` command is auto-allowed
- `git diff` command is auto-allowed
- Other bash commands prompt the permission UI
- Read operations are auto-allowed

**Step 3: Commit if any changes were needed**

```bash
git add -A
git commit -m "fix: correct OpenCode session.create permission passing"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `shared/permission-types.ts` | **New** — Shared types for the permission system |
| `shared/agent-backend-types.ts` | Add `permissionRules` to `AgentBackendConfig` |
| `electron/services/permission-settings-service.ts` | **Rewrite** — New backend-agnostic logic |
| `electron/services/agent-service.ts` | Use new permission compilation in `runBackend` |
| `electron/services/agent-backends/opencode/opencode-backend.ts` | Pass `PermissionRuleset` at session creation, auto-respond to permission events |
| `electron/services/agent-backends/claude/claude-code-backend.ts` | Use new evaluator in `handleToolRequest` |
| `electron/ipc/handlers.ts` | Write to `.jean-claude/settings.local.json` via new API |
| `electron/services/worktree-service.ts` | Comment/message updates (signature unchanged) |
| `package.json` | Add `picomatch` dependency |

## Task Dependency Graph

```
Task 1 (types) ──┐
Task 2 (picomatch)├──→ Task 3 (service rewrite) ──→ Task 4 (agent-service)
                  │                                          │
                  └──→ Task 5 (config type) ────────────────┤
                                                             │
                                          Task 6 (opencode) ←┘
                                          Task 7 (claude) ←──┘
                                          Task 8 (IPC) ←─────┘
                                          Task 9 (worktree) ←┘
                                                    │
                                          Task 10 (fix errors) ←┘
                                          Task 11 (verify SDK) ←┘
```

Tasks 1, 2, and 5 can run in parallel. Tasks 3-11 are sequential.
