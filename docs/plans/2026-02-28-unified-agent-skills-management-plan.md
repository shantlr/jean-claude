# Unified Agent Skills Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a unified UI to manage agent skills (create, edit, delete, enable/disable) across backends, using filesystem operations for all mutations.

**Architecture:** A new `SkillManagementService` handles all filesystem CRUD. Each backend registers its skill directory paths. The UI is split into a global settings page (user-level skills) and a project settings section (project-level skills). Enable/disable works by relocating skill directories to/from a `.disabled/` subdirectory.

**Tech Stack:** Electron IPC, React, TanStack React Query, Tailwind CSS, Node.js `fs/promises`

---

### Task 1: Extend Shared Types

**Files:**
- Modify: `shared/skill-types.ts`

**Step 1: Add new types to skill-types.ts**

Replace the entire file content with:

```typescript
// Skill-related types shared between main and renderer processes

import type { AgentBackendType } from './agent-backend-types';

/** Read-only skill discovered from filesystem (used by existing message timeline) */
export interface Skill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
}

/** Skill with management metadata */
export interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  skillPath: string;
  enabled: boolean;
  backendType: AgentBackendType;
  editable: boolean;
}

/** Filesystem path config for a backend's skill directories */
export interface AgentSkillPathConfig {
  userSkillsDir: string;
  projectSkillsDir?: string; // relative to project root
  pluginSkillsDir?: string;
  disabledSubdir: string;
}

export type SkillScope = 'user' | 'project';
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors related to skill-types.ts

**Step 3: Commit**

```bash
git add shared/skill-types.ts
git commit -m "feat: extend skill types with ManagedSkill and path config"
```

---

### Task 2: Create Skill Management Service

**Files:**
- Create: `electron/services/skill-management-service.ts`

**Step 1: Create the service file**

Create `electron/services/skill-management-service.ts` with the following content:

```typescript
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  AgentSkillPathConfig,
  ManagedSkill,
  SkillScope,
} from '@shared/skill-types';

import { dbg } from '../lib/debug';
import { isEnoent } from '../lib/fs';

// --- Backend path configurations ---

const SKILL_PATH_CONFIGS: Record<AgentBackendType, AgentSkillPathConfig> = {
  'claude-code': {
    userSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
    projectSkillsDir: '.claude/skills',
    pluginSkillsDir: path.join(os.homedir(), '.claude', 'plugins', 'cache'),
    disabledSubdir: '.disabled',
  },
  opencode: {
    userSkillsDir: path.join(os.homedir(), '.config', 'opencode', 'skills'),
    projectSkillsDir: undefined,
    pluginSkillsDir: undefined,
    disabledSubdir: '.disabled',
  },
};

export function getSkillPathConfig(
  backendType: AgentBackendType,
): AgentSkillPathConfig {
  return SKILL_PATH_CONFIGS[backendType];
}

// --- Frontmatter parsing ---

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === 'name') frontmatter.name = value;
    else if (key === 'description') frontmatter.description = value;
  }

  return frontmatter;
}

function buildSkillMd({
  name,
  description,
  content,
}: {
  name: string;
  description: string;
  content: string;
}): string {
  const lines = ['---'];
  lines.push(`name: ${name}`);
  if (description) lines.push(`description: ${description}`);
  lines.push('---');
  if (content) {
    lines.push('');
    lines.push(content);
  }
  return lines.join('\n') + '\n';
}

// --- Directory scanning ---

async function readSkillDir(
  skillDir: string,
): Promise<{ name: string; description: string } | null> {
  const skillFilePath = path.join(skillDir, 'SKILL.md');
  try {
    const content = await fs.readFile(skillFilePath, 'utf-8');
    const fm = parseFrontmatter(content);
    return {
      name: fm.name || path.basename(skillDir),
      description: fm.description || '',
    };
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Failed to parse skill at %s: %O', skillDir, error);
    }
    return null;
  }
}

