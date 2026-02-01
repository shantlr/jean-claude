# Unified MCP Servers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge MCP templates from Jean-Claude's DB with active MCP servers from Claude's config into a unified view in Project Details.

**Architecture:** Read `~/.claude.json` to discover active MCP servers per project path, merge with templates by name, expose via IPC and React Query hooks, display unified list with dual toggles (Active + Install on worktree).

**Tech Stack:** TypeScript, Electron IPC, React Query, Tailwind CSS

---

### Task 1: Add new types to shared/mcp-types.ts

**Files:**
- Modify: `shared/mcp-types.ts`

**Step 1: Add ClaudeMcpServer interface**

Add at end of file:

```typescript
// MCP server from Claude's config (~/.claude.json)
export interface ClaudeMcpServer {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command: string; // Full command string (command + args joined)
  rawCommand: string; // Original command (first part)
  args: string[];
  env?: Record<string, string>;
}

// Unified view combining templates and active servers
export interface UnifiedMcpServer {
  name: string;
  command: string; // From active config if exists, otherwise from template
  template: McpServerTemplate | null; // Null if active-only
  isActive: boolean; // True if in Claude's config
  installOnWorktree: boolean; // From template + project override (false if no template)
}
```

---

### Task 2: Add getClaudeMcpServers to mcp-template-service.ts

**Files:**
- Modify: `electron/services/mcp-template-service.ts`

**Step 1: Add imports and types**

Add at top with other imports:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ClaudeMcpServer } from '../../shared/mcp-types';
```

**Step 2: Add claude config path constant**

Add after `AUTO_PROVIDED_VARIABLES`:

```typescript
const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
```

**Step 3: Add getClaudeMcpServers function**

Add after `installMcpForWorktree`:

```typescript
/**
 * Reads MCP servers from ~/.claude.json for a specific project path.
 */
export function getClaudeMcpServers(projectPath: string): ClaudeMcpServer[] {
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
      dbg.mcp('Claude config not found at %s', CLAUDE_CONFIG_PATH);
      return [];
    }

    const content = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);

    // Claude stores per-project config under projects[projectPath]
    const projectConfig = config.projects?.[projectPath];
    if (!projectConfig?.mcpServers) {
      dbg.mcp('No MCP servers found for project %s', projectPath);
      return [];
    }

    const mcpServers = projectConfig.mcpServers;
    const servers: ClaudeMcpServer[] = [];

    for (const [name, server] of Object.entries(mcpServers)) {
      const s = server as {
        type?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      };

      const args = s.args || [];
      const fullCommand = s.command
        ? [s.command, ...args].join(' ')
        : args.join(' ');

      servers.push({
        name,
        type: (s.type as 'stdio' | 'sse' | 'http') || 'stdio',
        command: fullCommand,
        rawCommand: s.command || '',
        args,
        env: s.env,
      });
    }

    dbg.mcp('Found %d MCP servers for project %s', servers.length, projectPath);
    return servers;
  } catch (error) {
    dbg.mcp('Error reading Claude config: %O', error);
    return [];
  }
}
```

---

### Task 3: Add getUnifiedMcpServers to mcp-template-service.ts

**Files:**
- Modify: `electron/services/mcp-template-service.ts`

**Step 1: Add UnifiedMcpServer import**

Update the import from shared/mcp-types.ts:

```typescript
import type {
  McpServerTemplate,
  McpVariableContext,
  McpPreset,
  ClaudeMcpServer,
  UnifiedMcpServer,
} from '../../shared/mcp-types';
```

**Step 2: Add getUnifiedMcpServers function**

Add after `getClaudeMcpServers`:

```typescript
/**
 * Gets a unified list of MCP servers for a project.
 * Merges templates from DB with active servers from Claude's config.
 */
