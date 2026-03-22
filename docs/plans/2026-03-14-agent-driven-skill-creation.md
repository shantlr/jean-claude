# Agent-Driven Skill Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to create and improve skills by launching an agent session (with the `skill-creator` skill) instead of manually writing SKILL.md files.

**Architecture:** A hidden "system project" at `~/.jean-claude/system-project/` hosts skill-creation tasks. Each task gets an isolated workspace under that project. The agent writes skill files into the workspace. On completion, the user reviews and "publishes" the skill — moving it from workspace to the canonical skill directory with proper symlinks. For skill improvement, the existing skill is copied into the workspace first so the agent can iterate on it.

**Tech Stack:** Electron IPC, SQLite/Kysely migrations, React (Zustand stores, TanStack Query/Router), existing agent-service infrastructure.

---

## Task 1: Extend `ProjectType` to support `'system'`

**Files:**
- Modify: `shared/types.ts:38`
- Modify: `electron/database/schema.ts:74`

**Step 1: Add `'system'` to `ProjectType`**

In `shared/types.ts`, line 38:

```typescript
// Before
export type ProjectType = 'local' | 'git-provider';

// After
export type ProjectType = 'local' | 'git-provider' | 'system';
```

No database migration needed — `type` is stored as a `string` column in SQLite and `ProjectType` is only a TypeScript type. The column already accepts any string value.

**Step 2: Verify no side effects**

Run: `pnpm ts-check`
Expected: PASS — `ProjectType` is used for type narrowing only, no exhaustive switches that would break.

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add 'system' project type for internal utility projects"
```

---

## Task 2: Add `SkillCreationStepMeta` type

**Files:**
- Modify: `shared/types.ts:369-374`

**Step 1: Define the meta type**

Add before the `TaskStepMeta` union (around line 368):

```typescript
/** Meta for skill-creation steps — workspace and publish tracking */
export interface SkillCreationStepMeta {
  /** Whether this is a new skill or improving an existing one */
  mode: 'create' | 'improve';
  /** Absolute path to the task workspace dir (e.g. ~/.jean-claude/system-project/workspaces/<taskId>/) */
  workspacePath: string;
  /** Absolute path to the original skill (for 'improve' mode) */
  sourceSkillPath?: string;
  /** Backends to enable when publishing */
  enabledBackends: AgentBackendType[];
  /** Whether the skill has been published from this workspace */
  published?: boolean;
}
```

Then add `SkillCreationStepMeta` to the union:

```typescript
export type TaskStepMeta =
  | CreatePullRequestStepMeta
  | ForkStepMeta
  | PrReviewStepMeta
  | ReviewStepMeta
  | SkillCreationStepMeta
  | Record<string, never>;
```

**Step 2: Add `'skill-creation'` to `TaskStepType`**

Around line 315:

```typescript
// Before
export type TaskStepType =
  | 'agent'
  | 'create-pull-request'
  | 'fork'
  | 'pr-review'
  | 'review';

// After
export type TaskStepType =
  | 'agent'
  | 'create-pull-request'
  | 'fork'
  | 'pr-review'
  | 'review'
  | 'skill-creation';
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add SkillCreationStepMeta type and skill-creation step type"
```

---

## Task 3: Create `system-project-service.ts`

**Files:**
- Create: `electron/services/system-project-service.ts`
- Modify: `electron/database/repositories/projects.ts` (add `findByType`)

**Step 1: Add `findByType` to project repository**

In `electron/database/repositories/projects.ts`, add a new method after `findById`:

```typescript
findByType: (type: string) =>
  db
    .selectFrom('projects')
    .selectAll()
    .where('type', '=', type)
    .executeTakeFirst(),
```

**Step 2: Create the service**

```typescript
// electron/services/system-project-service.ts
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { ProjectRepository } from '../database/repositories/projects';

const SYSTEM_PROJECT_DIR = path.join(
  os.homedir(),
  '.jean-claude',
  'system-project',
);

/**
 * Returns the system project, creating it lazily on first use.
 * The system project is a hidden internal project used for utility tasks
 * like agent-driven skill creation.
 */
