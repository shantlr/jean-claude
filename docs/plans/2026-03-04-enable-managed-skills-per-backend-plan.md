# Enable Managed Skills Per Backend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to independently enable/disable a managed skill for each agent backend (Claude Code, OpenCode) via inline toggle chips in the global skills settings card grid.

**Architecture:** Replace the single `enabled: boolean` + `backendType: AgentBackendType` fields on `ManagedSkill` with `enabledBackends: Partial<Record<AgentBackendType, boolean>>`. Add a new unified discovery service function that checks symlinks across all backends. Update the card grid with clickable per-backend toggle chips.

**Tech Stack:** TypeScript, React, Electron IPC, filesystem symlinks

---

### Task 1: Update `ManagedSkill` type

**Files:**
- Modify: `shared/skill-types.ts`

**Step 1: Replace `enabled` and `backendType` with `enabledBackends`**

In `shared/skill-types.ts`, change the `ManagedSkill` interface:

```typescript
export interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  /** For plugin skills, the plugin name (e.g., "superpowers") */
  pluginName?: string;
  /** Full path to the skill directory */
  skillPath: string;
  /** Per-backend enabled status. Key present = backend is relevant; value = enabled. */
  enabledBackends: Partial<Record<AgentBackendType, boolean>>;
  editable: boolean;
}
```

