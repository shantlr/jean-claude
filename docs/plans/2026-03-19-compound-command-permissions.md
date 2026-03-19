# Compound Command Permission Evaluation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the permission system parse compound bash commands (`&&`, `||`, `;`, `|`) and evaluate each sub-command individually — if every sub-command is allowed, the whole command is allowed; if any is denied, the whole command is denied.

**Architecture:** Add a `parseCompoundCommand(command)` utility that splits shell command strings on `&&`, `||`, `;`, and `|` operators, then modify `evaluatePermission` to use it for bash tool requests. Each sub-command is evaluated independently, and the most restrictive result wins (`deny` > `ask` > `allow`).

**Tech Stack:** TypeScript, picomatch (already used), no new dependencies

---

## Design Decisions

### Splitting Strategy

Shell compound operators to handle:
- `&&` — run next if previous succeeded
- `||` — run next if previous failed
- `;` — run next unconditionally
- `|` — pipe stdout to next command

**Important edge cases:**
- Operators inside quotes must NOT split: `echo "hello && world"` is one command
- Operators inside subshells `$(...)` or backticks should NOT split
- Leading whitespace after split must be trimmed
- Empty segments (e.g., trailing `&&`) should be ignored

### Evaluation Logic

For a compound command `cmd1 && cmd2 | cmd3`:
1. Parse into `["cmd1", "cmd2", "cmd3"]`
2. Evaluate each sub-command against permission rules
3. Combine results with **most-restrictive-wins**:
   - If ANY sub-command is `deny` → whole command is `deny`
   - If ANY sub-command is `ask` (and none is `deny`) → whole command is `ask`
   - If ALL sub-commands are `allow` → whole command is `allow`

### Where the Change Lives

The compound parsing is isolated in `permission-settings-service.ts`:
- New function: `parseCompoundCommand(command: string): string[]`
- Modified function: `evaluatePermission()` — when `toolKey === 'bash'`, parse the matchValue and evaluate each part

This means both Claude Code and OpenCode backends benefit automatically since they both call `evaluatePermission()`.

### What This Does NOT Change

- Permission storage format (no schema changes)
- How permissions are added (still stores the full command string as the pattern)
- `compileForClaude()` / `compileForOpenCode()` (backend compilation unchanged)
- Non-bash tools (only bash commands are compound-parsed)

---

## Tasks

### Task 1: Add `parseCompoundCommand` utility

**Files:**
- Modify: `electron/services/permission-settings-service.ts`

**Step 1: Add the `parseCompoundCommand` function**

Add this function in the "Permission Evaluation" section, above `evaluatePermission`:

```typescript
/**
 * Parse a compound shell command into individual sub-commands.
 *
 * Splits on `&&`, `||`, `;`, and `|` operators, but respects:
 * - Single-quoted strings: 'hello && world'
 * - Double-quoted strings: "hello && world"
 * - Command substitutions: $(cmd1 && cmd2)
 * - Backtick substitutions: `cmd1 && cmd2`
 *
 * Returns an array of trimmed, non-empty sub-command strings.
 * If the command has no compound operators, returns a single-element array.
 */
export function parseCompoundCommand(command: string): string[] {
  const commands: string[] = [];
  let current = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let parenDepth = 0;
  let inBacktick = false;

  while (i < command.length) {
    const ch = command[i];

    // Handle escape sequences (backslash)
    if (ch === '\\' && i + 1 < command.length) {
      current += ch + command[i + 1];
      i += 2;
      continue;
    }

    // Toggle quote states
    if (ch === "'" && !inDoubleQuote && !inBacktick && parenDepth === 0) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      i++;
      continue;
    }
    if (ch === '"' && !inSingleQuote && !inBacktick && parenDepth === 0) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      i++;
      continue;
    }
    if (ch === '`' && !inSingleQuote && !inDoubleQuote && parenDepth === 0) {
      inBacktick = !inBacktick;
      current += ch;
      i++;
      continue;
    }

    // Track $(...) subshell depth
    if (
      ch === '$' &&
      i + 1 < command.length &&
      command[i + 1] === '(' &&
      !inSingleQuote &&
      !inDoubleQuote &&
      !inBacktick
    ) {
      parenDepth++;
      current += '$(';
      i += 2;
      continue;
    }
    if (ch === '(' && !inSingleQuote && !inDoubleQuote && !inBacktick && parenDepth > 0) {
      parenDepth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ')' && !inSingleQuote && !inDoubleQuote && !inBacktick && parenDepth > 0) {
      parenDepth--;
      current += ch;
      i++;
      continue;
    }

    // Only split when not inside quotes or subshells
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && parenDepth === 0) {
      // Check for && or ||
      if (
        (ch === '&' && i + 1 < command.length && command[i + 1] === '&') ||
        (ch === '|' && i + 1 < command.length && command[i + 1] === '|')
      ) {
        const trimmed = current.trim();
        if (trimmed) commands.push(trimmed);
        current = '';
        i += 2;
        continue;
      }

      // Check for single | (pipe) — but not ||
      if (ch === '|') {
        const trimmed = current.trim();
        if (trimmed) commands.push(trimmed);
        current = '';
        i++;
        continue;
      }

      // Check for ;
      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed) commands.push(trimmed);
        current = '';
        i++;
        continue;
      }
    }

    current += ch;
    i++;
  }

  // Push the last segment
  const trimmed = current.trim();
  if (trimmed) commands.push(trimmed);

  return commands.length > 0 ? commands : [command.trim()];
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add electron/services/permission-settings-service.ts
git commit -m "feat(permissions): add parseCompoundCommand utility for splitting shell commands"
```

---

### Task 2: Integrate compound parsing into `evaluatePermission`

**Files:**
- Modify: `electron/services/permission-settings-service.ts`

**Step 1: Modify `evaluatePermission` to handle compound bash commands**

Replace the existing `evaluatePermission` function with:

```typescript
/**
 * Evaluate a tool request against resolved permission rules.
 *
 * For bash commands, compound operators (&&, ||, ;, |) are parsed and each
 * sub-command is evaluated independently. The most restrictive result wins:
 * deny > ask > allow.
 *
 * @param rules - Ordered list of resolved rules (last match wins)
 * @param toolKey - The tool key (e.g., "bash", "read", "edit", "webfetch")
 * @param matchValue - The value to match against patterns
 * @returns The action of the last matching rule, or 'ask' if no rule matches.
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

/**
 * Evaluate a single tool request against resolved permission rules.
 * Last-match-wins semantics.
 */
