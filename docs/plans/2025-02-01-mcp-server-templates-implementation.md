# MCP Server Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-configure MCP servers (like Serena) when creating worktrees, with global templates and per-project overrides.

**Architecture:** Database stores MCP templates and per-project overrides. New service handles variable substitution and runs `claude mcp add` at worktree creation. Settings UI for template management, Project Details for overrides.

**Tech Stack:** SQLite/Kysely, React/TanStack Query, Electron IPC

---

## Task 1: Create shared types

**Files:**
- Create: `shared/mcp-types.ts`

**Step 1: Create the shared types file**

```typescript
// shared/mcp-types.ts

export interface McpServerTemplate {
  id: string;
  name: string;
  commandTemplate: string;
  variables: Record<string, string>;
  enabledByDefault: boolean;
  installOnCreateWorktree: boolean;
  presetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewMcpServerTemplate {
  id?: string;
  name: string;
  commandTemplate: string;
  variables: Record<string, string>;
  enabledByDefault: boolean;
  installOnCreateWorktree: boolean;
  presetId?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateMcpServerTemplate {
  name?: string;
  commandTemplate?: string;
  variables?: Record<string, string>;
  enabledByDefault?: boolean;
  installOnCreateWorktree?: boolean;
  presetId?: string | null;
  updatedAt?: string;
}

export interface ProjectMcpOverride {
  projectId: string;
  mcpTemplateId: string;
  enabled: boolean;
}

export interface NewProjectMcpOverride {
  projectId: string;
  mcpTemplateId: string;
  enabled: boolean;
}

// Preset definition (hardcoded in code, used to pre-fill forms)
export interface McpPresetVariable {
  label: string;
  description?: string;
  inputType: 'folder' | 'file' | 'text';
  placeholder?: string;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  commandTemplate: string;
  variables: Record<string, McpPresetVariable>;
  enabledByDefault: boolean;
  installOnCreateWorktree: boolean;
}

// Auto-provided variables context for substitution
export interface McpVariableContext {
  projectPath: string;
  projectName: string;
  branchName: string;
  mainRepoPath: string;
}
```

**Step 2: Commit**

```bash
git add shared/mcp-types.ts
git commit -m "feat: add MCP server template shared types"
```

---

## Task 2: Create database migration