Import `AgentBackendType` at the top of `shared/skill-types.ts` (it's already imported).

**Step 2: Run `pnpm ts-check` to see all compilation errors**

This will fail in many files — that's expected. The errors form our todo list for the remaining tasks.

**Step 3: Commit**

```bash
git add shared/skill-types.ts
git commit -m "feat(skills): replace enabled+backendType with enabledBackends on ManagedSkill"
```

---

### Task 2: Update skill management service — discovery functions

**Files:**
- Modify: `electron/services/skill-management-service.ts`

**Step 1: Update `discoverJcManagedUserSkills` to accept no backend parameter and return multi-backend enabled status**

Replace the existing function. The new version scans canonical storage once, then checks symlinks in ALL backend directories:

```typescript
/**
 * Scans the JC canonical directory for user skills.
 * For each skill, checks whether a symlink exists in EVERY backend's
 * expected skills directory to build the enabledBackends map.
 */
async function discoverJcManagedUserSkills(): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_USER_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const canonicalPath = path.join(JC_USER_SKILLS_DIR, entry.name);
      const info = await readSkillDir(canonicalPath);
      if (!info) continue;

      const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
      for (const [backend, config] of Object.entries(SKILL_PATH_CONFIGS)) {
        const symlinkPath = path.join(config.userSkillsDir, entry.name);
        enabledBackends[backend as AgentBackendType] = await isSymlink(symlinkPath);
      }

      skills.push({
        ...info,
        source: 'user',
        skillPath: canonicalPath,
        enabledBackends,
        editable: true,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading JC user skills dir %s: %O',
        JC_USER_SKILLS_DIR,
        error,
      );
    }
  }

  return skills;
}
```

**Step 2: Keep the old single-backend overload for backward compat**

Add a new helper for single-backend discovery (used by `getAllManagedSkills`):

```typescript
async function discoverJcManagedUserSkillsForBackend(
  backendType: AgentBackendType,
): Promise<ManagedSkill[]> {
  const config = SKILL_PATH_CONFIGS[backendType];
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_USER_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const canonicalPath = path.join(JC_USER_SKILLS_DIR, entry.name);
      const info = await readSkillDir(canonicalPath);
      if (!info) continue;

      const symlinkPath = path.join(config.userSkillsDir, entry.name);
      const enabled = await isSymlink(symlinkPath);

      skills.push({
        ...info,
        source: 'user',
        skillPath: canonicalPath,
        enabledBackends: { [backendType]: enabled },
        editable: true,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading JC user skills dir %s: %O',
        JC_USER_SKILLS_DIR,
        error,
      );
    }
  }

  return skills;
}
```

**Step 3: Update `discoverLegacyUserSkills` return type**

Change all `.push()` calls to use `enabledBackends: { [backendType]: true }` instead of `enabled: true, backendType`. There are three push sites in this function:

- Line ~321: `enabled: true, backendType,` → `enabledBackends: { [backendType]: true },`
- Line ~346: `enabled: true, backendType,` → `enabledBackends: { [backendType]: true },`

**Step 4: Update `discoverSkillsInDir` return type**

Change the parameter and push logic:
- Remove `enabled: boolean` and `backendType: AgentBackendType` from the parameter object
- Add `enabledBackends: Partial<Record<AgentBackendType, boolean>>` to the parameter object
- Update the push: `enabled, backendType,` → `enabledBackends,`

Update all callers of `discoverSkillsInDir`:
- In `getAllManagedSkills` for project skills: `{ ..., enabled: true, backendType }` → `{ ..., enabledBackends: { [backendType]: true } }`
- In `discoverPluginSkills`: `{ ..., enabled: true, backendType }` → `{ ..., enabledBackends: { [backendType]: true } }`

**Step 5: Update `getAllManagedSkills` to use the single-backend helper**

Change line ~633 from:
```typescript
results.push(...(await discoverJcManagedUserSkills(backendType)));
```
to:
```typescript
results.push(...(await discoverJcManagedUserSkillsForBackend(backendType)));
```

**Step 6: Add new `getAllManagedSkillsUnified` function**

Add after `getAllManagedSkills`:

```typescript
/**
 * Returns all skills with per-backend enabled status.
 * JC-managed user skills show enabled state for every backend.
 * Legacy, project, and plugin skills show only their native backend.
 */
export async function getAllManagedSkillsUnified({
  projectPath,
}: {
  projectPath?: string;
}): Promise<ManagedSkill[]> {
  const results: ManagedSkill[] = [];
  const seenPaths = new Set<string>();

  // JC-managed user skills with multi-backend enabled status
  const jcSkills = await discoverJcManagedUserSkills();
  for (const skill of jcSkills) {
    seenPaths.add(skill.skillPath);
    results.push(skill);
  }

  // Legacy, project, and plugin skills per backend
  for (const [backend, config] of Object.entries(SKILL_PATH_CONFIGS)) {
    const backendType = backend as AgentBackendType;

    // Legacy user skills
    const legacy = await discoverLegacyUserSkills(backendType);
    for (const skill of legacy) {
      if (seenPaths.has(skill.skillPath)) continue;
      seenPaths.add(skill.skillPath);
      results.push(skill);
    }

    // Project skills
    if (projectPath && config.projectSkillsDir) {
      const projectSkillsDir = path.join(projectPath, config.projectSkillsDir);
      const projectSkills = await discoverSkillsInDir({
        baseDir: projectSkillsDir,
        source: 'project',
        enabledBackends: { [backendType]: true },
        editable: true,
      });
      for (const skill of projectSkills) {
        if (seenPaths.has(skill.skillPath)) continue;
        seenPaths.add(skill.skillPath);
        results.push(skill);
      }
    }

    // Plugin skills
    if (config.pluginSkillsDir) {
      const pluginSkills = await discoverPluginSkills(
        config.pluginSkillsDir,
        backendType,
      );
      for (const skill of pluginSkills) {
        if (seenPaths.has(skill.skillPath)) continue;
        seenPaths.add(skill.skillPath);
        results.push(skill);
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
```

Note: `discoverPluginSkills` also needs updating — it calls `discoverSkillsInDir`, which now uses `enabledBackends`. Update its call site to pass `enabledBackends: { [backendType]: true }`.

**Step 7: Update `createSkill` to accept `enabledBackends` array**

Change the parameter type:
```typescript
export async function createSkill({
  enabledBackends: enabledBackendsList,
  scope,
  projectPath,
  name,
  description,
  content,
}: {
  enabledBackends: AgentBackendType[];
  scope: SkillScope;
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}): Promise<ManagedSkill> {
```

For **project scope**: Use the first backend in the list (project skills are single-backend). Return `enabledBackends: { [backendType]: true }`.

For **user scope**: Create canonical dir + SKILL.md, then create symlinks in each backend's skills directory from the list. Return `enabledBackends` map with `true` for each listed backend.

Replace the single symlink creation block (~lines 921-932) with a loop:
```typescript
// Create symlinks in each selected backend's expected path
const createdSymlinks: string[] = [];
try {
  for (const backend of enabledBackendsList) {
    const cfg = SKILL_PATH_CONFIGS[backend];
    const symlinkPath = path.join(cfg.userSkillsDir, dirName);
    await fs.mkdir(cfg.userSkillsDir, { recursive: true });
    await fs.symlink(canonicalPath, symlinkPath);
    createdSymlinks.push(symlinkPath);
  }
} catch (symlinkError) {
  // Rollback: remove any symlinks we created, then remove canonical
  for (const sl of createdSymlinks) {
    try { await fs.unlink(sl); } catch { /* ignore */ }
  }
  await fs.rm(canonicalPath, { recursive: true, force: true });
  throw symlinkError;
}

const enabledBackendsMap: Partial<Record<AgentBackendType, boolean>> = {};
for (const backend of enabledBackendsList) {
  enabledBackendsMap[backend] = true;
}
```

Return: `enabledBackends: enabledBackendsMap` instead of `enabled: true, backendType`.

**Step 8: Update `updateSkill` return type**

Change the return to use `enabledBackends`. For JC-managed skills, check symlinks in all backends:

```typescript
const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
if (isJcManaged) {
  for (const [backend, cfg] of Object.entries(SKILL_PATH_CONFIGS)) {
    const symlinkPath = path.join(cfg.userSkillsDir, path.basename(skillPath));
    enabledBackends[backend as AgentBackendType] = await isSymlink(symlinkPath);
  }
} else {
  enabledBackends[backendType] = true;
}
```

Remove `enabled` and `backendType` from the return, replace with `enabledBackends`.

**Step 9: Run `pnpm ts-check` to verify service compiles**

**Step 10: Commit**

```bash
git add electron/services/skill-management-service.ts
git commit -m "feat(skills): update service for multi-backend enabledBackends"
```

---

### Task 3: Update IPC handlers and preload bridge

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`

**Step 1: Add `skills:getAllUnified` IPC handler**

In `electron/ipc/handlers.ts`, add after the existing `skills:getAll` handler:

```typescript
ipcMain.handle(
  'skills:getAllUnified',
  async (_, projectPath?: string) => {
    dbg.ipc('skills:getAllUnified project=%s', projectPath);
    return getAllManagedSkillsUnified({ projectPath });
  },
);
```

Import `getAllManagedSkillsUnified` from the service at the top of the file.

**Step 2: Update `skills:create` handler param type**

Change the params type in the `skills:create` handler:
```typescript
params: {
  enabledBackends: AgentBackendType[];
  scope: 'user' | 'project';
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}
```

**Step 3: Add `skills:getAllUnified` to preload bridge**

In `electron/preload.ts`, add to the `skillManagement` object:

```typescript
getAllUnified: (projectPath?: string) =>
  ipcRenderer.invoke('skills:getAllUnified', projectPath),
```

**Step 4: Update `create` in preload bridge**

Change the `create` method params:
```typescript
create: (params: {
  enabledBackends: string[];
  scope: string;
  projectPath?: string;
  name: string;
  description: string;
  content: string;
}) => ipcRenderer.invoke('skills:create', params),
```

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts
git commit -m "feat(skills): add getAllUnified IPC handler, update create params"
```

---

### Task 4: Update renderer API types

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add `getAllUnified` to the `skillManagement` type**

In the `skillManagement` section of the API interface, add:

```typescript
getAllUnified: (projectPath?: string) => Promise<ManagedSkill[]>;
```

**Step 2: Update `create` param type**

Change `backendType: AgentBackendType` to `enabledBackends: AgentBackendType[]` in the `create` method signature.

**Step 3: Update mock/fallback implementations**

In the mock API section (~line 1091), update:
- `create: async () => (...)` — change `enabled: true, backendType: 'claude-code' as const` to `enabledBackends: { 'claude-code': true }`
- `update: async () => (...)` — change `enabled: true, backendType: 'claude-code' as const` to `enabledBackends: { 'claude-code': true }`
- Add `getAllUnified: async () => [],`

**Step 4: Run `pnpm ts-check`**

**Step 5: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(skills): update renderer API types for enabledBackends"
```

---

### Task 5: Update React hooks

**Files:**
- Modify: `src/hooks/use-managed-skills.ts`

**Step 1: Add query key for unified endpoint**

```typescript
export const managedSkillsQueryKeys = {
  all: ['managedSkills'] as const,
  unified: (projectPath?: string) =>
    [...managedSkillsQueryKeys.all, 'unified', projectPath ?? ''] as const,
  byBackend: (backendType: AgentBackendType, projectPath?: string) =>
    [...managedSkillsQueryKeys.all, backendType, projectPath ?? ''] as const,
  content: (skillPath: string) =>
    [...managedSkillsQueryKeys.all, 'content', skillPath] as const,
};
```

**Step 2: Simplify `useAllManagedSkills`**

Replace the current implementation (which queries both backends and merges) with a direct call:

```typescript
export function useAllManagedSkills(projectPath?: string) {
  return useQuery({
    queryKey: managedSkillsQueryKeys.unified(projectPath),
    queryFn: () => api.skillManagement.getAllUnified(projectPath),
    staleTime: 30_000,
  });
}
```

Remove the `useMemo` import if no longer needed.

**Step 3: Update `useCreateSkill` param type**

Change the mutation params:
```typescript
export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      enabledBackends: AgentBackendType[];
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
```

**Step 4: Run `pnpm ts-check`**

**Step 5: Commit**

```bash
git add src/hooks/use-managed-skills.ts
git commit -m "feat(skills): simplify useAllManagedSkills to use unified endpoint"
```

---

### Task 6: Update skill card grid with per-backend toggle chips

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-card-grid.tsx`

**Step 1: Replace `BackendBadge` with `BackendToggleChip`**

Remove the existing `BackendBadge` component. Add:

```typescript
function BackendToggleChip({
  backendType,
  enabled,
  editable,
  onClick,
}: {
  backendType: AgentBackendType;
  enabled: boolean;
  editable: boolean;
  onClick?: () => void;
}) {
  const isClaude = backendType === 'claude-code';
  const label = isClaude ? 'CC' : 'OC';

  if (!editable || !onClick) {
    // Static badge for non-toggleable skills
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          enabled
            ? isClaude
              ? 'bg-orange-900/30 text-orange-400'
              : 'bg-blue-900/30 text-blue-400'
            : 'bg-neutral-800 text-neutral-600'
        }`}
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        enabled
          ? isClaude
            ? 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50'
            : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
          : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'
      }`}
      title={`${enabled ? 'Disable' : 'Enable'} for ${backendLabel(backendType)}`}
    >
      {label}
    </button>
  );
}
```