async function discoverSkillsInDir({
  baseDir,
  source,
  backendType,
  enabled,
  editable,
  pluginName,
}: {
  baseDir: string;
  source: 'user' | 'project' | 'plugin';
  backendType: AgentBackendType;
  enabled: boolean;
  editable: boolean;
  pluginName?: string;
}): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillDir = path.join(baseDir, entry.name);
      let resolvedPath = skillDir;
      try {
        resolvedPath = await fs.realpath(skillDir);
      } catch {
        continue; // broken symlink
      }

      const info = await readSkillDir(resolvedPath);
      if (info) {
        skills.push({
          ...info,
          source,
          pluginName,
          skillPath: resolvedPath,
          enabled,
          backendType,
          editable,
        });
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading skills dir %s: %O', baseDir, error);
    }
  }
  return skills;
}

async function discoverPluginSkills(
  pluginsDir: string,
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];
  try {
    const packageDirs = await fs.readdir(pluginsDir, { withFileTypes: true });
    for (const packageDir of packageDirs) {
      if (!packageDir.isDirectory()) continue;
      const packagePath = path.join(pluginsDir, packageDir.name);
      const pluginDirs = await fs.readdir(packagePath, { withFileTypes: true });

      for (const pluginDir of pluginDirs) {
        if (!pluginDir.isDirectory()) continue;
        const pluginPath = path.join(packagePath, pluginDir.name);
        const versionDirs = await fs.readdir(pluginPath, {
          withFileTypes: true,
        });

        for (const versionDir of versionDirs) {
          if (!versionDir.isDirectory()) continue;
          const skillsPath = path.join(pluginPath, versionDir.name, 'skills');

          const pluginSkills = await discoverSkillsInDir({
            baseDir: skillsPath,
            source: 'plugin',
            backendType,
            enabled: true,
            editable: false,
            pluginName: pluginDir.name,
          });
          skills.push(...pluginSkills);
        }
      }
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill('Error reading plugins dir %s: %O', pluginsDir, error);
    }
  }
  return skills;
}

// --- Public API ---