**Files:**
- Create: `electron/database/migrations/021_mcp_templates.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

```typescript
// electron/database/migrations/021_mcp_templates.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('mcp_templates')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('commandTemplate', 'text', (col) => col.notNull())
    .addColumn('variables', 'text', (col) => col.notNull()) // JSON string
    .addColumn('enabledByDefault', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('installOnCreateWorktree', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('presetId', 'text')
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('project_mcp_overrides')
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('mcpTemplateId', 'text', (col) =>
      col.notNull().references('mcp_templates.id').onDelete('cascade')
    )
    .addColumn('enabled', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_project_mcp', ['projectId', 'mcpTemplateId'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_mcp_overrides').execute();
  await db.schema.dropTable('mcp_templates').execute();
}
```

**Step 2: Register migration in migrator.ts**

Add import and register in migrations object:

```typescript
import * as m021 from './migrations/021_mcp_templates';

// In migrations object:
'021_mcp_templates': m021,
```

**Step 3: Update schema.ts**

Add table interfaces and types:

```typescript
// In Database interface:
mcp_templates: McpTemplateTable;
project_mcp_overrides: ProjectMcpOverrideTable;

// Table definitions:
export interface McpTemplateTable {
  id: Generated<string>;
  name: string;
  commandTemplate: string;
  variables: string; // JSON
  enabledByDefault: number; // boolean as 0/1
  installOnCreateWorktree: number; // boolean as 0/1
  presetId: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProjectMcpOverrideTable {
  projectId: string;
  mcpTemplateId: string;
  enabled: number; // boolean as 0/1
}

export type McpTemplateRow = Selectable<McpTemplateTable>;
export type NewMcpTemplateRow = Insertable<McpTemplateTable>;
export type UpdateMcpTemplateRow = Updateable<McpTemplateTable>;

export type ProjectMcpOverrideRow = Selectable<ProjectMcpOverrideTable>;
export type NewProjectMcpOverrideRow = Insertable<ProjectMcpOverrideTable>;
```

**Step 4: Commit**

```bash
git add electron/database/migrations/021_mcp_templates.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat: add database migration for MCP templates"
```

---

## Task 3: Create MCP templates repository

**Files:**
- Create: `electron/database/repositories/mcp-templates.ts`

**Step 1: Create the repository**

```typescript
// electron/database/repositories/mcp-templates.ts
import type {
  McpServerTemplate,
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
} from '../../../shared/mcp-types';
import { db } from '../index';

function parseRow(row: {
  id: string;
  name: string;
  commandTemplate: string;
  variables: string;
  enabledByDefault: number;
  installOnCreateWorktree: number;
  presetId: string | null;
  createdAt: string;
  updatedAt: string;
}): McpServerTemplate {
  return {
    id: row.id,
    name: row.name,
    commandTemplate: row.commandTemplate,
    variables: JSON.parse(row.variables) as Record<string, string>,
    enabledByDefault: row.enabledByDefault === 1,
    installOnCreateWorktree: row.installOnCreateWorktree === 1,
    presetId: row.presetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const McpTemplateRepository = {
  findAll: async (): Promise<McpServerTemplate[]> => {
    const rows = await db
      .selectFrom('mcp_templates')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(parseRow);
  },

  findById: async (id: string): Promise<McpServerTemplate | undefined> => {
    const row = await db
      .selectFrom('mcp_templates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? parseRow(row) : undefined;
  },

  create: async (data: NewMcpServerTemplate): Promise<McpServerTemplate> => {
    const id = data.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const row = await db
      .insertInto('mcp_templates')
      .values({
        id,
        name: data.name,
        commandTemplate: data.commandTemplate,
        variables: JSON.stringify(data.variables),
        enabledByDefault: data.enabledByDefault ? 1 : 0,
        installOnCreateWorktree: data.installOnCreateWorktree ? 1 : 0,
        presetId: data.presetId ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  update: async (
    id: string,
    data: UpdateMcpServerTemplate,
  ): Promise<McpServerTemplate> => {
    const updateData: Record<string, unknown> = {
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.commandTemplate !== undefined)
      updateData.commandTemplate = data.commandTemplate;
    if (data.variables !== undefined)
      updateData.variables = JSON.stringify(data.variables);
    if (data.enabledByDefault !== undefined)
      updateData.enabledByDefault = data.enabledByDefault ? 1 : 0;
    if (data.installOnCreateWorktree !== undefined)
      updateData.installOnCreateWorktree = data.installOnCreateWorktree ? 1 : 0;
    if (data.presetId !== undefined) updateData.presetId = data.presetId;

    const row = await db
      .updateTable('mcp_templates')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (id: string): Promise<void> => {
    await db.deleteFrom('mcp_templates').where('id', '=', id).execute();
  },
};
```

**Step 2: Commit**

```bash
git add electron/database/repositories/mcp-templates.ts
git commit -m "feat: add MCP templates repository"
```

---

## Task 4: Create project MCP overrides repository

**Files:**
- Create: `electron/database/repositories/project-mcp-overrides.ts`

**Step 1: Create the repository**

```typescript
// electron/database/repositories/project-mcp-overrides.ts
import type {
  ProjectMcpOverride,
  NewProjectMcpOverride,
} from '../../../shared/mcp-types';
import { db } from '../index';

function parseRow(row: {
  projectId: string;
  mcpTemplateId: string;
  enabled: number;
}): ProjectMcpOverride {
  return {
    projectId: row.projectId,
    mcpTemplateId: row.mcpTemplateId,
    enabled: row.enabled === 1,
  };
}

export const ProjectMcpOverrideRepository = {
  findByProjectId: async (projectId: string): Promise<ProjectMcpOverride[]> => {
    const rows = await db
      .selectFrom('project_mcp_overrides')
      .selectAll()
      .where('projectId', '=', projectId)
      .execute();
    return rows.map(parseRow);
  },

  findByTemplateId: async (
    mcpTemplateId: string,
  ): Promise<ProjectMcpOverride[]> => {
    const rows = await db
      .selectFrom('project_mcp_overrides')
      .selectAll()
      .where('mcpTemplateId', '=', mcpTemplateId)
      .execute();
    return rows.map(parseRow);
  },

  upsert: async (data: NewProjectMcpOverride): Promise<ProjectMcpOverride> => {
    const row = await db
      .insertInto('project_mcp_overrides')
      .values({
        projectId: data.projectId,
        mcpTemplateId: data.mcpTemplateId,
        enabled: data.enabled ? 1 : 0,
      })
      .onConflict((oc) =>
        oc.columns(['projectId', 'mcpTemplateId']).doUpdateSet({
          enabled: data.enabled ? 1 : 0,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseRow(row);
  },

  delete: async (projectId: string, mcpTemplateId: string): Promise<void> => {
    await db
      .deleteFrom('project_mcp_overrides')
      .where('projectId', '=', projectId)
      .where('mcpTemplateId', '=', mcpTemplateId)
      .execute();
  },
};
```

**Step 2: Commit**

```bash
git add electron/database/repositories/project-mcp-overrides.ts
git commit -m "feat: add project MCP overrides repository"
```

---

## Task 5: Create MCP template service

**Files:**
- Create: `electron/services/mcp-template-service.ts`

**Step 1: Create the service**

```typescript
// electron/services/mcp-template-service.ts
import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  McpServerTemplate,
  McpVariableContext,
  McpPreset,
} from '../../shared/mcp-types';
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import { dbg } from '../lib/debug';

const execAsync = promisify(exec);

// Built-in presets
export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'serena',
    name: 'Serena',
    description: 'Code intelligence MCP for semantic search',
    commandTemplate:
      'uv run --directory {serenaPath} serena start-mcp-server --context claude-code --project {projectPath}',
    variables: {
      serenaPath: {
        label: 'Serena Installation Path',
        description: 'The folder where Serena is installed',
        inputType: 'folder',
        placeholder: '/path/to/serena',
      },
    },
    enabledByDefault: true,
    installOnCreateWorktree: true,
  },
];

// Auto-provided variable names (reserved, cannot be user-defined)
const AUTO_PROVIDED_VARIABLES = [
  'projectPath',
  'projectName',
  'branchName',
  'mainRepoPath',
];

/**
 * Extracts variable names from a command template.
 * Variables are in the format {variableName}.
 */
export function extractVariables(commandTemplate: string): string[] {
  const matches = commandTemplate.match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Gets user-defined variables (excludes auto-provided ones).
 */
export function getUserDefinedVariables(commandTemplate: string): string[] {
  return extractVariables(commandTemplate).filter(
    (v) => !AUTO_PROVIDED_VARIABLES.includes(v)
  );
}

/**
 * Substitutes variables in a command template.
 */
export function substituteVariables(
  commandTemplate: string,
  userVariables: Record<string, string>,
  context: McpVariableContext
): string {
  let result = commandTemplate;

  // Substitute auto-provided variables
  result = result.replace(/\{projectPath\}/g, context.projectPath);
  result = result.replace(/\{projectName\}/g, context.projectName);
  result = result.replace(/\{branchName\}/g, context.branchName);
  result = result.replace(/\{mainRepoPath\}/g, context.mainRepoPath);

  // Substitute user-defined variables
  for (const [key, value] of Object.entries(userVariables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}

/**
 * Parses a command template into name and args for `claude mcp add`.
 * The command template format is: "command arg1 arg2 ..."
 * Returns: { name, command, args }
 */
function parseCommandTemplate(commandTemplate: string): {
  command: string;
  args: string[];
} {
  // Split by spaces, respecting quoted strings
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of commandTemplate) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }

  return {
    command: parts[0] || '',
    args: parts.slice(1),
  };
}

/**
 * Gets templates enabled for a specific project.
 * Considers enabledByDefault and project overrides.
 */
export async function getEnabledTemplatesForProject(
  projectId: string
): Promise<McpServerTemplate[]> {
  const allTemplates = await McpTemplateRepository.findAll();
  const overrides = await ProjectMcpOverrideRepository.findByProjectId(projectId);

  const overrideMap = new Map(overrides.map((o) => [o.mcpTemplateId, o.enabled]));

  return allTemplates.filter((template) => {
    const override = overrideMap.get(template.id);
    // If there's an override, use it; otherwise use enabledByDefault
    return override !== undefined ? override : template.enabledByDefault;
  });
}

/**
 * Installs MCP servers for a worktree.
 * Runs `claude mcp add` for each enabled template with installOnCreateWorktree: true.
 * Errors are logged but don't throw (MCP setup failure shouldn't block worktree creation).
 */
export async function installMcpForWorktree(params: {
  worktreePath: string;
  projectId: string;
  projectName: string;
  branchName: string;
  mainRepoPath: string;
}): Promise<void> {
  const { worktreePath, projectId, projectName, branchName, mainRepoPath } =
    params;

  dbg.mcp('installMcpForWorktree: %o', params);

  const templates = await getEnabledTemplatesForProject(projectId);
  const installTemplates = templates.filter((t) => t.installOnCreateWorktree);

  if (installTemplates.length === 0) {
    dbg.mcp('No MCP templates to install for worktree');
    return;
  }

  const context: McpVariableContext = {
    projectPath: worktreePath,
    projectName,
    branchName,
    mainRepoPath,
  };

  for (const template of installTemplates) {
    try {
      const substitutedCommand = substituteVariables(
        template.commandTemplate,
        template.variables,
        context
      );

      const { command, args } = parseCommandTemplate(substitutedCommand);

      // Build the claude mcp add command
      // Format: claude mcp add <name> -- <command> <args...>
      const mcpName = template.name.toLowerCase().replace(/\s+/g, '-');
      const claudeCmd = `claude mcp add ${mcpName} --scope local -- ${command} ${args.join(' ')}`;

      dbg.mcp('Running: %s (cwd: %s)', claudeCmd, worktreePath);

      await execAsync(claudeCmd, {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
      });

      dbg.mcp('Successfully installed MCP server: %s', template.name);
    } catch (error) {
      // Log but don't throw - MCP setup failure shouldn't block worktree creation
      dbg.mcp('Failed to install MCP server %s: %O', template.name, error);
    }
  }
}
```

**Step 2: Add debug namespace for mcp**

In `electron/lib/debug.ts`, add `mcp` to the debug namespaces if not already present.

**Step 3: Commit**

```bash
git add electron/services/mcp-template-service.ts
git commit -m "feat: add MCP template service with variable substitution"
```

---

## Task 6: Integrate MCP installation into worktree creation

**Files:**
- Modify: `electron/services/worktree-service.ts`

**Step 1: Import and call installMcpForWorktree**

Add import at top:

```typescript
import { installMcpForWorktree } from './mcp-template-service';
```

In `createWorktree()`, after `buildWorktreeSettings()` call, add:

```typescript
// Install MCP servers for this worktree
try {
  await installMcpForWorktree({
    worktreePath,
    projectId,
    projectName,
    branchName,
    mainRepoPath: projectPath,
  });
} catch (error) {
  dbg.worktree('Failed to install MCP servers for worktree: %O', error);
  // Don't throw — MCP setup failure shouldn't block worktree creation
}
```

**Step 2: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "feat: integrate MCP installation into worktree creation"
```

---

## Task 7: Add IPC handlers for MCP templates

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add imports**

```typescript
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import {
  MCP_PRESETS,
  getEnabledTemplatesForProject,
} from '../services/mcp-template-service';
import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '../../shared/mcp-types';
```

**Step 2: Add handlers in registerIpcHandlers()**

```typescript
// MCP Templates
ipcMain.handle('mcpTemplates:findAll', () => McpTemplateRepository.findAll());
ipcMain.handle('mcpTemplates:findById', (_, id: string) =>
  McpTemplateRepository.findById(id)
);
ipcMain.handle('mcpTemplates:create', (_, data: NewMcpServerTemplate) =>
  McpTemplateRepository.create(data)
);
ipcMain.handle(
  'mcpTemplates:update',
  (_, id: string, data: UpdateMcpServerTemplate) =>
    McpTemplateRepository.update(id, data)
);
ipcMain.handle('mcpTemplates:delete', (_, id: string) =>
  McpTemplateRepository.delete(id)
);
ipcMain.handle('mcpTemplates:getPresets', () => MCP_PRESETS);
ipcMain.handle('mcpTemplates:getEnabledForProject', (_, projectId: string) =>
  getEnabledTemplatesForProject(projectId)
);

// Project MCP Overrides
ipcMain.handle('projectMcpOverrides:findByProjectId', (_, projectId: string) =>
  ProjectMcpOverrideRepository.findByProjectId(projectId)
);
ipcMain.handle('projectMcpOverrides:upsert', (_, data: NewProjectMcpOverride) =>
  ProjectMcpOverrideRepository.upsert(data)
);
ipcMain.handle(
  'projectMcpOverrides:delete',
  (_, projectId: string, mcpTemplateId: string) =>
    ProjectMcpOverrideRepository.delete(projectId, mcpTemplateId)
);
```

**Step 3: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handlers for MCP templates"
```

---

## Task 8: Add preload bridge for MCP templates

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add mcpTemplates and projectMcpOverrides to exposed API**

```typescript
mcpTemplates: {
  findAll: () => ipcRenderer.invoke('mcpTemplates:findAll'),
  findById: (id: string) => ipcRenderer.invoke('mcpTemplates:findById', id),
  create: (data: unknown) => ipcRenderer.invoke('mcpTemplates:create', data),
  update: (id: string, data: unknown) =>
    ipcRenderer.invoke('mcpTemplates:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('mcpTemplates:delete', id),
  getPresets: () => ipcRenderer.invoke('mcpTemplates:getPresets'),
  getEnabledForProject: (projectId: string) =>
    ipcRenderer.invoke('mcpTemplates:getEnabledForProject', projectId),
},
projectMcpOverrides: {
  findByProjectId: (projectId: string) =>
    ipcRenderer.invoke('projectMcpOverrides:findByProjectId', projectId),
  upsert: (data: unknown) =>
    ipcRenderer.invoke('projectMcpOverrides:upsert', data),
  delete: (projectId: string, mcpTemplateId: string) =>
    ipcRenderer.invoke('projectMcpOverrides:delete', projectId, mcpTemplateId),
},
```

**Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add preload bridge for MCP templates"
```

---

## Task 9: Update API types in renderer

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add imports**

```typescript
import type {
  McpServerTemplate,
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  ProjectMcpOverride,
  NewProjectMcpOverride,
  McpPreset,
} from '../../shared/mcp-types';
```

**Step 2: Add to Api interface**

```typescript
mcpTemplates: {
  findAll: () => Promise<McpServerTemplate[]>;
  findById: (id: string) => Promise<McpServerTemplate | undefined>;
  create: (data: NewMcpServerTemplate) => Promise<McpServerTemplate>;
  update: (id: string, data: UpdateMcpServerTemplate) => Promise<McpServerTemplate>;
  delete: (id: string) => Promise<void>;
  getPresets: () => Promise<McpPreset[]>;
  getEnabledForProject: (projectId: string) => Promise<McpServerTemplate[]>;
};
projectMcpOverrides: {
  findByProjectId: (projectId: string) => Promise<ProjectMcpOverride[]>;
  upsert: (data: NewProjectMcpOverride) => Promise<ProjectMcpOverride>;
  delete: (projectId: string, mcpTemplateId: string) => Promise<void>;
};
```

**Step 3: Add fallback implementations**

```typescript
mcpTemplates: {
  findAll: async () => [],
  findById: async () => undefined,
  create: async () => { throw new Error('API not available'); },
  update: async () => { throw new Error('API not available'); },
  delete: async () => {},
  getPresets: async () => [],
  getEnabledForProject: async () => [],
},
projectMcpOverrides: {
  findByProjectId: async () => [],
  upsert: async () => { throw new Error('API not available'); },
  delete: async () => {},
},
```

**Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add MCP templates to renderer API types"
```

---

## Task 10: Create React Query hooks for MCP templates

**Files:**
- Create: `src/hooks/use-mcp-templates.ts`

**Step 1: Create the hooks file**

```typescript
// src/hooks/use-mcp-templates.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '../../shared/mcp-types';

// MCP Templates
export function useMcpTemplates() {
  return useQuery({
    queryKey: ['mcpTemplates'],
    queryFn: () => api.mcpTemplates.findAll(),
  });
}

export function useMcpTemplate(id: string) {
  return useQuery({
    queryKey: ['mcpTemplates', id],
    queryFn: () => api.mcpTemplates.findById(id),
    enabled: !!id,
  });
}

export function useMcpPresets() {
  return useQuery({
    queryKey: ['mcpPresets'],
    queryFn: () => api.mcpTemplates.getPresets(),
  });
}

export function useEnabledMcpTemplates(projectId: string) {
  return useQuery({
    queryKey: ['mcpTemplates', 'enabled', projectId],
    queryFn: () => api.mcpTemplates.getEnabledForProject(projectId),
    enabled: !!projectId,
  });
}

export function useCreateMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewMcpServerTemplate) => api.mcpTemplates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

export function useUpdateMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateMcpServerTemplate;
    }) => api.mcpTemplates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

export function useDeleteMcpTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.mcpTemplates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpTemplates'] });
    },
  });
}

// Project MCP Overrides
export function useProjectMcpOverrides(projectId: string) {
  return useQuery({
    queryKey: ['projectMcpOverrides', projectId],
    queryFn: () => api.projectMcpOverrides.findByProjectId(projectId),
    enabled: !!projectId,
  });
}

export function useUpsertProjectMcpOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProjectMcpOverride) =>
      api.projectMcpOverrides.upsert(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectMcpOverrides', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['mcpTemplates', 'enabled', variables.projectId],
      });
    },
  });
}