**Step 2: Add helper for checking if any backend is enabled**

```typescript
function isEnabledForAnyBackend(
  enabledBackends: Partial<Record<string, boolean>>,
): boolean {
  return Object.values(enabledBackends).some(Boolean);
}
```

**Step 3: Update `SkillCardGrid` props to accept toggle handler**

```typescript
export function SkillCardGrid({
  skills,
  selectedPath,
  onSelect,
  onToggleBackend,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
  onToggleBackend?: (skill: ManagedSkill, backendType: AgentBackendType) => void;
}) {
```

**Step 4: Update card rendering**

Replace the opacity check:
```typescript
${!isEnabledForAnyBackend(skill.enabledBackends) ? 'opacity-60' : ''}
```

Replace the icon color:
```typescript
<Wand2
  className={`h-4 w-4 shrink-0 ${isEnabledForAnyBackend(skill.enabledBackends) ? 'text-purple-400' : 'text-neutral-600'}`}
/>
```

Replace the badges section:
```typescript
<div className="flex flex-wrap gap-1.5">
  {Object.entries(skill.enabledBackends).map(([backend, enabled]) => (
    <BackendToggleChip
      key={backend}
      backendType={backend as AgentBackendType}
      enabled={!!enabled}
      editable={skill.editable}
      onClick={
        skill.editable && onToggleBackend
          ? () => onToggleBackend(skill, backend as AgentBackendType)
          : undefined
      }
    />
  ))}
  <SourceBadge skill={skill} />
</div>
```