export async function getOrCreateSystemProject() {
  const existing = await ProjectRepository.findByType('system');
  if (existing) return existing;

  // Ensure directory exists
  await mkdir(SYSTEM_PROJECT_DIR, { recursive: true });

  return ProjectRepository.create({
    name: 'Jean-Claude System',
    path: SYSTEM_PROJECT_DIR,
    type: 'system',
    color: '#6b7280', // neutral gray
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Returns the workspace path for a skill-creation task.
 * Creates the directory if it doesn't exist.
 */
export async function getSkillWorkspacePath(taskId: string): Promise<string> {
  const workspacePath = path.join(
    SYSTEM_PROJECT_DIR,
    'workspaces',
    taskId,
  );
  await mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

/**
 * Cleans up a skill workspace directory.
 */
export async function cleanupSkillWorkspace(
  workspacePath: string,
): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await rm(workspacePath, { recursive: true, force: true });
}
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/services/system-project-service.ts electron/database/repositories/projects.ts
git commit -m "feat: add system project service with lazy creation and workspace management"
```

---

## Task 4: Filter system projects from UI project lists

**Files:**
- Modify: `electron/database/repositories/projects.ts` (update `findAll`)
- Modify: `electron/database/repositories/tasks.ts` (update `findAllActive`, `findAllCompleted`)

**Step 1: Filter system projects from `findAll`**

In `projects.ts`, update the `findAll` method:

```typescript
// Before
findAll: () =>
  db.selectFrom('projects').selectAll().orderBy('sortOrder', 'asc').execute(),

// After
findAll: () =>
  db
    .selectFrom('projects')
    .selectAll()
    .where('type', '!=', 'system')
    .orderBy('sortOrder', 'asc')
    .execute(),
```

System project tasks should still appear in `/all` — they are normal tasks. No changes to `findAllActive` / `findAllCompleted` needed since those join on `projects` but don't filter by type.

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/database/repositories/projects.ts
git commit -m "feat: hide system projects from project list UI"
```

---

## Task 5: Add `skills:createWithAgent` IPC handler

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

This is the main orchestration handler. It:
1. Gets or creates the system project
2. Creates a workspace directory
3. For "improve" mode, copies existing skill to workspace
4. Creates a task + step with `SkillCreationStepMeta`
5. Auto-starts the agent

**Step 1: Add the IPC handler**

In `electron/ipc/handlers.ts`, add after the existing skill handlers:

```typescript
import {
  getOrCreateSystemProject,
  getSkillWorkspacePath,
} from '../services/system-project-service';
import { cp } from 'node:fs/promises';

ipcMain.handle(
  'skills:createWithAgent',
  async (
    _event,
    data: {
      prompt: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
      interactionMode?: InteractionMode | null;
      modelPreference?: string | null;
      agentBackend?: AgentBackendType | null;
    },
  ) => {
    const systemProject = await getOrCreateSystemProject();

    // Generate a task name
    const taskName = await generateTaskName(data.prompt);

    // Create task in system project
    const task = await TaskRepository.create({
      projectId: systemProject.id,
      name: taskName,
      prompt: data.prompt,
      updatedAt: new Date().toISOString(),
    });

    // Create workspace
    const workspacePath = await getSkillWorkspacePath(task.id);

    // For improve mode, copy existing skill into workspace
    if (data.mode === 'improve' && data.sourceSkillPath) {
      await cp(data.sourceSkillPath, workspacePath, { recursive: true });
    }

    // Build the agent prompt
    const agentPrompt = buildSkillCreationPrompt({
      userPrompt: data.prompt,
      mode: data.mode,
      workspacePath,
      sourceSkillPath: data.sourceSkillPath,
    });

    // Create step with skill-creation meta
    const meta: SkillCreationStepMeta = {
      mode: data.mode,
      workspacePath,
      sourceSkillPath: data.sourceSkillPath,
      enabledBackends: data.enabledBackends,
    };

    const step = await StepService.create({
      taskId: task.id,
      name: 'Step 1',
      type: 'skill-creation',
      promptTemplate: agentPrompt,
      interactionMode: data.interactionMode ?? 'plan',
      modelPreference: data.modelPreference ?? null,
      agentBackend: data.agentBackend ?? 'claude-code',
      meta,
    });

    // Auto-start
    agentService.start(step.id).catch((err) => {
      dbg.ipc(
        'Error auto-starting skill creation agent for step %s: %O',
        step.id,
        err,
      );
    });

    return task;
  },
);
```

**Step 2: Add the prompt builder helper**

Add this function in the same file (or in a dedicated helper — inline is fine for now):

```typescript
function buildSkillCreationPrompt({
  userPrompt,
  mode,
  workspacePath,
  sourceSkillPath,
}: {
  userPrompt: string;
  mode: 'create' | 'improve';
  workspacePath: string;
  sourceSkillPath?: string;
}): string {
  if (mode === 'improve') {
    return [
      `Improve an existing skill based on the following request:`,
      ``,
      `<user-request>`,
      userPrompt,
      `</user-request>`,
      ``,
      `The current skill files have been copied to: ${workspacePath}`,
      `Edit the SKILL.md (and any companion files) in that directory.`,
      ``,
      `The SKILL.md must retain valid YAML frontmatter with \`name\` and \`description\` fields.`,
      `Use the skill-creator skill for best practices.`,
    ].join('\n');
  }

  return [
    `Create a new skill based on the following description:`,
    ``,
    `<user-request>`,
    userPrompt,
    `</user-request>`,
    ``,
    `Write the skill to: ${workspacePath}/<skill-name>/SKILL.md`,
    ``,
    `The SKILL.md must have YAML frontmatter:`,
    `---`,
    `name: <skill-name>`,
    `description: <one-line description>`,
    `---`,
    ``,
    `<markdown body with instructions>`,
    ``,
    `Use the skill-creator skill for best practices.`,
  ].join('\n');
}
```

**Step 3: Add preload bridge**

In `electron/preload.ts`, inside the `skillManagement` object, add:

```typescript
createWithAgent: (params: {
  prompt: string;
  enabledBackends: string[];
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
  interactionMode?: string | null;
  modelPreference?: string | null;
  agentBackend?: string | null;
}) => ipcRenderer.invoke('skills:createWithAgent', params),
```

**Step 4: Add API type**

In `src/lib/api.ts`, inside the `skillManagement` object, add:

```typescript
createWithAgent: (params: {
  prompt: string;
  enabledBackends: AgentBackendType[];
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
  interactionMode?: InteractionMode | null;
  modelPreference?: string | null;
  agentBackend?: AgentBackendType | null;
}) => Promise<Task>;
```

And wire it:

```typescript
createWithAgent: (params) =>
  window.api.skillManagement.createWithAgent(params),
