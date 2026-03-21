# Global Permissions Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global permissions file at `~/.config/jean-claude/settings.json` that stores permissions applied to all projects, resolved first (before project-level permissions) in the permission chain, with a UI in global settings to manage them.

**Architecture:** The global permissions file uses the same `PermissionScope` format as project permissions. During permission resolution, global rules are prepended before project rules (last-match-wins means project rules override global). A new `global-permissions-service.ts` handles file I/O for the global file. The existing `resolveRules` function gains a `globalRules` parameter. A new "Permissions" menu item in global settings provides CRUD UI, and the permission bar gains an "Allow Globally" option.

**Tech Stack:** TypeScript, Electron IPC, React, Zustand, TanStack Query, Tailwind CSS

---

### Task 1: Global Permissions Service — File I/O

Create a new service that reads/writes `~/.config/jean-claude/settings.json`.

**Files:**
- Create: `electron/services/global-permissions-service.ts`

**Step 1: Create the service file**

```typescript
// electron/services/global-permissions-service.ts
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type {
  PermissionScope,
  ResolvedPermissionRule,
} from '../../shared/permission-types';
import { dbg } from '../lib/debug';
import {
  buildAllowedToolConfig,
  flattenScope,
  normalizeToolRequest,
} from './permission-settings-service';

// Re-export for convenience
export type { PermissionScope };

const GLOBAL_SETTINGS_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
);
const GLOBAL_SETTINGS_FILENAME = 'settings.json';

interface GlobalSettings {
  version: 1;
  permissions: PermissionScope;
}

function getGlobalSettingsPath(): string {
  return path.join(GLOBAL_SETTINGS_DIR, GLOBAL_SETTINGS_FILENAME);
}

function createDefaultGlobalSettings(): GlobalSettings {
  return { version: 1, permissions: {} };
}

/**
 * Read global permissions from ~/.config/jean-claude/settings.json.
 * Returns empty permissions if the file doesn't exist.
 */
export async function readGlobalPermissions(): Promise<PermissionScope> {
  try {
    const content = await fs.readFile(getGlobalSettingsPath(), 'utf-8');
    const parsed = JSON.parse(content) as GlobalSettings;
    if (parsed.version !== 1 || !parsed.permissions) {
      return {};
    }
    return parsed.permissions;
  } catch {
    return {};
  }
}

/**
 * Write global permissions to ~/.config/jean-claude/settings.json.
 */
export async function writeGlobalPermissions(
  permissions: PermissionScope,
): Promise<void> {
  const filePath = getGlobalSettingsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const settings: GlobalSettings = { version: 1, permissions };
  await fs.writeFile(
    filePath,
    JSON.stringify(settings, null, 2) + '\n',
    'utf-8',
  );
}

/**
 * Flatten global permissions into resolved rules.
 */
export function resolveGlobalRules(): Promise<ResolvedPermissionRule[]> {
  return readGlobalPermissions().then(flattenScope);
}

/**
 * Security: bare bash (wildcard) must never be allowed.
 */
function isBareBash(tool: string, pattern: string): boolean {
  return tool.toLowerCase() === 'bash' && (pattern === '*' || pattern === '');
}

/**
 * Add a permission rule to the global scope.
 */
export async function addGlobalPermission(
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  const { tool, matchValue } = normalizeToolRequest(toolName, input);

  if (isBareBash(tool, matchValue || '*')) {
    dbg.agentPermission(
      'Refusing to allow bare "bash" globally — a specific command pattern is required',
    );
    return;
  }

  const permissions = await readGlobalPermissions();
  permissions[tool] = buildAllowedToolConfig({
    existing: permissions[tool],
    matchValue,
  });

  await writeGlobalPermissions(permissions);
}

/**
 * Remove a permission rule from the global scope.
 * If pattern is provided, removes that specific pattern from a pattern map.
 * Otherwise, removes the entire tool entry.
 */
export async function removeGlobalPermission(
  tool: string,
  pattern?: string,
): Promise<void> {
  const permissions = await readGlobalPermissions();

  if (pattern) {
    const existing = permissions[tool];
    if (typeof existing === 'object' && existing !== null) {
      const updated = { ...(existing as Record<string, string>) };
      delete updated[pattern];
      if (Object.keys(updated).length > 0) {
        permissions[tool] = updated as PermissionScope[string];
      } else {
        delete permissions[tool];
      }
    }
  } else {
    delete permissions[tool];
  }

  await writeGlobalPermissions(permissions);
}
```