**Step 5: Import `AgentBackendType`**

Add at the top:
```typescript
import type { AgentBackendType } from '@shared/agent-backend-types';
```

**Step 6: Run `pnpm ts-check`**

**Step 7: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-card-grid.tsx
git commit -m "feat(skills): add per-backend toggle chips to skill card grid"
```

---

### Task 7: Update skill form with backend checkboxes

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-form.tsx`

**Step 1: Replace single backend state with multi-backend state**

Change:
```typescript
const [formBackendType, setFormBackendType] = useState(backendType);
```
to:
```typescript
const [formEnabledBackends, setFormEnabledBackends] = useState<AgentBackendType[]>(
  enabledBackends ?? ['claude-code', 'opencode'],
);
```

Update the component props — replace `backendType: AgentBackendType` with `enabledBackends?: AgentBackendType[]` (optional, only for create mode):

```typescript
export function SkillForm({
  skillPath,
  enabledBackends,
  scope,
  projectPath,
  onClose,
  onSaved,
}: {
  skillPath?: string;
  enabledBackends?: AgentBackendType[];
  scope: SkillScope;
  projectPath?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
```

**Step 2: Update the create mutation call**

Change:
```typescript
await createSkill.mutateAsync({
  backendType: formBackendType,
  scope,
  projectPath,
  name,
  description,
  content,
});
```
to:
```typescript
await createSkill.mutateAsync({
  enabledBackends: formEnabledBackends,
  scope,
  projectPath,
  name,
  description,
  content,
});
```