export async function getAllManagedSkills({
  backendType,
  projectPath,
}: {
  backendType: AgentBackendType;
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const disabledDir = config.disabledSubdir;

  const results: ManagedSkill[] = [];

  // User skills (active)
  results.push(
    ...(await discoverSkillsInDir({
      baseDir: config.userSkillsDir,
      source: 'user',
      backendType,
      enabled: true,
      editable: true,
    })),
  );

  // User skills (disabled)
  results.push(
    ...(await discoverSkillsInDir({
      baseDir: path.join(config.userSkillsDir, disabledDir),
      source: 'user',
      backendType,
      enabled: false,
      editable: true,
    })),
  );

  // Project skills
  if (projectPath && config.projectSkillsDir) {
    const projectSkillsDir = path.join(projectPath, config.projectSkillsDir);

    results.push(
      ...(await discoverSkillsInDir({
        baseDir: projectSkillsDir,
        source: 'project',
        backendType,
        enabled: true,
        editable: true,
      })),
    );

    results.push(
      ...(await discoverSkillsInDir({
        baseDir: path.join(projectSkillsDir, disabledDir),
        source: 'project',
        backendType,
        enabled: false,
        editable: true,
      })),
    );
  }

  // Plugin skills
  if (config.pluginSkillsDir) {
    results.push(
      ...(await discoverPluginSkills(config.pluginSkillsDir, backendType)),
    );
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkillContent({
  skillPath,
}: {
  skillPath: string;
}): Promise<{ name: string; description: string; content: string }> {
  const filePath = path.join(skillPath, 'SKILL.md');
  const raw = await fs.readFile(filePath, 'utf-8');
  const fm = parseFrontmatter(raw);

  // Extract body (everything after the frontmatter block)
  let content = raw;
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (fmMatch) {
    content = raw.slice(fmMatch[0].length).trim();
  }

  return {
    name: fm.name || path.basename(skillPath),
    description: fm.description || '',
    content,
  };
}

export async function createSkill({
  backendType,
  scope,
  projectPath,
  name,
  description,
  content,
}: {
  backendType: AgentBackendType;
  scope: SkillScope;
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}): Promise<ManagedSkill> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const dirName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  let baseDir: string;
  if (scope === 'project') {
    if (!projectPath || !config.projectSkillsDir) {
      throw new Error('Project path required for project-scoped skills');
    }
    baseDir = path.join(projectPath, config.projectSkillsDir);
  } else {
    baseDir = config.userSkillsDir;
  }

  const skillDir = path.join(baseDir, dirName);

  // Check for conflicts (active and disabled)
  const disabledDir = path.join(baseDir, config.disabledSubdir, dirName);
  try {
    await fs.access(skillDir);
    throw new Error(`Skill directory already exists: ${skillDir}`);
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  try {
    await fs.access(disabledDir);
    throw new Error(
      `A disabled skill with this name already exists: ${disabledDir}`,
    );
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }

  // Create directory and write SKILL.md
  await fs.mkdir(skillDir, { recursive: true });
  const skillMd = buildSkillMd({ name, description, content });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

  dbg.skill('Created skill %s at %s', name, skillDir);

  return {
    name,
    description,
    source: scope,
    skillPath: skillDir,
    enabled: true,
    backendType,
    editable: true,
  };
}

export async function updateSkill({
  skillPath,
  name,
  description,
  content,
}: {
  skillPath: string;
  name?: string;
  description?: string;
  content?: string;
}): Promise<ManagedSkill> {
  // Read current
  const current = await getSkillContent({ skillPath });
  const updatedName = name ?? current.name;
  const updatedDesc = description ?? current.description;
  const updatedContent = content ?? current.content;

  const skillMd = buildSkillMd({
    name: updatedName,
    description: updatedDesc,
    content: updatedContent,
  });
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd, 'utf-8');

  dbg.skill('Updated skill at %s', skillPath);

  // Return a partial ManagedSkill — caller must know source/backendType
  return {
    name: updatedName,
    description: updatedDesc,
    source: 'user', // will be overridden by caller context
    skillPath,
    enabled: true,
    backendType: 'claude-code',
    editable: true,
  };
}

export async function deleteSkill({
  skillPath,
}: {
  skillPath: string;
}): Promise<void> {
  await fs.rm(skillPath, { recursive: true, force: true });
  dbg.skill('Deleted skill at %s', skillPath);
}

export async function disableSkill({
  skillPath,
}: {
  skillPath: string;
}): Promise<void> {
  const parentDir = path.dirname(skillPath);
  const skillName = path.basename(skillPath);
  const disabledDir = path.join(parentDir, '.disabled');

  await fs.mkdir(disabledDir, { recursive: true });
  const targetPath = path.join(disabledDir, skillName);
  await fs.rename(skillPath, targetPath);

  dbg.skill('Disabled skill %s → %s', skillPath, targetPath);
}

export async function enableSkill({
  skillPath,
}: {
  skillPath: string;
}): Promise<void> {
  // skillPath is inside .disabled/, move it up one level
  const disabledDir = path.dirname(skillPath);
  const skillName = path.basename(skillPath);
  const parentDir = path.dirname(disabledDir);
  const targetPath = path.join(parentDir, skillName);

  await fs.rename(skillPath, targetPath);

  dbg.skill('Enabled skill %s → %s', skillPath, targetPath);
}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/services/skill-management-service.ts
git commit -m "feat: add skill management service with CRUD and enable/disable"
```

---

### Task 3: Add IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add import**

Add the import at the top of the file (after the existing `getAllSkills` import on line 111):

```typescript
import {
  getAllManagedSkills,
  getSkillContent,
  createSkill,
  updateSkill,
  deleteSkill,
  disableSkill,
  enableSkill,
} from '../services/skill-management-service';
```

**Step 2: Add IPC handlers**

Add the following handlers at the end of the `registerIpcHandlers` function, before the closing `}`. Place them after the existing `projectTodos` handlers (around line 1990) and before any helper functions:

```typescript
  // Skill Management
  ipcMain.handle(
    'skills:getAll',
    async (
      _,
      backendType: AgentBackendType,
      projectPath?: string,
    ) => {
      dbg.ipc('skills:getAll backend=%s project=%s', backendType, projectPath);
      return getAllManagedSkills({ backendType, projectPath });
    },
  );

  ipcMain.handle('skills:getContent', async (_, skillPath: string) => {
    dbg.ipc('skills:getContent path=%s', skillPath);
    return getSkillContent({ skillPath });
  });

  ipcMain.handle(
    'skills:create',
    async (
      _,
      params: {
        backendType: AgentBackendType;
        scope: 'user' | 'project';
        projectPath?: string;
        name: string;
        description: string;
        content: string;
      },
    ) => {
      dbg.ipc('skills:create name=%s scope=%s', params.name, params.scope);
      return createSkill(params);
    },
  );

  ipcMain.handle(
    'skills:update',
    async (
      _,
      params: {
        skillPath: string;
        name?: string;
        description?: string;
        content?: string;
      },
    ) => {
      dbg.ipc('skills:update path=%s', params.skillPath);
      return updateSkill(params);
    },
  );

  ipcMain.handle('skills:delete', async (_, skillPath: string) => {
    dbg.ipc('skills:delete path=%s', skillPath);
    return deleteSkill({ skillPath });
  });

  ipcMain.handle('skills:disable', async (_, skillPath: string) => {
    dbg.ipc('skills:disable path=%s', skillPath);
    return disableSkill({ skillPath });
  });

  ipcMain.handle('skills:enable', async (_, skillPath: string) => {
    dbg.ipc('skills:enable path=%s', skillPath);
    return enableSkill({ skillPath });
  });
```

**Step 3: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add IPC handlers for skill management CRUD"
```

---

### Task 4: Update Preload Bridge

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add skill management namespace**

Add the following block before the closing `});` of the `contextBridge.exposeInMainWorld` call (around line 472, before the `projectTodos` block or after it):

```typescript
  skillManagement: {
    getAll: (backendType: string, projectPath?: string) =>
      ipcRenderer.invoke('skills:getAll', backendType, projectPath),
    getContent: (skillPath: string) =>
      ipcRenderer.invoke('skills:getContent', skillPath),
    create: (params: {
      backendType: string;
      scope: string;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => ipcRenderer.invoke('skills:create', params),
    update: (params: {
      skillPath: string;
      name?: string;
      description?: string;
      content?: string;
    }) => ipcRenderer.invoke('skills:update', params),
    delete: (skillPath: string) =>
      ipcRenderer.invoke('skills:delete', skillPath),
    disable: (skillPath: string) =>
      ipcRenderer.invoke('skills:disable', skillPath),
    enable: (skillPath: string) =>
      ipcRenderer.invoke('skills:enable', skillPath),
  },
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose skill management APIs in preload bridge"
```

---

### Task 5: Update API Types

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add import**

Add the `ManagedSkill` and `SkillScope` imports at the top of the file alongside the existing `Skill` import:

```typescript
import type { ManagedSkill, Skill, SkillScope } from '@shared/skill-types';
```

(Remove the existing `import type { Skill } from '@shared/skill-types'` line.)

**Step 2: Add skillManagement to the Api interface**

Add the following block to the `Api` interface (after the `projectTodos` section, around line 685):

```typescript
  skillManagement: {
    getAll: (
      backendType: AgentBackendType,
      projectPath?: string,
    ) => Promise<ManagedSkill[]>;
    getContent: (
      skillPath: string,
    ) => Promise<{ name: string; description: string; content: string }>;
    create: (params: {
      backendType: AgentBackendType;
      scope: SkillScope;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => Promise<ManagedSkill>;
    update: (params: {
      skillPath: string;
      name?: string;
      description?: string;
      content?: string;
    }) => Promise<ManagedSkill>;
    delete: (skillPath: string) => Promise<void>;
    disable: (skillPath: string) => Promise<void>;
    enable: (skillPath: string) => Promise<void>;
  };
```

Also ensure `AgentBackendType` is imported at the top (it may already be via other imports — check if it needs to be added).

**Step 3: Add mock implementation**

In the mock `api` object (the `else` branch for non-Electron environments), add:

```typescript
    skillManagement: {
      getAll: async () => [],
      getContent: async () => ({ name: '', description: '', content: '' }),
      create: async () => ({
        name: '',
        description: '',
        source: 'user' as const,
        skillPath: '',
        enabled: true,
        backendType: 'claude-code' as const,
        editable: true,
      }),
      update: async () => ({
        name: '',
        description: '',
        source: 'user' as const,
        skillPath: '',
        enabled: true,
        backendType: 'claude-code' as const,
        editable: true,
      }),
      delete: async () => {},
      disable: async () => {},
      enable: async () => {},
    },
```

**Step 4: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add skill management types to API interface"
```

---

### Task 6: Create React Query Hooks

**Files:**
- Create: `src/hooks/use-managed-skills.ts`

**Step 1: Create the hooks file**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

export const managedSkillsQueryKeys = {
  all: ['managedSkills'] as const,
  byBackend: (backendType: AgentBackendType, projectPath?: string) =>
    [...managedSkillsQueryKeys.all, backendType, projectPath ?? ''] as const,
  content: (skillPath: string) =>
    [...managedSkillsQueryKeys.all, 'content', skillPath] as const,
};

export function useManagedSkills(
  backendType: AgentBackendType,
  projectPath?: string,
) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.byBackend(backendType, projectPath),
    queryFn: () => api.skillManagement.getAll(backendType, projectPath),
    staleTime: 30_000, // 30 seconds — management page needs fresher data
  });
}

export function useSkillContent(skillPath: string | null) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.content(skillPath ?? ''),
    queryFn: () => api.skillManagement.getContent(skillPath!),
    enabled: !!skillPath,
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      backendType: AgentBackendType;
      scope: SkillScope;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => api.skillManagement.create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      skillPath: string;
      name?: string;
      description?: string;
      content?: string;
    }) => api.skillManagement.update(params),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillPath: string) => api.skillManagement.delete(skillPath),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useDisableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillPath: string) => api.skillManagement.disable(skillPath),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillPath: string) => api.skillManagement.enable(skillPath),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: managedSkillsQueryKeys.all,
      });
    },
  });
}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/use-managed-skills.ts
git commit -m "feat: add React Query hooks for skill management"
```

---

### Task 7: Create Skills Settings UI — List Component

**Files:**
- Create: `src/features/settings/ui-skills-settings/index.tsx`
- Create: `src/features/settings/ui-skills-settings/skill-list.tsx`

**Step 1: Create the skill list component**

Create `src/features/settings/ui-skills-settings/skill-list.tsx`:

```typescript
import { ToggleLeft, ToggleRight, Trash2, Wand2 } from 'lucide-react';

import type { ManagedSkill } from '@shared/skill-types';

export function SkillList({
  skills,
  selectedPath,
  onSelect,
  onDelete,
  onToggleEnabled,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
  onDelete: (skillPath: string) => void;
  onToggleEnabled: (skill: ManagedSkill) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-500">
        No skills found.
        <br />
        Click &quot;Add&quot; to create one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <div
          key={skill.skillPath}
          onClick={() => skill.editable && onSelect(skill.skillPath)}
          className={`group flex items-center justify-between rounded-lg border p-3 transition-colors ${
            selectedPath === skill.skillPath
              ? 'border-blue-500 bg-blue-500/10'
              : skill.editable
                ? 'cursor-pointer border-neutral-700 bg-neutral-800 hover:border-neutral-600'
                : 'border-neutral-700/50 bg-neutral-800/50'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Wand2
              className={`h-4 w-4 shrink-0 ${skill.enabled ? 'text-purple-400' : 'text-neutral-600'}`}
            />
            <div className="min-w-0">
              <div
                className={`truncate text-sm font-medium ${skill.enabled ? 'text-neutral-200' : 'text-neutral-500'}`}
              >
                {skill.name}
              </div>
              {skill.description && (
                <div className="truncate text-xs text-neutral-500">
                  {skill.description}
                </div>
              )}
              {skill.pluginName && (
                <span className="mt-0.5 inline-block rounded bg-orange-900/30 px-1.5 py-0.5 text-[10px] text-orange-400">
                  {skill.pluginName}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Enable/Disable toggle */}
            {skill.editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleEnabled(skill);
                }}
                className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                title={skill.enabled ? 'Disable skill' : 'Enable skill'}
              >
                {skill.enabled ? (
                  <ToggleRight className="h-5 w-5 text-green-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-neutral-600" />
                )}
              </button>
            )}

            {/* Delete button */}
            {skill.editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(skill.skillPath);
                }}
                className="cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-700 hover:text-red-400"
                title="Delete skill"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Create the main skills settings component**