```

**Step 5: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add skills:createWithAgent IPC handler with workspace setup"
```

---

## Task 6: Add `skills:publishFromWorkspace` IPC handler

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

This handler moves skill files from a workspace to the canonical directory and creates backend symlinks.

**Step 1: Add the handler**

In `electron/ipc/handlers.ts`:

```typescript
import { readdir } from 'node:fs/promises';
import { cleanupSkillWorkspace } from '../services/system-project-service';
import {
  createSkill,
  getSkillContent,
  updateSkill,
} from '../services/skill-management-service';

ipcMain.handle(
  'skills:publishFromWorkspace',
  async (
    _event,
    data: {
      stepId: string;
      workspacePath: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
    },
  ) => {
    // Discover skill directories in workspace
    const entries = await readdir(data.workspacePath, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory());

    if (skillDirs.length === 0) {
      // Check if SKILL.md is directly in the workspace (improve mode)
      const directSkillMd = entries.find((e) => e.name === 'SKILL.md');
      if (!directSkillMd) {
        throw new Error(
          'No skill found in workspace. The agent may not have created a SKILL.md file.',
        );
      }
      // Workspace IS the skill directory (improve mode)
      skillDirs.push({
        name: '.',
        isDirectory: () => true,
      } as any);
    }

    const results: ManagedSkill[] = [];

    for (const dir of skillDirs) {
      const skillDir =
        dir.name === '.'
          ? data.workspacePath
          : path.join(data.workspacePath, dir.name);

      const content = await getSkillContent(skillDir);

      if (data.mode === 'improve' && data.sourceSkillPath) {
        // Update existing skill in-place
        const backendType = data.enabledBackends[0] ?? 'claude-code';
        const updated = await updateSkill({
          skillPath: data.sourceSkillPath,
          backendType,
          name: content.name,
          description: content.description,
          content: content.content,
        });
        results.push(updated);
      } else {
        // Create new skill
        const created = await createSkill({
          enabledBackends: data.enabledBackends,
          scope: 'user',
          name: content.name,
          description: content.description,
          content: content.content,
        });
        results.push(created);
      }
    }

    // Mark step meta as published
    await TaskStepRepository.update(data.stepId, {
      meta: JSON.stringify({
        ...((await TaskStepRepository.findById(data.stepId))?.meta ?? {}),
        published: true,
      }),
    });

    return results;
  },
);
```