**Step 2: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 2: Integrate Global Rules into Permission Resolution

Modify `resolveRules` to accept global rules and prepend them before project rules.

**Files:**
- Modify: `electron/services/permission-settings-service.ts` (the `resolveRules` function)
- Modify: `electron/services/agent-service.ts` (pass global rules when starting sessions)
- Modify: `electron/services/worktree-service.ts` (pass global rules when building worktree settings)

**Step 1: Update `resolveRules` to accept optional global rules**

In `electron/services/permission-settings-service.ts`, change the `resolveRules` function signature and implementation:

```typescript
/**
 * Resolve effective rules for a given context.
 *
 * Resolution order (last-match-wins):
 * 1. Global rules (from ~/.config/jean-claude/settings.json)
 * 2. Project rules (from .jean-claude/settings.local.json)
 * 3. Worktree overrides (if isWorktree and worktrees scope exists)
 *
 * This means project rules override global, and worktree overrides project.
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
    return [...baseRules, ...worktreeRules];
  }

  // No extends — worktree rules only (but still include global)
  return [...(globalRules ?? []), ...worktreeRules];
}
```

**Step 2: Update `evaluateToolPermission` to include global rules**

In `permission-settings-service.ts`, update the `evaluateToolPermission` function:

```typescript
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
  const { readGlobalPermissions } = await import('./global-permissions-service');
  const globalPerms = await readGlobalPermissions();
  const globalRules = flattenScope(globalPerms);

  const settings = await readSettings(projectPath);
  const rules = resolveRules(settings, isWorktree, globalRules);
  const { tool, matchValue } = normalizeToolRequest(toolName, input);
  return evaluatePermission(rules, tool, matchValue);
}
```

**Step 3: Update agent-service.ts to pass global rules**

In `electron/services/agent-service.ts`, where permissions are loaded (~line 443-446):

```typescript
// Before (existing):
const settings = await readSettings(project.path);
const rules = resolveRules(settings, isWorktree);

// After:
const { resolveGlobalRules } = await import('./global-permissions-service');
const globalRules = await resolveGlobalRules();
const settings = await readSettings(project.path);
const rules = resolveRules(settings, isWorktree, globalRules);
```

Note: Use dynamic import to avoid circular dependencies. Alternatively, import at the top of the file — check if circular dependency is an issue. If not, use a static import:

```typescript
import { resolveGlobalRules } from './global-permissions-service';
```

Then at the call site:

```typescript
const globalRules = await resolveGlobalRules();
const settings = await readSettings(project.path);
const rules = resolveRules(settings, isWorktree, globalRules);
```

**Step 4: Update `buildWorktreeSettings` to include global rules**

In `permission-settings-service.ts`, update `buildWorktreeSettings`:

```typescript
export async function buildWorktreeSettings(
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const { resolveGlobalRules } = await import('./global-permissions-service');
  const globalRules = await resolveGlobalRules();

  const settings = await readSettings(sourcePath);
  const rules = resolveRules(settings, true, globalRules);

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
```

**Step 5: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 3: IPC Handlers for Global Permissions

Add IPC handlers for CRUD operations on global permissions.

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers in `electron/ipc/handlers.ts`**

Import the global permissions service at the top of handlers.ts:

```typescript
import {
  readGlobalPermissions,
  writeGlobalPermissions,
  addGlobalPermission,
  removeGlobalPermission,
} from '../services/global-permissions-service';
```

Add handlers (place them near the existing permission handlers, around line 1051):

```typescript
// Global permissions
ipcMain.handle('globalPermissions:get', async () => {
  return readGlobalPermissions();
});

ipcMain.handle(
  'globalPermissions:set',
  async (_, permissions: PermissionScope) => {
    await writeGlobalPermissions(permissions);
  },
);

ipcMain.handle(
  'globalPermissions:addRule',
  async (_, toolName: string, input: Record<string, unknown>) => {
    await addGlobalPermission(toolName, input);
    return readGlobalPermissions();
  },
);

ipcMain.handle(
  'globalPermissions:removeRule',
  async (_, tool: string, pattern?: string) => {
    await removeGlobalPermission(tool, pattern);
    return readGlobalPermissions();
  },
);
```

Also add an "Allow Globally" handler for the permission bar flow (similar to `tasks:allowForProject`):