Create `src/features/settings/ui-skills-settings/index.tsx`:

```typescript
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

import { SkillForm } from './skill-form';
import { SkillList } from './skill-list';

const BACKENDS: { value: AgentBackendType; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
];

export function SkillsSettings() {
  const [backendType, setBackendType] =
    useState<AgentBackendType>('claude-code');
  const { data: skills, isLoading } = useManagedSkills(backendType);
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  // Split skills by source
  const { userSkills, pluginSkills } = useMemo(() => {
    const user = (skills ?? []).filter((s) => s.source === 'user');
    const plugin = (skills ?? []).filter((s) => s.source === 'plugin');
    return { userSkills: user, pluginSkills: plugin };
  }, [skills]);

  const handleCreate = () => {
    setSelectedPath(null);
    setIsCreating(true);
  };

  const handleSelect = (skillPath: string) => {
    setIsCreating(false);
    setSelectedPath(skillPath);
  };

  const handleDelete = async (skillPath: string) => {
    await deleteSkill.mutateAsync(skillPath);
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  const handleToggleEnabled = async (skill: ManagedSkill) => {
    if (skill.enabled) {
      await disableSkill.mutateAsync(skill.skillPath);
    } else {
      await enableSkill.mutateAsync(skill.skillPath);
    }
  };

  const handleClose = () => {
    setSelectedPath(null);
    setIsCreating(false);
  };

  const handleSaved = () => {
    setSelectedPath(null);
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
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <button
            onClick={handleCreate}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {/* Backend selector */}
        <div className="mb-4">
          <select
            value={backendType}
            onChange={(e) => {
              setBackendType(e.target.value as AgentBackendType);
              setSelectedPath(null);
              setIsCreating(false);
            }}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          >
            {BACKENDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* User Skills */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-400">
            User Skills
          </h3>
          <SkillList
            skills={userSkills}
            selectedPath={selectedPath}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onToggleEnabled={handleToggleEnabled}
          />
        </div>

        {/* Plugin Skills */}
        {pluginSkills.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-orange-400">
              Plugin Skills (read-only)
            </h3>
            <SkillList
              skills={pluginSkills}
              selectedPath={selectedPath}
              onSelect={() => {}}
              onDelete={() => {}}
              onToggleEnabled={() => {}}
            />
          </div>
        )}
      </div>

      {/* Right: Form pane */}
      {(isCreating || selectedSkill) && (
        <div className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          <SkillForm
            skillPath={selectedSkill?.skillPath}
            backendType={backendType}
            scope="user"
            onClose={handleClose}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify types compile**

Run: `pnpm ts-check`
Expected: Will fail because `SkillForm` doesn't exist yet — that's Task 8.

**Step 4: Commit (after Task 8)**

Commit together with Task 8.

---

### Task 8: Create Skills Settings UI — Form Component

**Files:**
- Create: `src/features/settings/ui-skills-settings/skill-form.tsx`

**Step 1: Create the skill form component**

Create `src/features/settings/ui-skills-settings/skill-form.tsx`:

```typescript
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useSkillContent,
  useCreateSkill,
  useUpdateSkill,
} from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { SkillScope } from '@shared/skill-types';