**Step 2: Add preload bridge**

In `electron/preload.ts`:

```typescript
publishFromWorkspace: (params: {
  stepId: string;
  workspacePath: string;
  enabledBackends: string[];
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
}) => ipcRenderer.invoke('skills:publishFromWorkspace', params),
```

**Step 3: Add API type**

In `src/lib/api.ts`:

```typescript
publishFromWorkspace: (params: {
  stepId: string;
  workspacePath: string;
  enabledBackends: AgentBackendType[];
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
}) => Promise<ManagedSkill[]>;
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add skills:publishFromWorkspace handler to move workspace skills to canonical"
```

---

## Task 7: Add React hooks for agent-driven skill creation

**Files:**
- Modify: `src/hooks/use-managed-skills.ts`

**Step 1: Add `useCreateSkillWithAgent` mutation hook**

```typescript
export function useCreateSkillWithAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      prompt: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
      interactionMode?: InteractionMode | null;
      modelPreference?: string | null;
      agentBackend?: AgentBackendType | null;
    }) => api.skillManagement.createWithAgent(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function usePublishSkillFromWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      stepId: string;
      workspacePath: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
    }) => api.skillManagement.publishFromWorkspace(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managedSkills'] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/use-managed-skills.ts
git commit -m "feat: add useCreateSkillWithAgent and usePublishSkillFromWorkspace hooks"
```

---

## Task 8: Create "Create with Agent" dialog component

**Files:**
- Create: `src/features/settings/ui-skills-settings/create-with-agent-dialog.tsx`

This is a modal dialog with: prompt textarea, backend multi-select, mode/model selectors, and a submit button.

**Step 1: Create the component**

