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
export type ToolPermissionConfig =
  | PermissionAction
  | Record<string, PermissionAction>;

/** The `project` scope — tool key → config, plus optional wildcard `*` default */
export type PermissionScope = {
  [tool: string]: ToolPermissionConfig;
};

/**
 * The `worktrees` scope — extends project scope.
 * `extends: "project"` means "start from project rules, then append these".
 * Only tool keys present here override project; others inherit unchanged.
 *
 * Note: the `extends` key is reserved and not a tool permission.
 */
export type WorktreePermissionScope = {
  extends?: 'project';
  [tool: string]: ToolPermissionConfig | 'project' | undefined;
};

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