```typescript
ipcMain.handle(
  'tasks:allowGlobally',
  async (
    _,
    taskId: string,
    toolName: string,
    input: Record<string, unknown>,
  ) => {
    // Write to global settings
    await addGlobalPermission(toolName, input);

    // Also add to session rules for immediate effect
    const task = await TaskRepository.findById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const { tool, matchValue } = normalizeToolRequest(toolName, input);
    const current: PermissionScope = { ...(task.sessionRules ?? {}) };
    current[tool] = buildAllowedToolConfig({
      existing: current[tool],
      matchValue,
    });
    await TaskRepository.update(taskId, { sessionRules: current });

    return TaskRepository.findById(taskId);
  },
);
```

**Step 2: Add preload bridge methods in `electron/preload.ts`**

Find the section in preload.ts where IPC methods are exposed and add:

```typescript
globalPermissions: {
  get: () => ipcRenderer.invoke('globalPermissions:get'),
  set: (permissions: unknown) =>
    ipcRenderer.invoke('globalPermissions:set', permissions),
  addRule: (toolName: string, input: Record<string, unknown>) =>
    ipcRenderer.invoke('globalPermissions:addRule', toolName, input),
  removeRule: (tool: string, pattern?: string) =>
    ipcRenderer.invoke('globalPermissions:removeRule', tool, pattern),
},
```

Also add `allowGlobally` to the existing `tasks` section:

```typescript
allowGlobally: (id: string, toolName: string, input: Record<string, unknown>) =>
  ipcRenderer.invoke('tasks:allowGlobally', id, toolName, input),
```

**Step 3: Add API types in `src/lib/api.ts`**

Add the `globalPermissions` namespace and `allowGlobally` to the tasks type. Find where the API interface is defined:

```typescript
globalPermissions: {
  get: () => Promise<import('@shared/permission-types').PermissionScope>;
  set: (permissions: import('@shared/permission-types').PermissionScope) => Promise<void>;
  addRule: (toolName: string, input: Record<string, unknown>) => Promise<import('@shared/permission-types').PermissionScope>;
  removeRule: (tool: string, pattern?: string) => Promise<import('@shared/permission-types').PermissionScope>;
};
```

Add to the tasks type:

```typescript
allowGlobally: (id: string, toolName: string, input: Record<string, unknown>) => Promise<Task>;
```

**Step 4: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 4: React Hooks for Global Permissions

Create React Query hooks for fetching and mutating global permissions.

**Files:**
- Create: `src/hooks/use-global-permissions.ts`

**Step 1: Create the hooks file**

```typescript
// src/hooks/use-global-permissions.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

const QUERY_KEY = ['globalPermissions'] as const;

export function useGlobalPermissions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.globalPermissions.get(),
  });
}

export function useAddGlobalPermissionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      toolName,
      input,
    }: {
      toolName: string;
      input: Record<string, unknown>;
    }) => api.globalPermissions.addRule(toolName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useRemoveGlobalPermissionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tool, pattern }: { tool: string; pattern?: string }) =>
      api.globalPermissions.removeRule(tool, pattern),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
```

**Step 2: Add `useAllowGlobally` mutation in `src/hooks/use-tasks.ts`**

Find the existing `useAllowForProject` and add a similar hook below it:

```typescript
export function useAllowGlobally() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      toolName,
      input,
    }: {
      id: string;
      toolName: string;
      input: Record<string, unknown>;
    }) => api.tasks.allowGlobally(id, toolName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 5: Global Permissions Settings UI

Add a "Permissions" menu item to the global settings overlay with a UI to view, add, and remove global permission rules.

**Files:**
- Create: `src/features/settings/ui-global-permissions-settings/index.tsx`
- Modify: `src/features/settings/ui-settings-overlay/index.tsx`

**Step 1: Create the global permissions settings component**

```typescript
// src/features/settings/ui-global-permissions-settings/index.tsx
import { Plus, Shield, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import {
  useGlobalPermissions,
  useRemoveGlobalPermissionRule,
} from '@/hooks/use-global-permissions';
import type { PermissionScope } from '@shared/permission-types';

/** Known tool names for the dropdown */
const TOOL_OPTIONS = [
  { value: 'bash', label: 'Bash' },
  { value: 'read', label: 'Read' },
  { value: 'edit', label: 'Edit' },
  { value: 'write', label: 'Write' },
  { value: 'glob', label: 'Glob' },
  { value: 'grep', label: 'Grep' },
  { value: 'webfetch', label: 'WebFetch' },
  { value: 'websearch', label: 'WebSearch' },
  { value: 'task', label: 'Task' },
  { value: 'todowrite', label: 'TodoWrite' },
  { value: 'skill', label: 'Skill' },
];

function flattenPermissions(
  permissions: PermissionScope,
): { tool: string; pattern: string | null; action: string }[] {
  const entries: { tool: string; pattern: string | null; action: string }[] = [];
  for (const [tool, config] of Object.entries(permissions)) {
    if (typeof config === 'string') {
      entries.push({ tool, pattern: null, action: config });
    } else if (typeof config === 'object' && config !== null) {
      for (const [pattern, action] of Object.entries(
        config as Record<string, string>,
      )) {
        entries.push({ tool, pattern, action });
      }
    }
  }
  return entries;
}

function AddRuleForm({
  onAdd,
}: {
  onAdd: (tool: string, pattern: string) => void;
}) {
  const [tool, setTool] = useState('bash');
  const [pattern, setPattern] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pattern.trim();
    onAdd(tool, trimmed);
    setPattern('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Tool</label>
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
        >
          {TOOL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-xs text-neutral-500">
          Pattern{' '}
          <span className="text-neutral-600">(leave empty for all)</span>
        </label>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. git status*, /path/to/file"
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-blue-500"
        />
      </div>
      <Button
        type="submit"
        className="flex shrink-0 items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </form>
  );
}

export function GlobalPermissionsSettings() {
  const { data: permissions, isLoading } = useGlobalPermissions();
  const removeRule = useRemoveGlobalPermissionRule();

  const handleAdd = useCallback(
    (tool: string, pattern: string) => {
      const input: Record<string, unknown> = {};
      // Build the appropriate input shape for normalizeToolRequest
      if (tool === 'bash') input.command = pattern || '*';
      else if (['read', 'edit', 'write'].includes(tool)) input.filePath = pattern || '*';
      else if (['glob', 'grep'].includes(tool)) input.pattern = pattern || '*';
      else if (tool === 'webfetch') input.url = pattern || '*';
      else if (tool === 'websearch') input.query = pattern || '*';

      // Use the addRule IPC which goes through normalizeToolRequest
      window.api.globalPermissions.addRule(tool, input).then(() => {
        // Invalidation handled by the mutation
      });
    },
    [],
  );

  // For the add form, we use the IPC directly since the hook
  // will invalidate queries. Let's use the hook instead:
  const handleAddViaApi = useCallback(
    async (tool: string, pattern: string) => {
      const input: Record<string, unknown> = {};
      if (tool === 'bash') input.command = pattern;
      else if (['read', 'edit', 'write'].includes(tool)) input.filePath = pattern;
      else if (['glob', 'grep'].includes(tool)) input.pattern = pattern;
      else if (tool === 'webfetch') input.url = pattern;
      else if (tool === 'websearch') input.query = pattern;

      await window.api.globalPermissions.addRule(tool, input);
      // We need to invalidate — but since we're not using the mutation hook,
      // let's trigger a refetch. Actually, let's just use the API and refetch.
    },
    [],
  );

  const handleRemove = useCallback(
    (tool: string, pattern: string | null) => {
      removeRule.mutate({
        tool,
        pattern: pattern ?? undefined,
      });
    },
    [removeRule],
  );

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  const entries = flattenPermissions(permissions ?? {});

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">Permissions</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Global permission rules applied to all projects. Project-level rules
        take precedence over global rules.
      </p>

      {/* Add Rule Form */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-neutral-300">
          Add Rule
        </h3>
        <AddRuleForm onAdd={handleAddViaApi} />
      </div>

      {/* Current Rules */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium text-neutral-300">
          Current Rules
        </h3>
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No global permission rules configured. Rules you add here will
            apply to all projects.
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map(({ tool, pattern, action }) => {
              const label = pattern ? `${tool}: ${pattern}` : tool;
              return (
                <div
                  key={`${tool}-${pattern ?? '*'}`}
                  className="flex items-center justify-between rounded-md bg-neutral-800 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    <span className="truncate text-sm text-neutral-200">
                      {label}
                    </span>
                    <span className="shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {action}
                    </span>
                  </div>
                  <Button
                    onClick={() => handleRemove(tool, pattern)}
                    className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                    title={`Remove ${label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Important:** The above is a starting point. The `handleAdd` logic should be cleaned up — remove the unused `handleAdd` callback and keep only `handleAddViaApi`. Also, after calling `window.api.globalPermissions.addRule`, the query won't auto-invalidate since we're not using a mutation hook. Fix this by using the `useAddGlobalPermissionRule` hook from Task 4 instead:

```typescript
const addRule = useAddGlobalPermissionRule();

const handleAdd = useCallback(
  (tool: string, pattern: string) => {
    const input: Record<string, unknown> = {};
    if (tool === 'bash') input.command = pattern;
    else if (['read', 'edit', 'write'].includes(tool)) input.filePath = pattern;
    else if (['glob', 'grep'].includes(tool)) input.pattern = pattern;
    else if (tool === 'webfetch') input.url = pattern;
    else if (tool === 'websearch') input.query = pattern;

    addRule.mutate({ toolName: tool, input });
  },
  [addRule],
);
```

**Step 2: Wire up in the settings overlay**

In `src/features/settings/ui-settings-overlay/index.tsx`:

Add the import:

```typescript
import { GlobalPermissionsSettings } from '@/features/settings/ui-global-permissions-settings';
```

Add `'permissions'` to the `GlobalMenuItem` type:

```typescript
type GlobalMenuItem =
  | 'general'
  | 'permissions'
  | 'skills'
  | 'mcp-servers'
  | 'tokens'
  | 'azure-devops'
  | 'autocomplete'
  | 'debug';
```

Add the menu item to `GLOBAL_MENU_ITEMS` array (after 'general'):

```typescript
const GLOBAL_MENU_ITEMS: { id: GlobalMenuItem; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'skills', label: 'Skills' },
  // ... rest unchanged
];
```

Add the case in `GlobalContent`:

```typescript
case 'permissions':
  return <GlobalPermissionsSettings />;
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 6: Add "Allow Globally" to the Permission Bar

Add an "Allow Globally" button to the permission request bar so users can grant global permissions inline.

**Files:**
- Modify: `src/features/agent/ui-permission-bar/index.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx` (wire up the new callback)

**Step 1: Add the "Allow Globally" button to the permission bar**

In `src/features/agent/ui-permission-bar/index.tsx`, find where the permission action buttons are rendered (Allow for Session, Allow for Project, Allow for Project Worktrees). Add an "Allow Globally" button. Look at the existing button pattern and add:

```typescript
// New prop
onAllowGlobally?: () => void;

// New button (green/teal color to distinguish from project purple)
{onAllowGlobally && (
  <Button
    onClick={onAllowGlobally}
    className="... rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500"
    title="Allow this tool globally for all projects"
  >
    Allow Globally
  </Button>
)}
```

Position it after "Allow for Project" but before "Deny". Use a distinctive color (teal-600) so it's visually separate from the project-level purple.

**Step 2: Wire up in `ui-task-panel/index.tsx`**

Import `useAllowGlobally` from `src/hooks/use-tasks.ts` and call it:

```typescript
const allowGlobally = useAllowGlobally();

// In the permission handler:
const handleAllowGlobally = useCallback(
  (toolName: string, input: Record<string, unknown>) => {
    allowGlobally.mutate({ id: taskId, toolName, input });
  },
  [taskId, allowGlobally],
);
```

Pass `onAllowGlobally` to the `PermissionBar` component.

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 7: Final Verification

**Step 1: Run full lint and type check**

```bash
pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 2: Manual verification checklist**

- [ ] `~/.config/jean-claude/settings.json` is created when adding a global permission
- [ ] Global permissions appear in the Settings → Permissions UI
- [ ] Adding/removing rules in the UI updates the file
- [ ] Permission resolution order: global → project → worktree (last-match-wins)
- [ ] "Allow Globally" button appears in the permission bar
- [ ] Worktree creation includes global permissions in compiled settings
- [ ] Bare bash is rejected at global level too

---

## Key Design Decisions

1. **File location**: `~/.config/jean-claude/settings.json` — follows XDG conventions and matches the existing `~/.config/jean-claude/skills/` pattern used by the skills service.

2. **Resolution order**: Global rules are prepended (first), project rules next, worktree rules last. Last-match-wins means project/worktree rules override global. This gives users sane defaults that can be overridden per-project.

3. **Same PermissionScope format**: Reuses the existing `PermissionScope` type for the global permissions, keeping the data model consistent.

4. **No database storage**: Global permissions live on disk in a JSON file (like project permissions), not in the SQLite database. This makes them portable and inspectable.

5. **Dynamic import in `evaluateToolPermission`**: Uses dynamic import to avoid potential circular dependencies between `permission-settings-service.ts` and `global-permissions-service.ts`. The global service imports from permission service for `flattenScope`, `normalizeToolRequest`, and `buildAllowedToolConfig`.