```tsx
// src/features/settings/ui-skills-settings/create-with-agent-dialog.tsx
import { Bot, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import { useCreateSkillWithAgent } from '@/hooks/use-managed-skills';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useNavigationStore } from '@/stores/navigation';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { InteractionMode } from '@shared/types';
import { useNavigate } from '@tanstack/react-router';

export function CreateWithAgentDialog({
  onClose,
  mode = 'create',
  sourceSkillPath,
  sourceSkillName,
}: {
  onClose: () => void;
  mode?: 'create' | 'improve';
  sourceSkillPath?: string;
  sourceSkillName?: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [enabledBackends, setEnabledBackends] = useState<AgentBackendType[]>([
    'claude-code',
  ]);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('plan');

  const createMutation = useCreateSkillWithAgent();
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const navigate = useNavigate();

  const canSubmit = prompt.trim().length > 0 && enabledBackends.length > 0;

  const toggleBackend = useCallback((backend: AgentBackendType) => {
    setEnabledBackends((prev) =>
      prev.includes(backend)
        ? prev.filter((b) => b !== backend)
        : [...prev, backend],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const jobId = addRunningJob({
      type: 'task-creation',
      title: mode === 'improve'
        ? `Improving skill: ${sourceSkillName ?? 'unknown'}`
        : 'Creating skill with agent',
      details: {
        projectName: 'Jean-Claude System',
        promptPreview: prompt.slice(0, 100),
        creationInput: null,
        backlogTodoId: null,
      },
    });

    onClose();

    try {
      const task = await createMutation.mutateAsync({
        prompt,
        enabledBackends,
        mode,
        sourceSkillPath,
        interactionMode,
      });

      markJobSucceeded(jobId, {
        taskId: task.id,
        projectId: task.projectId,
      });

      // Navigate to the task
      navigate({
        to: '/all/$taskId',
        params: { taskId: task.id },
      });
    } catch (err) {
      markJobFailed(
        jobId,
        err instanceof Error ? err.message : 'Failed to create skill task',
      );
    }
  }, [
    canSubmit,
    prompt,
    enabledBackends,
    mode,
    sourceSkillPath,
    interactionMode,
    addRunningJob,
    markJobSucceeded,
    markJobFailed,
    createMutation,
    navigate,
    onClose,
    sourceSkillName,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            <h2 className="text-base font-semibold text-neutral-200">
              {mode === 'improve' ? `Improve "${sourceSkillName}"` : 'Create Skill with Agent'}
            </h2>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Prompt */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              {mode === 'improve' ? 'What should be improved?' : 'Describe the skill you want'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === 'improve'
                  ? 'e.g. Add better examples, make the trigger more specific...'
                  : 'e.g. A skill that helps write database migrations with rollback support...'
              }
              className="h-28 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-purple-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Backend toggles */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Enable for backends
            </label>
            <div className="flex gap-2">
              {(['claude-code', 'opencode'] as AgentBackendType[]).map(
                (backend) => {
                  const isEnabled = enabledBackends.includes(backend);
                  const isClaude = backend === 'claude-code';
                  return (
                    <Button
                      key={backend}
                      type="button"
                      onClick={() => toggleBackend(backend)}
                      className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isEnabled
                          ? isClaude
                            ? 'bg-orange-900/30 text-orange-400 ring-1 ring-orange-700'
                            : 'bg-blue-900/30 text-blue-400 ring-1 ring-blue-700'
                          : 'bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700'
                      }`}
                    >
                      {isClaude ? 'Claude Code' : 'OpenCode'}
                    </Button>
                  );
                },
              )}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Interaction mode
            </label>
            <div className="flex gap-2">
              {(
                [
                  { value: 'plan', label: 'Plan' },
                  { value: 'auto', label: 'Auto' },
                  { value: 'ask', label: 'Ask' },
                ] as const
              ).map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() => setInteractionMode(value)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    interactionMode === value
                      ? 'bg-neutral-700 text-neutral-200 ring-1 ring-neutral-500'
                      : 'bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700'
                  }`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-neutral-800 px-5 py-3">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'improve' ? 'Start Improving' : 'Start Creating'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/create-with-agent-dialog.tsx
git commit -m "feat: add CreateWithAgentDialog component for skill creation/improvement"
```

---

## Task 9: Wire "Create with Agent" and "Improve" buttons into Skills Settings

**Files:**
- Modify: `src/features/settings/ui-skills-settings/index.tsx`
- Modify: `src/features/settings/ui-skills-settings/skill-details.tsx`

**Step 1: Add "Create with Agent" button to SkillsSettings header**

In `index.tsx`, add state and import:

```typescript
import { CreateWithAgentDialog } from './create-with-agent-dialog';

// Inside the component, add state:
const [agentDialog, setAgentDialog] = useState<{
  mode: 'create' | 'improve';
  sourceSkillPath?: string;
  sourceSkillName?: string;
} | null>(null);
```

Add a new button next to the existing "Add" button (around line 160):

```tsx
<Button
  type="button"
  onClick={() => setAgentDialog({ mode: 'create' })}
  className="flex cursor-pointer items-center gap-1 rounded-lg bg-purple-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-purple-600"
>
  <Bot className="h-4 w-4" />
  Create with Agent
</Button>
```

Add the dialog render at the bottom of the return (before closing `</div>`):

```tsx
{agentDialog && (
  <CreateWithAgentDialog
    mode={agentDialog.mode}
    sourceSkillPath={agentDialog.sourceSkillPath}
    sourceSkillName={agentDialog.sourceSkillName}
    onClose={() => setAgentDialog(null)}
  />
)}
```