export function useDeleteProjectMcpOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      mcpTemplateId,
    }: {
      projectId: string;
      mcpTemplateId: string;
    }) => api.projectMcpOverrides.delete(projectId, mcpTemplateId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projectMcpOverrides', variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['mcpTemplates', 'enabled', variables.projectId],
      });
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-mcp-templates.ts
git commit -m "feat: add React Query hooks for MCP templates"
```

---

## Task 11: Create MCP Servers settings route

**Files:**
- Create: `src/routes/settings/mcp-servers.tsx`

**Step 1: Create the route file**

```typescript
// src/routes/settings/mcp-servers.tsx
import { createFileRoute } from '@tanstack/react-router';

import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';

export const Route = createFileRoute('/settings/mcp-servers')({
  component: McpServersSettingsPage,
});

function McpServersSettingsPage() {
  return <McpServersSettings />;
}
```

**Step 2: Commit**

```bash
git add src/routes/settings/mcp-servers.tsx
git commit -m "feat: add MCP servers settings route"
```

---

## Task 12: Add MCP Servers tab to settings layout

**Files:**
- Modify: `src/routes/settings.tsx`

**Step 1: Add tab to tabs array**

```typescript
const tabs = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/mcp-servers', label: 'MCP Servers' },
  { to: '/settings/tokens', label: 'Tokens' },
  { to: '/settings/azure-devops', label: 'Azure DevOps' },
  { to: '/settings/debug', label: 'Debug' },
] as const;
```

**Step 2: Commit**

```bash
git add src/routes/settings.tsx
git commit -m "feat: add MCP Servers tab to settings layout"
```

---

## Task 13: Create MCP servers settings component

**Files:**
- Create: `src/features/settings/ui-mcp-servers-settings/index.tsx`

**Step 1: Create the component**

```typescript
// src/features/settings/ui-mcp-servers-settings/index.tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  useMcpTemplates,
  useDeleteMcpTemplate,
} from '@/hooks/use-mcp-templates';