**Step 3: Update the update mutation call**

The update mutation still needs a `backendType`. Since we're editing an existing skill, pass any backend from `enabledBackends` (or default to `'claude-code'`):

```typescript
await updateSkill.mutateAsync({
  skillPath,
  backendType: enabledBackends?.[0] ?? 'claude-code',
  name,
  description,
  content,
});
```

**Step 4: Replace the backend dropdown with checkboxes**

Replace the `<select>` block (~lines 126-145) with:

```typescript
{!isEditing && (
  <div>
    <label className="mb-1 block text-sm font-medium text-neutral-400">
      Backends
    </label>
    <div className="flex gap-3">
      {(['claude-code', 'opencode'] as AgentBackendType[]).map((backend) => (
        <label key={backend} className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={formEnabledBackends.includes(backend)}
            onChange={(e) => {
              setFormEnabledBackends((prev) =>
                e.target.checked
                  ? [...prev, backend]
                  : prev.filter((b) => b !== backend),
              );
            }}
            className="rounded border-neutral-600 bg-neutral-800"
          />
          {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}
        </label>
      ))}
    </div>
    <p className="mt-1 text-xs text-neutral-500">
      Which agent backends this skill will be available to
    </p>
  </div>
)}
```

**Step 5: Add validation — at least one backend required**

In the save handler, add before the try block:
```typescript
if (!isEditing && formEnabledBackends.length === 0) return;
```

Update the save button disabled state to include:
```typescript
disabled={!name.trim() || saving || (!isEditing && formEnabledBackends.length === 0)}
```