**Step 2: Add "Improve with Agent" button to SkillDetails**

In `skill-details.tsx`, add a new prop and button. Add after the edit button (around line 57):

```tsx
// Add to props:
onImproveWithAgent?: (skillPath: string, skillName: string) => void;

// Add button after edit button:
{onImproveWithAgent && skill.editable && (
  <Button
    type="button"
    onClick={() => onImproveWithAgent(skill.skillPath, skill.name)}
    className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-purple-400"
    title="Improve with Agent"
  >
    <Bot className="h-4 w-4" />
  </Button>
)}
```

**Step 3: Wire the callback in `index.tsx`**

Pass `onImproveWithAgent` to SkillDetails:

```tsx
<SkillDetails
  skill={selectedSkill}
  onClose={handleClose}
  onEdit={
    selectedSkill.editable
      ? () => setEditingPath(selectedSkill.skillPath)
      : undefined
  }
  onToggleEnabled={handleToggleEnabled}
  onDelete={handleDelete}
  onImproveWithAgent={(skillPath, skillName) =>
    setAgentDialog({
      mode: 'improve',
      sourceSkillPath: skillPath,
      sourceSkillName: skillName,
    })
  }
/>
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/settings/ui-skills-settings/index.tsx src/features/settings/ui-skills-settings/skill-details.tsx
git commit -m "feat: add 'Create with Agent' and 'Improve with Agent' buttons to skills settings"
```

---

## Task 10: Add "Publish Skill" action to task panel for skill-creation steps

**Files:**
- Create: `src/features/task/ui-skill-publish-action/index.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx`

This component renders a "Publish Skill" button in the task panel when the active step is a `skill-creation` step that has completed but hasn't been published yet.

**Step 1: Create the publish action component**

```tsx
// src/features/task/ui-skill-publish-action/index.tsx
import { Check, Package, RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { usePublishSkillFromWorkspace } from '@/hooks/use-managed-skills';
import { useAddToast } from '@/stores/toasts';
import type { TaskStep } from '@shared/types';
import type { SkillCreationStepMeta } from '@shared/types';

export function SkillPublishAction({ step }: { step: TaskStep }) {
  const meta = step.meta as SkillCreationStepMeta;
  const publishMutation = usePublishSkillFromWorkspace();
  const addToast = useAddToast();
  const [published, setPublished] = useState(meta.published ?? false);

  const canPublish = useMemo(
    () => step.status === 'completed' && !published,
    [step.status, published],
  );

  const handlePublish = useCallback(async () => {
    try {
      const skills = await publishMutation.mutateAsync({
        stepId: step.id,
        workspacePath: meta.workspacePath,
        enabledBackends: meta.enabledBackends,
        mode: meta.mode,
        sourceSkillPath: meta.sourceSkillPath,
      });

      setPublished(true);

      const names = skills.map((s) => s.name).join(', ');
      addToast({
        type: 'success',
        message: meta.mode === 'improve'
          ? `Skill "${names}" updated successfully`
          : `Skill "${names}" published successfully`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish skill',
      });
    }
  }, [publishMutation, step.id, meta, addToast]);

  if (step.type !== 'skill-creation') return null;

  return (
    <div className="flex items-center gap-2 border-t border-neutral-800 px-4 py-3">
      {published ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Check className="h-4 w-4" />
          <span>
            Skill {meta.mode === 'improve' ? 'updated' : 'published'}
          </span>
        </div>
      ) : (
        <>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {meta.mode === 'improve' ? 'Publish Changes' : 'Publish Skill'}
          </Button>
          {step.status === 'completed' && (
            <span className="text-xs text-neutral-500">
              Review the agent&apos;s work above, then publish when ready.
            </span>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 2: Integrate into task panel**

In `src/features/task/ui-task-panel/index.tsx`, import and render the component.

Find where the message input / footer area is rendered. Add the publish action above the message input when the active step is a skill-creation step:

```tsx
import { SkillPublishAction } from '@/features/task/ui-skill-publish-action';