export function SkillForm({
  skillPath,
  backendType,
  scope,
  projectPath,
  onClose,
  onSaved,
}: {
  skillPath?: string;
  backendType: AgentBackendType;
  scope: SkillScope;
  projectPath?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!skillPath;
  const { data: existing } = useSkillContent(skillPath ?? null);
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  // Populate fields when editing an existing skill
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description);
      setContent(existing.content);
    } else if (!skillPath) {
      setName('');
      setDescription('');
      setContent('');
    }
  }, [existing, skillPath]);

  const handleSave = async () => {
    if (isEditing && skillPath) {
      await updateSkill.mutateAsync({ skillPath, name, description, content });
    } else {
      await createSkill.mutateAsync({
        backendType,
        scope,
        projectPath,
        name,
        description,
        content,
      });
    }
    onSaved();
  };

  const isValid = name.trim().length > 0;
  const isPending = createSkill.isPending || updateSkill.isPending;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-200">
          {isEditing ? 'Edit Skill' : 'Add Skill'}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., my-custom-skill"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Used as the skill directory name (kebab-case recommended)
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of what this skill does"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Content */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Skill Content (Markdown)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the skill instructions in Markdown..."
            rows={16}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            This becomes the body of the SKILL.md file that the agent reads when
            it invokes this skill.
          </p>
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
          disabled={!isValid || isPending}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors (Tasks 7 + 8 together should compile)

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/
git commit -m "feat: add skills settings UI components (list + form)"
```

---

### Task 9: Wire Skills Tab into Settings Overlay

**Files:**
- Modify: `src/features/settings/ui-settings-overlay/index.tsx`

**Step 1: Add import**

Add at the top of the file (after the other settings imports around line 14):

```typescript
import { SkillsSettings } from '@/features/settings/ui-skills-settings';
```

**Step 2: Add 'skills' to GlobalMenuItem type and menu items**

Update the `GlobalMenuItem` type (line 19) to include `'skills'`:

```typescript
type GlobalMenuItem =
  | 'general'
  | 'skills'
  | 'mcp-servers'
  | 'tokens'
  | 'azure-devops'
  | 'autocomplete'
  | 'debug';