export async function getUnifiedMcpServers(
  projectId: string,
  projectPath: string,
): Promise<UnifiedMcpServer[]> {
  // Get all templates and overrides
  const allTemplates = await McpTemplateRepository.findAll();
  const overrides =
    await ProjectMcpOverrideRepository.findByProjectId(projectId);
  const overrideMap = new Map(
    overrides.map((o) => [o.mcpTemplateId, o.enabled]),
  );

  // Get active MCP servers from Claude's config
  const activeServers = getClaudeMcpServers(projectPath);
  const activeServerMap = new Map(
    activeServers.map((s) => [s.name.toLowerCase(), s]),
  );

  const result: UnifiedMcpServer[] = [];
  const processedNames = new Set<string>();

  // Process templates first
  for (const template of allTemplates) {
    const normalizedName = template.name.toLowerCase().replace(/\s+/g, '-');
    const activeServer = activeServerMap.get(normalizedName);
    const override = overrideMap.get(template.id);
    const installOnWorktree =
      override !== undefined ? override : template.enabledByDefault;

    result.push({
      name: template.name,
      command: activeServer?.command || template.commandTemplate,
      template,
      isActive: !!activeServer,
      installOnWorktree: installOnWorktree && template.installOnCreateWorktree,
    });

    processedNames.add(normalizedName);
  }

  // Add active-only servers (no matching template)
  for (const server of activeServers) {
    const normalizedName = server.name.toLowerCase();
    if (!processedNames.has(normalizedName)) {
      result.push({
        name: server.name,
        command: server.command,
        template: null,
        isActive: true,
        installOnWorktree: false,
      });
    }
  }

  return result;
}
```

---

### Task 4: Add activateMcpServer and deactivateMcpServer functions

**Files:**
- Modify: `electron/services/mcp-template-service.ts`

**Step 1: Add activateMcpServer function**

Add after `getUnifiedMcpServers`:

```typescript
/**
 * Activates an MCP server by running `claude mcp add`.
 */
export async function activateMcpServer(
  projectPath: string,
  name: string,
  command: string,
): Promise<void> {
  const mcpName = name.toLowerCase().replace(/\s+/g, '-');
  const claudeCmd = `claude mcp add ${mcpName} --scope local -- ${command}`;

  dbg.mcp('Activating MCP server: %s (cwd: %s)', claudeCmd, projectPath);

  await execAsync(claudeCmd, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 30000,
  });

  dbg.mcp('Successfully activated MCP server: %s', name);
}
```

**Step 2: Add deactivateMcpServer function**

Add after `activateMcpServer`:

```typescript
/**
 * Deactivates an MCP server by running `claude mcp remove`.
 */
export async function deactivateMcpServer(
  projectPath: string,
  name: string,
): Promise<void> {
  const mcpName = name.toLowerCase().replace(/\s+/g, '-');
  const claudeCmd = `claude mcp remove ${mcpName}`;

  dbg.mcp('Deactivating MCP server: %s (cwd: %s)', claudeCmd, projectPath);

  await execAsync(claudeCmd, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 30000,
  });

  dbg.mcp('Successfully deactivated MCP server: %s', name);
}
```

---

### Task 5: Add IPC handlers for unified MCP

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Update imports**

Update the import from mcp-template-service:

```typescript
import {
  MCP_PRESETS,
  getEnabledTemplatesForProject,
  getUnifiedMcpServers,
  activateMcpServer,
  deactivateMcpServer,
  substituteVariables,
} from '../services/mcp-template-service';
```

**Step 2: Add IPC handlers**

Add after existing MCP handlers (search for `mcpTemplates:getEnabledForProject`):

```typescript
  // Unified MCP servers
  ipcMain.handle(
    'unifiedMcp:getServers',
    async (_, projectId: string, projectPath: string) => {
      return getUnifiedMcpServers(projectId, projectPath);
    },
  );

  ipcMain.handle(
    'unifiedMcp:activate',
    async (_, projectPath: string, name: string, command: string) => {
      await activateMcpServer(projectPath, name, command);
    },
  );

  ipcMain.handle(
    'unifiedMcp:deactivate',
    async (_, projectPath: string, name: string) => {
      await deactivateMcpServer(projectPath, name);
    },
  );

  ipcMain.handle(
    'unifiedMcp:substituteVariables',
    async (
      _,
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: { projectPath: string; projectName: string; branchName: string; mainRepoPath: string },
    ) => {
      return substituteVariables(commandTemplate, userVariables, context);
    },
  );
