# Allow All Read/Write Permissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Allow All Read" and "Allow All Write" buttons to the permission bar, with Session / Project / Worktree scopes, so users can blanket-allow file operations instead of approving one-by-one.

**Architecture:** The permission bar currently shows per-file allow buttons for Read/Write tools. We add a second row of "Allow All" buttons specifically for Read/Write/Edit tools. These call existing `onAllowFor*` callbacks with empty input `{}`, which already produces the scalar `"allow"` form (e.g., `read: "allow"`). The session-allow check in the Claude backend needs a small fix to also match bare tool names (e.g., `"read"` matches any `read:*` request).

**Tech Stack:** React (UI), Electron IPC (persistence), TypeScript

---

### Task 1: Fix session-allow check to support bare tool names

**Problem:** Currently `session.sessionAllowedTools` uses exact string matching. If we add `"read"` (bare tool name) for "allow all", it won't match `"read:src/foo.ts"` (the canonical format for specific files). We need the check to also match bare tool names as wildcards.

**Files:**
- Modify: `electron/services/agent-backends/claude/claude-code-backend.ts:579-584`

**Step 1: Implement the fix**

In `handleToolRequest`, change the session-allowed check from:

```typescript
// Check session-allowed tools (canonical format: "tool:matchValue" or "tool")
const canonicalPermission = matchValue ? `${tool}:${matchValue}` : tool;
if (session.sessionAllowedTools.includes(canonicalPermission)) {
  dbg.agentPermission('Tool %s is session-allowed', toolName);
  return Promise.resolve({ behavior: 'allow', updatedInput: input });
}
```

To:

```typescript
// Check session-allowed tools (canonical format: "tool:matchValue" or "tool")
const canonicalPermission = matchValue ? `${tool}:${matchValue}` : tool;
if (
  session.sessionAllowedTools.includes(canonicalPermission) ||
  (matchValue && session.sessionAllowedTools.includes(tool))
) {
  dbg.agentPermission('Tool %s is session-allowed', toolName);
  return Promise.resolve({ behavior: 'allow', updatedInput: input });
}
```

The second condition (`matchValue && ...includes(tool)`) checks if the bare tool name (e.g., `"read"`) is in the allowed list, which acts as a wildcard "allow all" for that tool. The `matchValue` guard prevents double-checking when the canonical form is already bare.

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/services/agent-backends/claude/claude-code-backend.ts
git commit -m "fix: support bare tool names as wildcards in session-allowed tools check"
```

---

### Task 2: Add "Allow All" buttons to PermissionBar for Read/Write/Edit tools

**Files:**
- Modify: `src/features/agent/ui-permission-bar/index.tsx`

**Step 1: Add allow-all handler functions and UI buttons**

The key insight: calling the existing `onAllowForSession/Project/Worktree/Globally` callbacks with the tool name and empty input `{}` already produces the correct scalar `"allow"` permission. For example, `onAllowForProject?.('Read', {})` will call `normalizeToolRequest('Read', {})` → `{ tool: 'read', matchValue: '' }` → `buildToolPermissionConfig({ matchValue: '' })` → `'allow'` (scalar, meaning allow ALL reads).

Add a constant set for which tools get the "Allow All" treatment:

```typescript
const ALLOW_ALL_TOOLS = new Set(['Read', 'Write', 'Edit']);
```

Place this above the `PermissionBar` component.

Then inside `PermissionBar`, after the existing state declarations, add:

```typescript
const showAllowAll = ALLOW_ALL_TOOLS.has(request.toolName);
```

Add these handler functions inside the component (after `handleAllowGlobally`):

```typescript
const handleAllowAllForSession = () => {
  onAllowForSession?.(request.toolName, {});
  return onRespond(request.requestId, {
    behavior: 'allow',
    updatedInput: input,
    allowMode: 'session',
  });
};

const handleAllowAllForProject = () => {
  onAllowForSession?.(request.toolName, {});
  onAllowForProject?.(request.toolName, {});
  return onRespond(request.requestId, {
    behavior: 'allow',
    updatedInput: input,
    allowMode: 'project',
  });
};

const handleAllowAllForProjectWorktrees = () => {
  onAllowForSession?.(request.toolName, {});
  onAllowForProjectWorktrees?.(request.toolName, {});
  return onRespond(request.requestId, {
    behavior: 'allow',
    updatedInput: input,
    allowMode: 'worktree',
  });
};
```

Then in the JSX, add a second row of buttons after the existing button row (inside the `else` branch of `isOtherOpen`, after the closing `</div>` of the existing button row):

```tsx
{showAllowAll && sessionAllowButton && (
  <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-yellow-700/30 pt-2">
    <span className="text-ink-2 text-xs">
      Allow all {request.toolName}:
    </span>
    <div className="flex-1" />
    <Button
      onClick={handleAllowAllForSession}
      variant="secondary"
      size="sm"
      icon={<ShieldCheck />}
    >
      Session
    </Button>
    <Button
      onClick={handleAllowAllForProject}
      variant="secondary"
      size="sm"
      icon={<ShieldCheck />}
      className="bg-purple-600/30 hover:bg-purple-500/30"
    >
      Project
    </Button>
    {worktreePath && (
      <Button
        onClick={handleAllowAllForProjectWorktrees}
        variant="secondary"
        size="sm"
        icon={<ShieldCheck />}
        className="bg-amber-600/30 hover:bg-amber-500/30"
      >
        Worktree
      </Button>
    )}
  </div>
)}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/agent/ui-permission-bar/index.tsx
git commit -m "feat: add Allow All buttons for Read/Write/Edit in permission bar"
```

---

### Task 3: Final verification

**Step 1: Run full lint**

Run: `pnpm lint`
Expected: No errors

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No errors