```

Update `GLOBAL_MENU_ITEMS` (line 34) to add skills after general:

```typescript
const GLOBAL_MENU_ITEMS: { id: GlobalMenuItem; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp-servers', label: 'MCP Servers' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'azure-devops', label: 'Azure DevOps' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'debug', label: 'Debug' },
];
```

**Step 3: Add skills case to GlobalContent switch**

In the `GlobalContent` function (line 51), add the skills case:

```typescript
function GlobalContent({ menuItem }: { menuItem: GlobalMenuItem }) {
  switch (menuItem) {
    case 'general':
      return <GeneralSettings />;
    case 'skills':
      return <SkillsSettings />;
    case 'mcp-servers':
      return <McpServersSettings />;
    case 'tokens':
      return <TokensTab />;
    case 'azure-devops':
      return <AzureDevOpsTab />;
    case 'autocomplete':
      return <AutocompleteSettings />;
    case 'debug':
      return <DebugDatabase />;
  }
}
```

**Step 4: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat: add Skills tab to global settings overlay"
```

---

### Task 10: Add Project Skills Section

**Files:**
- Create: `src/features/project/ui-project-skills-settings/index.tsx`
- Modify: `src/features/project/ui-project-settings/index.tsx`
- Modify: `src/features/settings/ui-settings-overlay/index.tsx`

