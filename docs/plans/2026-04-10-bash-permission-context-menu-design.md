# Bash Permission Context Menu

## Overview

Add a right-click context menu on bash tool entries in the message stream with an "Add to permissions" option. When selected, opens a modal that parses the bash command, lets the user select/edit individual sub-commands, choose scope (project/worktree), and persist to the permissions file.

## Design

### Context Menu Trigger

- On bash tool `DotEntry` rows, intercept `onContextMenu`
- Show a positioned `<Dropdown>` at cursor coordinates with a single item: "Add to permissions…"
- Only shown for entries where `toolUse.name === 'bash'` and `input.command` exists

### Add to Permissions Modal

**Component:** `src/features/agent/ui-add-permission-modal/index.tsx`

**Parsed commands list:**
- Split command string using `&&` and `||` operators (simple split, same approach as `parseCompoundCommand` in the permission service)
- Each sub-command rendered as a row with:
  - Checkbox (default checked) — include/exclude
  - Editable text input — pre-filled with trimmed command

**Scope selector:**
- Radio group: "Project" / "Worktree" (worktree only shown if task has a worktree)

**Submit:**
- Calls new IPC `permissions:addBashPermissions({ taskId, commands, scope })`
- Handler resolves project path from task, calls `addProjectPermission` or `addWorktreePermission` for each command

### IPC

**New handler:** `permissions:addBashPermissions`
- Input: `{ taskId: string, commands: string[], scope: 'project' | 'worktree' }`
- Resolves project path from taskId
- For each command, calls `addProjectPermission(projectPath, 'Bash', { command })` or `addWorktreePermission(...)` based on scope

### Files Changed

- **New:** `src/features/agent/ui-add-permission-modal/index.tsx`
- **Modified:** `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` — context menu on bash entries
- **Modified:** `electron/ipc/handlers.ts` — new IPC handler
- **Modified:** `electron/preload.ts` — expose new method
- **Modified:** `src/lib/api.ts` — type new API method