import { McpTemplateForm } from './mcp-template-form';
import { McpTemplateList } from './mcp-template-list';

export function McpServersSettings() {
  const { data: templates, isLoading } = useMcpTemplates();
  const deleteTemplate = useDeleteMcpTemplate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedTemplate = templates?.find((t) => t.id === selectedId);

  const handleCreate = () => {
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleEdit = (id: string) => {
    setIsCreating(false);
    setSelectedId(id);
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    setIsCreating(false);
  };

  const handleSaved = () => {
    setSelectedId(null);
    setIsCreating(false);
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: List */}
      <div className="w-80 flex-shrink-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">
            MCP Servers
          </h2>
          <button
            onClick={handleCreate}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          Configure MCP servers to auto-install when creating worktrees.
        </p>
        <McpTemplateList
          templates={templates ?? []}
          selectedId={selectedId}
          onSelect={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Right: Form pane */}
      {(isCreating || selectedTemplate) && (
        <div className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          <McpTemplateForm
            template={selectedTemplate}
            onClose={handleClose}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/settings/ui-mcp-servers-settings/index.tsx
git commit -m "feat: add MCP servers settings main component"
```

---

## Task 14: Create MCP template list component

**Files:**
- Create: `src/features/settings/ui-mcp-servers-settings/mcp-template-list.tsx`

**Step 1: Create the component**

```typescript
// src/features/settings/ui-mcp-servers-settings/mcp-template-list.tsx
import { Trash2, Server } from 'lucide-react';

import type { McpServerTemplate } from '../../../../shared/mcp-types';

export function McpTemplateList({
  templates,
  selectedId,
  onSelect,
  onDelete,
}: {
  templates: McpServerTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-500">
        No MCP servers configured yet.
        <br />
        Click "Add" to create one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <div
          key={template.id}
          onClick={() => onSelect(template.id)}
          className={`group flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
            selectedId === template.id
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-neutral-400" />
            <div>
              <div className="font-medium text-neutral-200">{template.name}</div>
              <div className="flex gap-2 text-xs">
                {template.enabledByDefault && (
                  <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-green-400">
                    Default
                  </span>
                )}
                {template.installOnCreateWorktree && (
                  <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-blue-400">
                    Worktree
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(template.id);
            }}
            className="cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/settings/ui-mcp-servers-settings/mcp-template-list.tsx
git commit -m "feat: add MCP template list component"
```

---

## Task 15: Create MCP template form component

**Files:**
- Create: `src/features/settings/ui-mcp-servers-settings/mcp-template-form.tsx`

**Step 1: Create the component**

```typescript
// src/features/settings/ui-mcp-servers-settings/mcp-template-form.tsx
import { FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useMcpPresets,
  useCreateMcpTemplate,
  useUpdateMcpTemplate,
} from '@/hooks/use-mcp-templates';
import { api } from '@/lib/api';

import type {
  McpServerTemplate,
  McpPreset,
} from '../../../../shared/mcp-types';

// Extract user-defined variables from command template
function getUserDefinedVariables(commandTemplate: string): string[] {
  const autoProvided = ['projectPath', 'projectName', 'branchName', 'mainRepoPath'];
  const matches = commandTemplate.match(/\{([^}]+)\}/g) || [];
  return matches
    .map((m) => m.slice(1, -1))
    .filter((v) => !autoProvided.includes(v));
}

export function McpTemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template?: McpServerTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: presets } = useMcpPresets();
  const createTemplate = useCreateMcpTemplate();
  const updateTemplate = useUpdateMcpTemplate();

  const [name, setName] = useState('');
  const [commandTemplate, setCommandTemplate] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [enabledByDefault, setEnabledByDefault] = useState(true);
  const [installOnCreateWorktree, setInstallOnCreateWorktree] = useState(true);
  const [presetId, setPresetId] = useState<string | null>(null);

  // Initialize from template or reset
  useEffect(() => {
    if (template) {
      setName(template.name);
      setCommandTemplate(template.commandTemplate);
      setVariables(template.variables);
      setEnabledByDefault(template.enabledByDefault);
      setInstallOnCreateWorktree(template.installOnCreateWorktree);
      setPresetId(template.presetId);
    } else {
      setName('');
      setCommandTemplate('');
      setVariables({});
      setEnabledByDefault(true);
      setInstallOnCreateWorktree(true);
      setPresetId(null);
    }
  }, [template]);

  const userDefinedVars = getUserDefinedVariables(commandTemplate);
  const currentPreset = presets?.find((p) => p.id === presetId);

  const handleApplyPreset = (preset: McpPreset) => {
    setName(preset.name);
    setCommandTemplate(preset.commandTemplate);
    setEnabledByDefault(preset.enabledByDefault);
    setInstallOnCreateWorktree(preset.installOnCreateWorktree);
    setPresetId(preset.id);
    // Initialize variables with empty values
    const newVars: Record<string, string> = {};
    for (const key of Object.keys(preset.variables)) {
      newVars[key] = variables[key] ?? '';
    }
    setVariables(newVars);
  };

  const handleBrowseFolder = async (varName: string) => {
    const path = await api.dialog.openDirectory();
    if (path) {
      setVariables((prev) => ({ ...prev, [varName]: path }));
    }
  };

  const handleSave = async () => {
    const data = {
      name,
      commandTemplate,
      variables,
      enabledByDefault,
      installOnCreateWorktree,
      presetId,
      updatedAt: new Date().toISOString(),
    };

    if (template) {
      await updateTemplate.mutateAsync({ id: template.id, data });
    } else {
      await createTemplate.mutateAsync(data);
    }
    onSaved();
  };

  const isValid = name.trim() && commandTemplate.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          {template ? 'Edit MCP Server' : 'Add MCP Server'}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        {/* Preset buttons */}
        {!template && presets && presets.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Quick setup
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    presetId === preset.id
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  Use {preset.name} Preset
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Serena"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Command Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Command Template
          </label>
          <textarea
            value={commandTemplate}
            onChange={(e) => setCommandTemplate(e.target.value)}
            placeholder="e.g., uv run --directory {serenaPath} serena start-mcp-server --project {projectPath}"
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Available variables: {'{projectPath}'}, {'{projectName}'},{' '}
            {'{branchName}'}, {'{mainRepoPath}'}
          </p>
        </div>

        {/* User-defined variables */}
        {userDefinedVars.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Variables
            </label>
            <div className="space-y-2">
              {userDefinedVars.map((varName) => {
                const presetVar = currentPreset?.variables[varName];
                return (
                  <div key={varName}>
                    <label className="mb-1 block text-xs text-neutral-500">
                      {presetVar?.label ?? varName}
                      {presetVar?.description && (
                        <span className="ml-1 text-neutral-600">
                          — {presetVar.description}
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={variables[varName] ?? ''}
                        onChange={(e) =>
                          setVariables((prev) => ({
                            ...prev,
                            [varName]: e.target.value,
                          }))
                        }
                        placeholder={presetVar?.placeholder}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                      />
                      {presetVar?.inputType === 'folder' && (
                        <button
                          onClick={() => handleBrowseFolder(varName)}
                          className="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enabledByDefault}
              onChange={(e) => setEnabledByDefault(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-neutral-300">
                Enabled by default
              </div>
              <div className="text-xs text-neutral-500">
                Auto-enable for all projects unless overridden
              </div>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={installOnCreateWorktree}
              onChange={(e) => setInstallOnCreateWorktree(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-neutral-300">
                Install on worktree creation
              </div>
              <div className="text-xs text-neutral-500">
                Run `claude mcp add` when creating a new worktree
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-4 flex justify-end gap-2 border-t border-neutral-700 pt-4">
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || createTemplate.isPending || updateTemplate.isPending}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createTemplate.isPending || updateTemplate.isPending
            ? 'Saving...'
            : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/settings/ui-mcp-servers-settings/mcp-template-form.tsx
git commit -m "feat: add MCP template form component with preset support"
```

---

## Task 16: Create project MCP settings component

**Files:**
- Create: `src/features/project/ui-project-mcp-settings/index.tsx`

**Step 1: Create the component**

```typescript
// src/features/project/ui-project-mcp-settings/index.tsx
import { Server } from 'lucide-react';

import {
  useMcpTemplates,
  useProjectMcpOverrides,
  useUpsertProjectMcpOverride,
} from '@/hooks/use-mcp-templates';

export function ProjectMcpSettings({ projectId }: { projectId: string }) {
  const { data: templates } = useMcpTemplates();
  const { data: overrides } = useProjectMcpOverrides(projectId);
  const upsertOverride = useUpsertProjectMcpOverride();

  const overrideMap = new Map(
    overrides?.map((o) => [o.mcpTemplateId, o.enabled])
  );

  // Only show templates that are enabledByDefault or have an override
  const visibleTemplates =
    templates?.filter(
      (t) => t.enabledByDefault || overrideMap.has(t.id)
    ) ?? [];

  if (visibleTemplates.length === 0) {
    return null;
  }

  const handleToggle = async (templateId: string, currentEnabled: boolean) => {
    await upsertOverride.mutateAsync({
      projectId,
      mcpTemplateId: templateId,
      enabled: !currentEnabled,
    });
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-neutral-200">
        MCP Servers
      </h2>
      <p className="mb-4 text-sm text-neutral-500">
        MCP servers that will be auto-configured for worktrees in this project.
      </p>
      <div className="space-y-2">
        {visibleTemplates.map((template) => {
          const override = overrideMap.get(template.id);
          const isEnabled =
            override !== undefined ? override : template.enabledByDefault;

          return (
            <div
              key={template.id}
              className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800 p-3"
            >
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-neutral-400" />
                <div>
                  <div className="font-medium text-neutral-200">
                    {template.name}
                  </div>
                  {template.installOnCreateWorktree && (
                    <div className="text-xs text-neutral-500">
                      Installed on worktree creation
                    </div>
                  )}
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => handleToggle(template.id, isEnabled)}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-neutral-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-neutral-600 after:bg-neutral-400 after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:after:bg-white" />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/project/ui-project-mcp-settings/index.tsx
git commit -m "feat: add project MCP settings component"
```

---

## Task 17: Add MCP settings to project details page

**Files:**
- Modify: `src/routes/projects/$projectId/details.tsx`

**Step 1: Import the component**

```typescript
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
```

**Step 2: Add section to the page**

After the Integrations section and before the Save button:

```typescript
{/* MCP Servers */}
<div className="border-t border-neutral-700 pt-6">
  <ProjectMcpSettings projectId={projectId} />
</div>
```

**Step 3: Commit**

```bash
git add src/routes/projects/\$projectId/details.tsx
git commit -m "feat: add MCP settings section to project details"
```

---

## Task 18: Add debug namespace for MCP

**Files:**
- Modify: `electron/lib/debug.ts`

**Step 1: Add mcp namespace**

Check if there's a debug configuration and add 'mcp' to the namespaces.

```typescript
// Add to debug namespaces
mcp: debug('jean-claude:mcp'),
```

**Step 2: Commit**

```bash
git add electron/lib/debug.ts
git commit -m "feat: add debug namespace for MCP"
```

---

## Task 19: Run lint and fix issues

**Step 1: Run linter**

```bash
pnpm lint --fix
```

**Step 2: Fix any remaining issues**

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: lint fixes for MCP templates feature"
```

---

## Task 20: Final verification

**Step 1: Run type check**

```bash
pnpm tsc
```

**Step 2: Run build**

```bash
pnpm build
```

**Step 3: Manual testing checklist**

- [ ] App starts without errors
- [ ] Settings → MCP Servers tab appears
- [ ] Can add a new MCP template using Serena preset
- [ ] Folder picker works for serenaPath variable
- [ ] Template appears in list with correct badges
- [ ] Can edit and delete templates
- [ ] Project Details shows MCP Servers section
- [ ] Can toggle MCP server per project
- [ ] Creating a worktree task installs enabled MCP servers