**Step 1: Create the project skills settings component**

Create `src/features/project/ui-project-skills-settings/index.tsx`:

```typescript
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import { useProject } from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import { SkillForm } from '@/features/settings/ui-skills-settings/skill-form';
import { SkillList } from '@/features/settings/ui-skills-settings/skill-list';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ManagedSkill } from '@shared/skill-types';

export function ProjectSkillsSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: backendsSetting } = useBackendsSetting();

  const backendType: AgentBackendType =
    project?.defaultAgentBackend ??
    backendsSetting?.defaultBackend ??
    'claude-code';

  const { data: skills, isLoading } = useManagedSkills(
    backendType,
    project?.path,
  );
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  // Group by source
  const { projectSkills, inheritedSkills } = useMemo(() => {
    const proj = (skills ?? []).filter((s) => s.source === 'project');
    const inherited = (skills ?? []).filter((s) => s.source !== 'project');
    return { projectSkills: proj, inheritedSkills: inherited };
  }, [skills]);

  const handleToggleEnabled = async (skill: ManagedSkill) => {
    if (skill.enabled) {
      await disableSkill.mutateAsync(skill.skillPath);
    } else {
      await enableSkill.mutateAsync(skill.skillPath);
    }
  };

  const handleDelete = async (skillPath: string) => {
    await deleteSkill.mutateAsync(skillPath);
    if (selectedPath === skillPath) setSelectedPath(null);
  };

  if (isLoading || !project) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-200">Skills</h2>
          <p className="text-xs text-neutral-500">
            Manage skills for this project&apos;s {backendType} backend
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedPath(null);
            setIsCreating(true);
          }}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          <Plus className="h-4 w-4" />
          Add Project Skill
        </button>
      </div>

      <div className="flex gap-6">
        <div className="w-80 flex-shrink-0 space-y-4">
          {/* Project Skills */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-green-400">
              Project Skills
            </h3>
            <SkillList
              skills={projectSkills}
              selectedPath={selectedPath}
              onSelect={(p) => {
                setIsCreating(false);
                setSelectedPath(p);
              }}
              onDelete={handleDelete}
              onToggleEnabled={handleToggleEnabled}
            />
          </div>

          {/* Inherited Skills */}
          {inheritedSkills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Inherited (user &amp; plugins)
              </h3>
              <SkillList
                skills={inheritedSkills}
                selectedPath={null}
                onSelect={() => {}}
                onDelete={() => {}}
                onToggleEnabled={() => {}}
              />
            </div>
          )}
        </div>

        {/* Form pane */}
        {(isCreating || selectedSkill) && (
          <div className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
            <SkillForm
              skillPath={selectedSkill?.skillPath}
              backendType={backendType}
              scope="project"
              projectPath={project.path}
              onClose={() => {
                setSelectedPath(null);
                setIsCreating(false);
              }}
              onSaved={() => {
                setSelectedPath(null);
                setIsCreating(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Wire into project settings**

In `src/features/project/ui-project-settings/index.tsx`, add the import at the top:

```typescript
import { ProjectSkillsSettings } from '@/features/project/ui-project-skills-settings';
```

Then add the skills section before the MCP section (before the `{/* MCP Server Templates */}` comment, around line 274):

```tsx
      {/* Skills */}
      <div
        id="project-skills"
        className="border-t border-neutral-700 pt-6"
      >
        <ProjectSkillsSettings projectId={projectId} />
      </div>