```

---

### Task 6: Add preload bridge for unified MCP

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add unifiedMcp to contextBridge**

Add after `projectMcpOverrides` in the `exposeInMainWorld` call:

```typescript
  unifiedMcp: {
    getServers: (projectId: string, projectPath: string) =>
      ipcRenderer.invoke('unifiedMcp:getServers', projectId, projectPath),
    activate: (projectPath: string, name: string, command: string) =>
      ipcRenderer.invoke('unifiedMcp:activate', projectPath, name, command),
    deactivate: (projectPath: string, name: string) =>
      ipcRenderer.invoke('unifiedMcp:deactivate', projectPath, name),
    substituteVariables: (
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: { projectPath: string; projectName: string; branchName: string; mainRepoPath: string },
    ) =>
      ipcRenderer.invoke(
        'unifiedMcp:substituteVariables',
        commandTemplate,
        userVariables,
        context,
      ),
  },
```

---

### Task 7: Update renderer API types

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add imports**

Add to imports from shared/mcp-types:

```typescript
import type {
  McpServerTemplate,
  McpPreset,
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  ProjectMcpOverride,
  NewProjectMcpOverride,
  UnifiedMcpServer,
} from '../../shared/mcp-types';
```

**Step 2: Add unifiedMcp to api object**

Add after `projectMcpOverrides`:

```typescript
  unifiedMcp: {
    getServers: (projectId: string, projectPath: string): Promise<UnifiedMcpServer[]> =>
      window.api?.unifiedMcp?.getServers(projectId, projectPath) ?? Promise.resolve([]),
    activate: (projectPath: string, name: string, command: string): Promise<void> =>
      window.api?.unifiedMcp?.activate(projectPath, name, command) ?? Promise.resolve(),
    deactivate: (projectPath: string, name: string): Promise<void> =>
      window.api?.unifiedMcp?.deactivate(projectPath, name) ?? Promise.resolve(),
    substituteVariables: (
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: { projectPath: string; projectName: string; branchName: string; mainRepoPath: string },
    ): Promise<string> =>
      window.api?.unifiedMcp?.substituteVariables(commandTemplate, userVariables, context) ??
      Promise.resolve(commandTemplate),
  },
```

---

### Task 8: Add React Query hooks for unified MCP

**Files:**
- Modify: `src/hooks/use-mcp-templates.ts`

**Step 1: Add UnifiedMcpServer import**

Update import:

```typescript
import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
  UnifiedMcpServer,
} from '../../shared/mcp-types';
```

**Step 2: Add hooks at end of file**

```typescript
// Unified MCP Servers
export function useUnifiedMcpServers(projectId: string, projectPath: string) {
  return useQuery({
    queryKey: ['unifiedMcpServers', projectId, projectPath],
    queryFn: () => api.unifiedMcp.getServers(projectId, projectPath),
    enabled: !!projectId && !!projectPath,
  });
}

export function useActivateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectPath,
      name,
      command,
    }: {
      projectPath: string;
      name: string;
      command: string;
    }) => api.unifiedMcp.activate(projectPath, name, command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unifiedMcpServers'] });
    },
  });
}

export function useDeactivateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, name }: { projectPath: string; name: string }) =>
      api.unifiedMcp.deactivate(projectPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unifiedMcpServers'] });
    },
  });
}

export function useSubstituteVariables() {
  return useMutation({
    mutationFn: ({
      commandTemplate,
      userVariables,
      context,
    }: {
      commandTemplate: string;
      userVariables: Record<string, string>;
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      };
    }) => api.unifiedMcp.substituteVariables(commandTemplate, userVariables, context),
  });
}
```

---

### Task 9: Refactor ProjectMcpSettings component

**Files:**
- Modify: `src/features/project/ui-project-mcp-settings/index.tsx`

**Step 1: Replace entire file contents**

```typescript
// src/features/project/ui-project-mcp-settings/index.tsx
import { Server } from 'lucide-react';
import { useState } from 'react';

import {
  useUnifiedMcpServers,
  useActivateMcpServer,
  useDeactivateMcpServer,
  useUpsertProjectMcpOverride,
  useDeleteProjectMcpOverride,
  useSubstituteVariables,
} from '@/hooks/use-mcp-templates';
import { useProject } from '@/hooks/use-projects';