**Step 6: Run `pnpm ts-check`**

**Step 7: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-form.tsx
git commit -m "feat(skills): replace backend dropdown with multi-backend checkboxes"
```

---

### Task 8: Update skill details pane

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-details.tsx`

**Step 1: Replace single backend badge with per-backend status**

Replace the backend badge (~lines 85-91) with:

```typescript
{Object.entries(skill.enabledBackends).map(([backend, enabled]) => (
  <span
    key={backend}
    className={`rounded px-2 py-1 ${
      backend === 'claude-code'
        ? 'bg-orange-900/30 text-orange-400'
        : 'bg-blue-900/30 text-blue-400'
    }`}
  >
    {backend === 'claude-code' ? 'Claude Code' : 'OpenCode'}
    {enabled ? ' ✓' : ' ✗'}
  </span>
))}
```

**Step 2: Replace single enable/disable toggle with per-backend toggles**

Replace the enable/disable toggle section (~lines 95-111) with:

```typescript
{onToggleEnabled && skill.editable ? (
  <div className="flex gap-2">
    {Object.entries(skill.enabledBackends).map(([backend, enabled]) => (
      <button
        key={backend}
        type="button"
        onClick={() =>
          onToggleEnabled(skill, backend as AgentBackendType)
        }
        className={`cursor-pointer rounded px-2 py-1 text-sm ${
          enabled
            ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
            : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
        }`}
      >
        {backend === 'claude-code' ? 'CC' : 'OC'}:{' '}
        {enabled ? 'On' : 'Off'}
      </button>
    ))}
  </div>
) : (
  <div className="flex gap-2">
    {Object.entries(skill.enabledBackends).map(([backend, enabled]) => (
      <span
        key={backend}
        className="rounded bg-neutral-700 px-2 py-1 text-neutral-300"
      >
        {backend === 'claude-code' ? 'CC' : 'OC'}:{' '}
        {enabled ? 'On' : 'Off'}
      </span>
    ))}
  </div>
)}
```

**Step 3: Update `onToggleEnabled` prop type**

Change:
```typescript
onToggleEnabled?: (skill: ManagedSkill) => void;
```
to:
```typescript
onToggleEnabled?: (skill: ManagedSkill, backendType: AgentBackendType) => void;
```

Import `AgentBackendType`:
```typescript
import type { AgentBackendType } from '@shared/agent-backend-types';
```

**Step 4: Run `pnpm ts-check`**