```

**Step 3: Add Skills to project menu items in settings overlay**

In `src/features/settings/ui-settings-overlay/index.tsx`, update `ProjectMenuItem` type and `PROJECT_MENU_ITEMS`:

```typescript
type ProjectMenuItem =
  | 'details'
  | 'integrations'
  | 'run-commands'
  | 'skills'
  | 'mcp-overrides'
  | 'danger-zone';

const PROJECT_MENU_ITEMS: { id: ProjectMenuItem; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'run-commands', label: 'Run Commands' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp-overrides', label: 'MCP Overrides' },
  { id: 'danger-zone', label: 'Danger Zone' },
];
```

**Step 4: Verify types compile**

Run: `pnpm ts-check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/features/project/ui-project-skills-settings/ src/features/project/ui-project-settings/index.tsx src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat: add project-level skills management section"
```

---

### Task 11: Lint and Type-Check Verification

**Step 1: Run linter**

Run: `pnpm lint --fix`
Expected: All files pass or auto-fixed

**Step 2: Run type checker**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: address lint and type-check issues"
```

---

### Task 12: Final Review

**Step 1: Verify all files exist**

Check that all new files have been created:

```bash
ls -la electron/services/skill-management-service.ts
ls -la src/features/settings/ui-skills-settings/index.tsx
ls -la src/features/settings/ui-skills-settings/skill-list.tsx
ls -la src/features/settings/ui-skills-settings/skill-form.tsx
ls -la src/features/project/ui-project-skills-settings/index.tsx
ls -la src/hooks/use-managed-skills.ts
```

All files should exist.

**Step 2: Verify modified files**

These files should have been modified:

- `shared/skill-types.ts` — Extended with `ManagedSkill`, `AgentSkillPathConfig`, `SkillScope`
- `electron/ipc/handlers.ts` — Added 7 new skill management handlers
- `electron/preload.ts` — Added `skillManagement` namespace
- `src/lib/api.ts` — Added `skillManagement` to `Api` interface + mock
- `src/features/settings/ui-settings-overlay/index.tsx` — Added Skills to global + project menus
- `src/features/project/ui-project-settings/index.tsx` — Added ProjectSkillsSettings section

**Step 3: Run final verification**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: Clean