export function ProjectMcpSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const projectPath = project?.path ?? '';

  const { data: servers, isLoading } = useUnifiedMcpServers(
    projectId,
    projectPath,
  );
  const activateMcp = useActivateMcpServer();
  const deactivateMcp = useDeactivateMcpServer();
  const upsertOverride = useUpsertProjectMcpOverride();
  const deleteOverride = useDeleteProjectMcpOverride();
  const substituteVars = useSubstituteVariables();

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleActiveToggle = async (
    server: (typeof servers)[number],
    newActive: boolean,
  ) => {
    if (!project) return;

    setPendingAction(`active-${server.name}`);
    try {
      if (newActive) {
        // Activate: need to substitute variables if it's a template
        let command = server.command;
        if (server.template) {
          command = await substituteVars.mutateAsync({
            commandTemplate: server.template.commandTemplate,
            userVariables: server.template.variables,
            context: {
              projectPath: project.path,
              projectName: project.name,
              branchName: '', // Not in worktree context
              mainRepoPath: project.path,
            },
          });
        }
        await activateMcp.mutateAsync({
          projectPath: project.path,
          name: server.name,
          command,
        });
      } else {
        await deactivateMcp.mutateAsync({
          projectPath: project.path,
          name: server.name,
        });
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleWorktreeToggle = async (
    server: (typeof servers)[number],
    newValue: boolean,
  ) => {
    if (!server.template) return;

    setPendingAction(`worktree-${server.name}`);
    try {
      if (newValue === server.template.enabledByDefault) {
        // Remove override since it matches the default
        await deleteOverride.mutateAsync({
          projectId,
          mcpTemplateId: server.template.id,
        });
      } else {
        // Create/update override
        await upsertOverride.mutateAsync({
          projectId,
          mcpTemplateId: server.template.id,
          enabled: newValue,
        });
      }
    } finally {
      setPendingAction(null);
    }
  };

  if (isLoading || !project) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!servers || servers.length === 0) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>
        <div className="rounded-lg border border-dashed border-neutral-700 p-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <Server className="h-4 w-4" />
            <span className="text-sm">
              No MCP servers configured. Add templates in Settings → MCP Servers
              or configure servers via Claude CLI.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">MCP Servers</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Manage MCP servers for this project. Toggle Active to enable/disable
        servers in Claude. Toggle Install on worktree to auto-configure when
        creating worktrees.
      </p>

      <div className="space-y-3">
        {servers.map((server) => {
          const isActivePending = pendingAction === `active-${server.name}`;
          const isWorktreePending = pendingAction === `worktree-${server.name}`;
          const isPending = isActivePending || isWorktreePending;

          return (
            <div
              key={server.name}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4"
            >
              {/* Header row */}
              <div className="mb-2 flex items-center gap-2">
                <Server className="h-4 w-4 text-neutral-400" />
                <span className="font-medium text-neutral-200">
                  {server.name}
                </span>
                {server.template && (
                  <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-400">
                    Template
                  </span>
                )}
                {server.isActive && (
                  <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                    Active
                  </span>
                )}
              </div>

              {/* Command */}
              <p className="mb-3 truncate text-xs text-neutral-500">
                {server.command}
              </p>

              {/* Toggles row */}
              <div className="flex items-center gap-6">
                {/* Active toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400">Active</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={server.isActive}
                    disabled={isPending}
                    onClick={() => handleActiveToggle(server, !server.isActive)}
                    className={`relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                      server.isActive ? 'bg-green-600' : 'bg-neutral-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        server.isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Install on worktree toggle (only for templates) */}
                {server.template && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-400">
                      Install on worktree
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={server.installOnWorktree}
                      disabled={isPending || !server.template.installOnCreateWorktree}
                      onClick={() =>
                        handleWorktreeToggle(server, !server.installOnWorktree)
                      }
                      title={
                        !server.template.installOnCreateWorktree
                          ? 'This template is not configured for worktree installation'
                          : undefined
                      }
                      className={`relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                        server.installOnWorktree ? 'bg-blue-600' : 'bg-neutral-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          server.installOnWorktree
                            ? 'translate-x-4'
                            : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### Task 10: Run lint and verify build

**Step 1: Run lint with fix**

```bash
pnpm lint --fix
```

**Step 2: Run build**

```bash
pnpm build
```

Expected: Both commands complete without errors.