**Step 5: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-details.tsx
git commit -m "feat(skills): update skill details with per-backend toggles"
```

---

### Task 9: Update global skills settings orchestration

**Files:**
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Update `handleToggleEnabled` to accept backend parameter**

Replace:
```typescript
const handleToggleEnabled = async (skill: ManagedSkill) => {
  if (skill.enabled) {
    await disableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType: skill.backendType,
    });
  } else {
    await enableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType: skill.backendType,
    });
  }
};
```
with:
```typescript
const handleToggleEnabled = async (
  skill: ManagedSkill,
  backendType: AgentBackendType,
) => {
  const isEnabled = skill.enabledBackends[backendType];
  if (isEnabled) {
    await disableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType,
    });
  } else {
    await enableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType,
    });
  }
};
```

Import `AgentBackendType` at the top.

**Step 2: Update `handleDelete`**

Replace `backendType: skill.backendType` with a backend from the skill's enabled backends:

```typescript
const handleDelete = async (skillPath: string) => {
  const skill = skills?.find((s) => s.skillPath === skillPath);
  if (!skill) return;
  const backendType =
    (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ?? 'claude-code';
  await deleteSkill.mutateAsync({
    skillPath,
    backendType,
  });
  if (selectedPath === skillPath) setSelectedPath(null);
};
```

**Step 3: Pass `onToggleBackend` to `SkillCardGrid`**

Update both `<SkillCardGrid>` usages to pass the new prop:

```typescript
<SkillCardGrid
  skills={mySkills}
  selectedPath={selectedPath}
  onSelect={handleSelect}
  onToggleBackend={handleToggleEnabled}
/>
```

and:

```typescript
<SkillCardGrid
  skills={installedSkills}
  selectedPath={selectedPath}
  onSelect={handleSelect}
/>
```

(No `onToggleBackend` for installed skills since they're not editable.)

**Step 4: Update the create form rendering**

Replace `backendType="claude-code"` with no backend prop (form defaults to all backends):

```typescript
<SkillForm
  scope="user"
  onClose={handleClose}
  onSaved={handleSaved}
/>
```

For the edit form, pass the skill's current enabled backends:

```typescript
<SkillForm
  skillPath={selectedSkill.skillPath}
  enabledBackends={
    Object.entries(selectedSkill.enabledBackends)
      .filter(([, v]) => v)
      .map(([k]) => k as AgentBackendType)
  }
  scope="user"
  onClose={handleClose}
  onSaved={handleSaved}
/>
```

**Step 5: Run `pnpm ts-check`**

**Step 6: Commit**

```bash
git add src/features/settings/ui-skills-settings/index.tsx
git commit -m "feat(skills): wire up per-backend toggles in global skills settings"
```

---

### Task 10: Update project-level skills settings

**Files:**
- Modify: `src/features/project/ui-project-skills-settings/index.tsx`

**Step 1: Update `handleToggleEnabled` to accept backend parameter**

Same pattern as Task 9 — add `backendType: AgentBackendType` parameter:

```typescript
const handleToggleEnabled = async (
  skill: ManagedSkill,
  backendType: AgentBackendType,
) => {
  const isEnabled = skill.enabledBackends[backendType];
  if (isEnabled) {
    await disableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType,
    });
  } else {
    await enableSkill.mutateAsync({
      skillPath: skill.skillPath,
      backendType,
    });
  }
};
```

**Step 2: Update `handleDelete`**

Same as Task 9 — use first key from `enabledBackends`:

```typescript
const handleDelete = async (skillPath: string) => {
  const skill = skills?.find((s) => s.skillPath === skillPath);
  if (!skill) return;
  const bt =
    (Object.keys(skill.enabledBackends)[0] as AgentBackendType) ?? 'claude-code';
  await deleteSkill.mutateAsync({
    skillPath,
    backendType: bt,
  });
  if (selectedPath === skillPath) setSelectedPath(null);
};
```

**Step 3: Pass `onToggleBackend` to `SkillCardGrid`**

Update the card grid for inherited skills (which can be toggled) to pass `onToggleBackend`.

**Step 4: Update the create form**

Replace `backendType={backendType}` with `enabledBackends={[backendType]}`:

```typescript
<SkillForm
  enabledBackends={[backendType]}
  scope="project"
  projectPath={project.path}
  onClose={...}
  onSaved={...}
/>
```

For the edit form:
```typescript
<SkillForm
  skillPath={selectedSkill.skillPath}
  enabledBackends={
    Object.entries(selectedSkill.enabledBackends)
      .filter(([, v]) => v)
      .map(([k]) => k as AgentBackendType)
  }
  scope="project"
  projectPath={project.path}
  onClose={...}
  onSaved={...}
/>
```

**Step 5: Run `pnpm ts-check`**

**Step 6: Commit**

```bash
git add src/features/project/ui-project-skills-settings/index.tsx
git commit -m "feat(skills): update project skills settings for enabledBackends"
```

---

### Task 11: Final verification

**Step 1: Run `pnpm install`**

**Step 2: Run `pnpm lint --fix`**

**Step 3: Run `pnpm ts-check`**

Fix any remaining type errors. Common issues:
- Anywhere that accessed `skill.enabled` or `skill.backendType` that was missed
- Mock objects in tests or storybook that use the old shape

**Step 4: Run `pnpm lint`**

Fix any remaining lint errors.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(skills): resolve lint and type errors from enabledBackends migration"
```