// In the render, before the message input footer:
{activeStep?.type === 'skill-creation' && (
  <SkillPublishAction step={activeStep} />
)}
```

The exact placement depends on the task panel's layout — it should appear between the message stream and the message input, visible when the step completes.

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/features/task/ui-skill-publish-action/index.tsx src/features/task/ui-task-panel/index.tsx
git commit -m "feat: add SkillPublishAction component for publishing skills from task panel"
```

---

## Task 11: Clean up workspace on task deletion

**Files:**
- Modify: `electron/ipc/handlers.ts` (the `tasks:delete` handler)

**Step 1: Add workspace cleanup to task deletion**

Find the existing `tasks:delete` handler. Add cleanup logic for skill-creation tasks:

```typescript
// Inside the tasks:delete handler, before deleting the task:
const steps = await TaskStepRepository.findByTaskId(taskId);
for (const step of steps) {
  if (step.type === 'skill-creation' && step.meta) {
    const meta = step.meta as SkillCreationStepMeta;
    if (meta.workspacePath) {
      await cleanupSkillWorkspace(meta.workspacePath).catch((err) => {
        dbg.ipc('Failed to cleanup skill workspace %s: %O', meta.workspacePath, err);
      });
    }
  }
}
```

Also add cleanup after publish succeeds (in the `skills:publishFromWorkspace` handler, after the `published: true` update):

```typescript
// Cleanup workspace after successful publish
await cleanupSkillWorkspace(data.workspacePath).catch(() => {
  // Non-critical — workspace can be cleaned up on task deletion
});
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: clean up skill workspace on task deletion and after publish"
```

---

## Task 12: Override CWD for system project tasks

**Files:**
- Modify: `electron/services/agent-service.ts:351`

**Step 1: Handle skill-creation step CWD**

The current logic is `const workingDir = task.worktreePath ?? project.path;`. For skill-creation steps, we want CWD to be the workspace path instead:

Around line 351 in `agent-service.ts`, in the `runBackend` method:

```typescript
// Before
const workingDir = task.worktreePath ?? project.path;

// After
let workingDir = task.worktreePath ?? project.path;

// For skill-creation steps, use the workspace path as CWD
if (step?.type === 'skill-creation' && step.meta) {
  const skillMeta = step.meta as SkillCreationStepMeta;
  if (skillMeta.workspacePath) {
    workingDir = skillMeta.workspacePath;
  }
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat: use workspace path as CWD for skill-creation agent steps"
```

---

## Task 13: Final integration test and lint

**Step 1: Install dependencies**

Run: `pnpm install`

**Step 2: Lint and fix**

Run: `pnpm lint --fix`

**Step 3: Type check**

Run: `pnpm ts-check`

**Step 4: Fix any remaining issues**

Address lint/type errors if any.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: fix lint and type issues from agent-driven skill creation feature"
```

---

## Summary of Changes

| Layer | Files | Purpose |
|-------|-------|---------|
| **Types** | `shared/types.ts` | `ProjectType: 'system'`, `SkillCreationStepMeta`, `TaskStepType: 'skill-creation'` |
| **Service** | `electron/services/system-project-service.ts` | System project lazy creation, workspace management |
| **Repository** | `electron/database/repositories/projects.ts` | `findByType()`, filter system from `findAll()` |
| **IPC** | `electron/ipc/handlers.ts` | `skills:createWithAgent`, `skills:publishFromWorkspace` handlers |
| **Bridge** | `electron/preload.ts`, `src/lib/api.ts` | Expose new IPC methods to renderer |
| **Agent** | `electron/services/agent-service.ts` | Workspace CWD override for skill-creation steps |
| **Hooks** | `src/hooks/use-managed-skills.ts` | `useCreateSkillWithAgent()`, `usePublishSkillFromWorkspace()` |
| **UI** | `src/features/settings/ui-skills-settings/` | "Create with Agent" button, dialog, "Improve" action on skill cards |
| **UI** | `src/features/task/ui-skill-publish-action/` | "Publish Skill" action in task panel |