function evaluateSinglePermission(
  rules: ResolvedPermissionRule[],
  toolKey: string,
  matchValue: string,
): PermissionEvalResult {
  let result: PermissionEvalResult = 'ask';

  for (const rule of rules) {
    if (rule.tool !== toolKey && rule.tool !== '*') continue;
    if (matchPattern(rule.pattern, matchValue)) {
      result = rule.action;
    }
  }

  return result;
}

/**
 * Evaluate a compound bash command by checking each sub-command.
 * Most-restrictive-wins: deny > ask > allow.
 */
function evaluateCompoundPermission(
  rules: ResolvedPermissionRule[],
  subCommands: string[],
): PermissionEvalResult {
  let combined: PermissionEvalResult = 'allow';

  for (const subCommand of subCommands) {
    const result = evaluateSinglePermission(rules, 'bash', subCommand);

    // deny is most restrictive — short-circuit
    if (result === 'deny') return 'deny';

    // ask is more restrictive than allow
    if (result === 'ask') combined = 'ask';
  }

  return combined;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Verify lint passes**

Run: `pnpm lint --fix && pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/services/permission-settings-service.ts
git commit -m "feat(permissions): evaluate compound bash commands by checking each sub-command"
```

---

### Task 3: Add `addProjectPermission` compound command support

When a user clicks "Allow for Project" on a compound command like `git status && npm test`, we should add individual permissions for each sub-command rather than storing the compound string as a single pattern (which would never match anything useful).

**Files:**
- Modify: `electron/services/permission-settings-service.ts`

**Step 1: Update `addProjectPermission` to decompose compound commands**

Replace the `addProjectPermission` function:

```typescript
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

  // For bash commands, decompose compound commands into individual permissions
  const matchValues =
    tool === 'bash' && matchValue
      ? parseCompoundCommand(matchValue)
      : [matchValue];

  for (const mv of matchValues) {
    if (isBareBash(tool, mv || '*')) continue;
    settings.permissions.project[tool] = buildAllowedToolConfig({
      existing: settings.permissions.project[tool],
      matchValue: mv,
    });
  }

  await writeSettings(projectPath, settings);
}
```

**Step 2: Update `addWorktreePermission` similarly**

Replace the `addWorktreePermission` function:

```typescript
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

  // For bash commands, decompose compound commands into individual permissions
  const matchValues =
    tool === 'bash' && matchValue
      ? parseCompoundCommand(matchValue)
      : [matchValue];

  for (const mv of matchValues) {
    if (isBareBash(tool, mv || '*')) continue;
    const existing = settings.permissions.worktrees[tool];
    settings.permissions.worktrees[tool] = buildAllowedToolConfig({
      existing:
        existing === 'project' || existing === undefined
          ? undefined
          : (existing as ToolPermissionConfig),
      matchValue: mv,
    });
  }

  await writeSettings(projectPath, settings);
}
```

**Step 3: Verify TypeScript compiles and lint passes**

Run: `pnpm ts-check && pnpm lint --fix && pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/services/permission-settings-service.ts
git commit -m "feat(permissions): decompose compound commands when adding project/worktree permissions"
```

---

### Task 4: Handle session-allowed compound commands in Claude Code backend

When a user clicks "Allow for Session" on a compound command, each sub-command should be individually added to the session-allowed set.

**Files:**
- Modify: `electron/services/agent-backends/claude/claude-code-backend.ts`

**Step 1: Find the session-allow logic**

In `claude-code-backend.ts`, find where `sessionAllowedTools` is updated when a permission is granted. Look for the `respondToPermission` method or where `toolsToAllow` is processed.

Search for `sessionAllowedTools` usage and find where new tools are pushed into it after a permission grant.

**Step 2: Update `buildPermissionOptions` to decompose compound commands**

In the `buildPermissionOptions` method (around line 520), update it so that `toolsToAllow` contains the individual sub-commands for compound bash commands:

```typescript
private buildPermissionOptions(
  toolName: string,
  input: Record<string, unknown>,
): {
  label: string;
  toolsToAllow: string[];
} {
  const { tool, matchValue } = normalizeToolRequest(toolName, input);

  // For compound bash commands, create individual session permissions
  if (tool === 'bash' && matchValue) {
    const subCommands = parseCompoundCommand(matchValue);
    if (subCommands.length > 1) {
      const permissions = subCommands
        .map((cmd) => `${tool}:${cmd}`)
        .filter((p) => !isBareBash('bash', p.slice(5)));
      return {
        label: `Allow ${toolName} for Session`,
        toolsToAllow: permissions,
      };
    }
  }

  const permission = matchValue ? `${tool}:${matchValue}` : tool;
  return {
    label: `Allow ${toolName} for Session`,
    toolsToAllow: [permission],
  };
}
```

Also import `parseCompoundCommand` at the top of the file (it should already import `normalizeToolRequest` and `evaluatePermission` from the permission service).

**Step 3: Verify TypeScript compiles and lint passes**

Run: `pnpm ts-check && pnpm lint --fix && pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/services/agent-backends/claude/claude-code-backend.ts
git commit -m "feat(permissions): decompose compound commands for session-allow in Claude backend"
```

---

### Task 5: Handle session-allowed compound commands in OpenCode backend

**Files:**
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts`

**Step 1: Find the session-allow logic in OpenCode backend**

Search for where `sessionAllowedTools` or the equivalent is managed in the OpenCode backend. The permission request handling is around line 720.

**Step 2: Apply the same decomposition pattern**

If OpenCode has a similar `buildPermissionOptions` or session-allow flow, apply the same compound command decomposition. If OpenCode handles session-allow differently, adapt accordingly — the key is that `git status && npm test` should result in individual `bash:git status` and `bash:npm test` entries in whatever session-allow mechanism OpenCode uses.

**Step 3: Verify TypeScript compiles and lint passes**

Run: `pnpm ts-check && pnpm lint --fix && pnpm lint`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/services/agent-backends/opencode/opencode-backend.ts
git commit -m "feat(permissions): decompose compound commands for session-allow in OpenCode backend"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `electron/services/permission-settings-service.ts` | Add `parseCompoundCommand()`, refactor `evaluatePermission()` to split into `evaluateSinglePermission()` + `evaluateCompoundPermission()`, update `addProjectPermission()` and `addWorktreePermission()` to decompose compound commands |
| `electron/services/agent-backends/claude/claude-code-backend.ts` | Decompose compound commands in `buildPermissionOptions()` for session-allow |
| `electron/services/agent-backends/opencode/opencode-backend.ts` | Same decomposition for OpenCode session-allow |

## Testing Checklist

Since there's no test framework, verify manually:

- [ ] `git status && git log` with `git *: allow` → auto-allowed
- [ ] `git status && rm -rf /` with `git *: allow` → asks (rm not allowed)
- [ ] `git status && rm -rf /` with `git *: allow, rm *: deny` → denied
- [ ] `echo "hello && world"` (quotes) → treated as single command, not split
- [ ] `git status | grep main` with `git *: allow, grep *: allow` → auto-allowed
- [ ] `echo $(git status && git log)` → treated as single command (subshell not split)
- [ ] "Allow for Project" on `git status && npm test` → stores two separate patterns
- [ ] "Allow for Session" on `git status && npm test` → both individually session-allowed
