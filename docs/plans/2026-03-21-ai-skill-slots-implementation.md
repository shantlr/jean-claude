# AI Skill Slots & Merge Commit Message Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable "AI skill slot" system (backend + model + skill config), with merge commit message auto-generation as the first consumer.

**Architecture:** New `aiSkillSlots` app setting + per-project `aiSkillSlots` JSON column. A thin `ai-generation-service.ts` abstracts `generateText()` across backends. The merge dialog resolves the slot config and auto-generates the commit message on open. Settings UI uses inline-expandable rows for configuring slots.

**Tech Stack:** Claude Agent SDK (`query()`), OpenCode SDK, Kysely migrations, React Query hooks, Zustand patterns, TanStack Router

---

### Task 1: Add `AiSkillSlotsSetting` Type & Validator

**Files:**
- Modify: `shared/types.ts:503-615`

**Step 1: Add the types and setting definition**

In `shared/types.ts`, after the `SummaryModelsSetting` interface (line 505), add:

```typescript
export interface AiSkillSlotConfig {
  backend: AgentBackendType;
  model: string;
  skillName: string | null; // null = built-in default prompt
}

export type AiSkillSlotsSetting = Record<string, AiSkillSlotConfig>;
```

After `isSummaryModelsSetting` (line 573), add the validator:

```typescript
function isAiSkillSlotsSetting(v: unknown): v is AiSkillSlotsSetting {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return Object.values(obj).every((slot) => {
    if (!slot || typeof slot !== 'object') return false;
    const s = slot as Record<string, unknown>;
    if (typeof s.backend !== 'string') return false;
    if (!VALID_BACKENDS.includes(s.backend as AgentBackendType)) return false;
    if (typeof s.model !== 'string') return false;
    if (s.skillName !== null && typeof s.skillName !== 'string') return false;
    return true;
  });
}
```

In `SETTINGS_DEFINITIONS` (after the `summaryModels` entry, around line 610), add:

```typescript
aiSkillSlots: {
  defaultValue: {} as AiSkillSlotsSetting,
  validate: isAiSkillSlotsSetting,
},
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(settings): add AiSkillSlotsSetting type and validator"
```

---

### Task 2: Add Convenience Hooks for AI Skill Slots Setting

**Files:**
- Modify: `src/hooks/use-settings.ts`

**Step 1: Add the hooks**

At the end of `src/hooks/use-settings.ts`, add:

```typescript
// Convenience hooks for AI skill slots setting
export function useAiSkillSlotsSetting() {
  return useSetting('aiSkillSlots');
}

export function useUpdateAiSkillSlotsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: AiSkillSlotsSetting) =>
      api.settings.set('aiSkillSlots', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'aiSkillSlots'],
      });
    },
  });
}
```

Add `AiSkillSlotsSetting` to the import from `@shared/types`.

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/hooks/use-settings.ts
git commit -m "feat(hooks): add useAiSkillSlotsSetting convenience hooks"
```

---

### Task 3: Add `aiSkillSlots` Column to Projects

**Files:**
- Modify: `shared/types.ts:166-245` (Project, NewProject, UpdateProject interfaces)
- Modify: `electron/database/schema.ts:70-99` (ProjectTable)
- Create: `electron/database/migrations/046_project_ai_skill_slots.ts`
- Modify: `electron/database/migrator.ts`

**Step 1: Add field to shared types**

In `shared/types.ts`, in the `Project` interface (after `completionContext`, line 188):

```typescript
aiSkillSlots: AiSkillSlotsSetting | null; // null = use global setting
```

In `NewProject` (after `completionContext`, line 215):

```typescript
aiSkillSlots?: AiSkillSlotsSetting | null;
```

In `UpdateProject` (after `completionContext`, line 242):

```typescript
aiSkillSlots?: AiSkillSlotsSetting | null;
```

**Step 2: Add column to database schema**

In `electron/database/schema.ts`, in `ProjectTable` (after `completionContext`, line 93):

```typescript
aiSkillSlots: string | null; // JSON text
```

**Step 3: Create migration**

Create `electron/database/migrations/046_project_ai_skill_slots.ts`:

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('aiSkillSlots', 'text', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('aiSkillSlots').execute();
}
```

**Step 4: Register migration in migrator**

In `electron/database/migrator.ts`, add the import and entry:

```typescript
import * as m046 from './migrations/046_project_ai_skill_slots';

// In the migrations record:
'046_project_ai_skill_slots': m046,
```

**Step 5: Update project repository for JSON serialization**

In `electron/database/repositories/projects.ts`, the `create` and `update` methods spread `...rest` directly into the query. Since `aiSkillSlots` is stored as JSON text in the DB but as an object in the TypeScript type, we need to handle serialization.

In the `create` method, after the `showPrsInFeed` destructuring (line 26):

```typescript
const { showWorkItemsInFeed, showPrsInFeed, aiSkillSlots, ...rest } = data;
```

And in the `.values()` call, add:

```typescript
aiSkillSlots: aiSkillSlots ? JSON.stringify(aiSkillSlots) : null,
```

In the `update` method, after the `showPrsInFeed` destructuring (line 44):

```typescript
const { showWorkItemsInFeed, showPrsInFeed, aiSkillSlots, ...rest } = data;
```

And in the `.set()` call, add:

```typescript
...(aiSkillSlots !== undefined && {
  aiSkillSlots: aiSkillSlots ? JSON.stringify(aiSkillSlots) : null,
}),
```

The `findAll` and `findById` methods use `selectAll()` which returns the raw DB row. The `ProjectTable.aiSkillSlots` is `string | null` but `Project.aiSkillSlots` is `AiSkillSlotsSetting | null`. We need to handle deserialization.

Check if there's an existing mapping layer in the IPC handler. In `electron/ipc/handlers.ts`, the `projects:findById` handler (line 223) returns `ProjectRepository.findById(id)` directly. This means the row goes straight to the renderer.

The simplest approach: add a `mapRow` helper in the repository that parses JSON fields:

```typescript
function mapRow(row: ProjectRow): ProjectRow & { aiSkillSlots: AiSkillSlotsSetting | null } {
  return {
    ...row,
    aiSkillSlots: row.aiSkillSlots ? JSON.parse(row.aiSkillSlots) : null,
  };
}
```

But actually, since `selectAll()` returns `ProjectRow` where `aiSkillSlots` is `string | null`, and the type flowing to the renderer expects an object — we need to parse it. However, looking at other JSON fields like `workItemIds` on tasks, they are also stored as strings and parsed on the renderer side. Check how `workItemIds` is handled.

Actually, looking more carefully at the codebase: the `ProjectTable` type has `defaultAgentBackend: string | null` while `Project` has `defaultAgentBackend: AgentBackendType | null`. The schema re-exports `Project` from shared types but Kysely uses `ProjectTable` for queries. The `selectAll()` result is typed as `ProjectRow` (i.e., `Selectable<ProjectTable>`), not `Project`. The IPC handler passes this directly to the renderer.

So the renderer receives `ProjectRow` which has `aiSkillSlots: string | null`. But `useProject()` types the result as `Project` which expects `aiSkillSlots: AiSkillSlotsSetting | null`.

The cleanest fix: parse in the IPC handlers for `projects:findAll` and `projects:findById`, OR parse in the repository. Looking at the existing code, there's no parsing layer — string types are just cast. So let's add parsing in the repository.

Update `findAll`:

```typescript
findAll: async () => {
  const rows = await db.selectFrom('projects').selectAll().orderBy('sortOrder', 'asc').execute();
  return rows.map(parseProjectRow);
},

findById: async (id: string) => {
  const row = await db.selectFrom('projects').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? parseProjectRow(row) : undefined;
},
```

Where `parseProjectRow` is:

```typescript
import type { ProjectRow } from '../schema';

function parseProjectRow(row: ProjectRow) {
  return {
    ...row,
    aiSkillSlots: row.aiSkillSlots ? JSON.parse(row.aiSkillSlots) : null,
  };
}
```

Also update the `create` and `update` return values (they use `returningAll()`):

```typescript
// In create, after .executeTakeFirstOrThrow():
return parseProjectRow(row);

// In update, after .executeTakeFirstOrThrow():
// Wrap in async if not already, and parse
```

And `reorder`:

```typescript
const rows = await db.selectFrom('projects').selectAll().orderBy('sortOrder', 'asc').execute();
return rows.map(parseProjectRow);
```

**Step 6: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 7: Commit**

```bash
git add shared/types.ts electron/database/schema.ts electron/database/migrations/046_project_ai_skill_slots.ts electron/database/migrator.ts electron/database/repositories/projects.ts
git commit -m "feat(db): add aiSkillSlots column to projects table"
```

---

### Task 4: Create `ai-generation-service.ts`

**Files:**
- Create: `electron/services/ai-generation-service.ts`

**Step 1: Create the service**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

import type { AgentBackendType } from '@shared/agent-backend-types';

import { dbg } from '../lib/debug';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thin abstraction for simple text generation across agent backends.
 * No tools, no session persistence — just prompt in, structured output out.
 */
export async function generateText({
  backend,
  model,
  prompt,
  skillName,
  outputSchema,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  backend: AgentBackendType;
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<unknown | null> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    switch (backend) {
      case 'claude-code':
        return await generateWithClaudeCode({
          model,
          prompt,
          skillName,
          outputSchema,
          abortController,
        });

      case 'opencode':
        // TODO: Implement OpenCode generation
        dbg.agent('OpenCode generation not yet implemented, returning null');
        return null;

      default: {
        const _exhaustive: never = backend;
        dbg.agent('Unknown backend: %s', _exhaustive);
        return null;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      dbg.agent('generateText timed out after %dms', timeoutMs);
      return null;
    }
    dbg.agent('generateText failed: %O', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithClaudeCode({
  model,
  prompt,
  skillName,
  outputSchema,
  abortController,
}: {
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  abortController: AbortController;
}): Promise<unknown | null> {
  const effectivePrompt = skillName
    ? `Use the "${skillName}" skill to help with this task.\n\n${prompt}`
    : prompt;

  const generator = query({
    prompt: effectivePrompt,
    options: {
      allowedTools: [],
      model,
      abortController,
      ...(outputSchema && {
        outputFormat: {
          type: 'json_schema' as const,
          schema: outputSchema,
        },
      }),
      persistSession: false,
    },
  });

  for await (const message of generator) {
    const msg = message as {
      type: string;
      structured_output?: unknown;
      result?: string;
    };

    if (msg.type === 'result') {
      if (outputSchema && msg.structured_output) {
        return msg.structured_output;
      }
      return msg.result ?? null;
    }
  }

  return null;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add electron/services/ai-generation-service.ts
git commit -m "feat(services): create ai-generation-service with backend abstraction"
```

---

### Task 5: Create Merge Message Generation Service

**Files:**
- Create: `electron/services/merge-message-generation-service.ts`

**Step 1: Create the service**

```typescript
import type { AgentBackendType } from '@shared/agent-backend-types';

import { dbg } from '../lib/debug';

import { generateText } from './ai-generation-service';

const MERGE_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Single-line commit title (max 72 chars), conventional commit format',
    },
    body: {
      type: 'string',
      description: 'Multi-line commit body with concise bullet points',
    },
  },
  required: ['title', 'body'],
} as const;

const DEFAULT_PROMPT_TEMPLATE = `Generate a conventional commit message for squash-merging branch "{branchName}" into "{targetBranch}".

## Commit History
{commitLog}

## Changed Files
{changedFiles}

## Instructions
- Title: max 72 characters, conventional commit format (feat:, fix:, refactor:, chore:, etc.)
- Body: concise bullet points summarizing the key changes. Don't list every file.
- Focus on WHAT changed and WHY, not HOW.
- Be concise.`;

export async function generateMergeCommitMessage({
  branchName,
  targetBranch,
  commitLog,
  changedFiles,
  backend,
  model,
  skillName,
}: {
  branchName: string;
  targetBranch: string;
  commitLog: string;
  changedFiles: string[];
  backend: AgentBackendType;
  model: string;
  skillName?: string | null;
}): Promise<{ title: string; body: string } | null> {
  const prompt = DEFAULT_PROMPT_TEMPLATE
    .replace('{branchName}', branchName)
    .replace('{targetBranch}', targetBranch)
    .replace('{commitLog}', commitLog || '(no commits)')
    .replace('{changedFiles}', changedFiles.join('\n') || '(no files)');

  dbg.agent(
    'Generating merge commit message for %s → %s (%d files)',
    branchName,
    targetBranch,
    changedFiles.length,
  );

  const result = await generateText({
    backend,
    model,
    prompt,
    skillName,
    outputSchema: MERGE_MESSAGE_SCHEMA,
  });

  if (result && typeof result === 'object' && 'title' in result && 'body' in result) {
    const typed = result as { title: string; body: string };
    return {
      title: typed.title.slice(0, 72),
      body: typed.body,
    };
  }

  return null;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add electron/services/merge-message-generation-service.ts
git commit -m "feat(services): create merge-message-generation-service"
```

---

### Task 6: Add Git Log Retrieval to Worktree Service

**Files:**
- Modify: `electron/services/worktree-service.ts`

**Step 1: Add the function**

At the end of the file (or near the other exported utility functions), add:

```typescript
/**
 * Returns the git log (one-line format) for commits since startCommitHash.
 */
export async function getWorktreeCommitLog(
  worktreePath: string,
  startCommitHash: string,
): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git log --oneline ${startCommitHash}..HEAD`,
      { cwd: worktreePath, encoding: 'utf-8' },
    );
    return stdout.trim();
  } catch {
    return '';
  }
}
```

Verify that `execAsync` is already imported in the file (it should be — it's used extensively).

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "feat(worktree): add getWorktreeCommitLog function"
```

---

### Task 7: Add Slot Resolution Helper

**Files:**
- Create: `electron/services/ai-skill-slot-resolver.ts`

**Step 1: Create the resolver**

This small module resolves a slot config from project + global settings:

```typescript
import type { AiSkillSlotConfig, AiSkillSlotsSetting } from '@shared/types';

import { SettingsRepository } from '../database/repositories/settings';

/**
 * Resolves an AI skill slot configuration.
 *
 * Resolution order:
 * 1. Project-level override (if provided)
 * 2. Global setting
 * 3. undefined (feature disabled)
 */
export async function resolveAiSkillSlot(
  slotKey: string,
  projectSlots: AiSkillSlotsSetting | null | undefined,
): Promise<AiSkillSlotConfig | undefined> {
  // 1. Check project override
  if (projectSlots?.[slotKey]) {
    return projectSlots[slotKey];
  }

  // 2. Check global setting
  const globalSlots = await SettingsRepository.get('aiSkillSlots');
  if (globalSlots[slotKey]) {
    return globalSlots[slotKey];
  }

  // 3. Not configured
  return undefined;
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add electron/services/ai-skill-slot-resolver.ts
git commit -m "feat(services): create AI skill slot resolver"
```

---

### Task 8: Add IPC Handler, API Type, and Preload Bridge

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `src/lib/api.ts`
- Modify: `electron/preload.ts`

**Step 1: Add the IPC handler**

In `electron/ipc/handlers.ts`, after the existing `tasks:worktree:delete` handler (around line 1540), add:

```typescript
ipcMain.handle(
  'tasks:worktree:generateMergeMessage',
  async (_, taskId: string, params: { targetBranch: string }) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath || !task?.startCommitHash) {
      return null;
    }

    const project = await ProjectRepository.findById(task.projectId);

    // Resolve the merge-commit-message slot
    const slotConfig = await resolveAiSkillSlot(
      'merge-commit-message',
      project?.aiSkillSlots ?? null,
    );

    if (!slotConfig) {
      return null; // Not configured → feature disabled
    }

    // Get commit log
    const commitLog = await getWorktreeCommitLog(
      task.worktreePath,
      task.startCommitHash,
    );

    // Get changed file list
    const diff = await getWorktreeDiff(
      task.worktreePath,
      task.startCommitHash,
      task.sourceBranch,
    );
    const changedFiles = diff.files.map(
      (f) => `${f.status}: ${f.path}`,
    );

    return generateMergeCommitMessage({
      branchName: task.branchName ?? 'unknown',
      targetBranch: params.targetBranch,
      commitLog,
      changedFiles,
      backend: slotConfig.backend,
      model: slotConfig.model,
      skillName: slotConfig.skillName,
    });
  },
);
```

Add the necessary imports at the top of `handlers.ts`:

```typescript
import { resolveAiSkillSlot } from '../services/ai-skill-slot-resolver';
import { generateMergeCommitMessage } from '../services/merge-message-generation-service';
import { getWorktreeCommitLog } from '../services/worktree-service';
```

Note: `getWorktreeDiff` should already be imported. Check and add if needed.

**Step 2: Add to API types**

In `src/lib/api.ts`, in the `worktree` section of the tasks API type (after `delete`, around line 417), add:

```typescript
generateMergeMessage: (
  taskId: string,
  params: { targetBranch: string },
) => Promise<{ title: string; body: string } | null>;
```

Also add to the fallback `worktree` object (around line 999):

```typescript
generateMergeMessage: async () => null,
```

**Step 3: Add to preload bridge**

In `electron/preload.ts`, in the `worktree` section (after the `delete` entry, around line 134), add:

```typescript
generateMergeMessage: (taskId: string, params: { targetBranch: string }) =>
  ipcRenderer.invoke('tasks:worktree:generateMergeMessage', taskId, params),
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts src/lib/api.ts electron/preload.ts
git commit -m "feat(ipc): add tasks:worktree:generateMergeMessage handler"
```

---

### Task 9: Add React Hook for Merge Message Generation

**Files:**
- Modify: `src/hooks/use-worktree-diff.ts`

**Step 1: Add the mutation hook**

At the end of `src/hooks/use-worktree-diff.ts`, add:

```typescript
export function useGenerateMergeMessage() {
  return useMutation({
    mutationFn: (params: { taskId: string; targetBranch: string }) =>
      api.tasks.worktree.generateMergeMessage(params.taskId, {
        targetBranch: params.targetBranch,
      }),
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 3: Commit**

```bash
git add src/hooks/use-worktree-diff.ts
git commit -m "feat(hooks): add useGenerateMergeMessage mutation hook"
```

---

### Task 10: Integrate into Merge Confirm Dialog

**Files:**
- Modify: `src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx`

**Step 1: Add auto-generation on dialog open**

Import the new hook:

```typescript
import { useGenerateMergeMessage } from '@/hooks/use-worktree-diff';
```

`Loader2` should already be imported.

Inside the component, add the mutation hook and a `userEdited` state:

```typescript
const generateMergeMessage = useGenerateMergeMessage();
const [userEdited, setUserEdited] = useState(false);
```

Replace the existing reset `useEffect` (lines 55-64) with one that also triggers generation:

```typescript
// Reset state and auto-generate commit message when dialog opens
useEffect(() => {
  if (isOpen) {
    setSquash(true);
    setCommitMessage(defaultCommitMessage ?? '');
    setCommitAllUnstaged(hasUnstagedChanges);
    setSubmitError(null);
    setHasConflicts(false);
    setCheckError(null);
    setUserEdited(false);

    // Auto-generate commit message
    generateMergeMessage.mutate(
      { taskId, targetBranch },
      {
        onSuccess: (result) => {
          if (result) {
            // Only set if user hasn't started editing
            setCommitMessage((current) => {
              // If user has edited, don't overwrite
              if (current !== (defaultCommitMessage ?? '')) return current;
              return `${result.title}\n\n${result.body}`;
            });
          }
        },
      },
    );
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen]);
```

Note: We intentionally keep `[isOpen]` as the only dependency to avoid re-triggering on every prop change. The eslint-disable comment handles the exhaustive-deps warning.

**Step 2: Update textarea onChange to track user edits**

Find the textarea `onChange` (line 251) and add `setUserEdited(true)`:

```typescript
onChange={(e) => {
  setCommitMessage(e.target.value);
  setUserEdited(true);
}}
```

**Step 3: Add loading indicator on the label**

Replace the commit message label (line 245-247):

```tsx
<label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-neutral-400">
  Commit message
  {generateMergeMessage.isPending && (
    <span className="flex items-center gap-1 text-blue-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      Generating...
    </span>
  )}
</label>
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```bash
git add src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx
git commit -m "feat(merge): auto-generate commit message on dialog open"
```

---

### Task 11: Add AI Generation Section in Global Settings

**Files:**
- Create: `src/features/settings/ui-ai-generation-settings/index.tsx`
- Modify: `src/features/settings/ui-general-settings/index.tsx`

**Step 1: Create the AI Generation Settings component**

Create `src/features/settings/ui-ai-generation-settings/index.tsx`:

```typescript
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Select } from '@/common/ui/select';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useManagedSkills } from '@/hooks/use-skills';
import {
  useAiSkillSlotsSetting,
  useUpdateAiSkillSlotsSetting,
  useBackendsSetting,
} from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AiSkillSlotConfig } from '@shared/types';

const SLOT_DEFINITIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'merge-commit-message',
    label: 'Merge Commit Message',
    description: 'Auto-generate commit messages when squash-merging worktrees',
  },
];

export function AiGenerationSettings() {
  const { data: slots } = useAiSkillSlotsSetting();
  const updateSlots = useUpdateAiSkillSlotsSetting();
  const { data: backendsSetting } = useBackendsSetting();

  const enabledBackends = useMemo(
    () =>
      AVAILABLE_BACKENDS.filter((b) =>
        (backendsSetting?.enabledBackends ?? ['claude-code']).includes(b.value),
      ),
    [backendsSetting],
  );

  const handleUpdate = useCallback(
    (slotKey: string, config: AiSkillSlotConfig | null) => {
      const current = slots ?? {};
      if (config === null) {
        const { [slotKey]: _, ...rest } = current;
        updateSlots.mutate(rest);
      } else {
        updateSlots.mutate({ ...current, [slotKey]: config });
      }
    },
    [slots, updateSlots],
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">AI Generation</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Configure AI-powered generation features. Each slot uses a backend,
        model, and optional skill to generate content. Slots that are not
        configured are disabled.
      </p>

      <div className="mt-4 space-y-2">
        {SLOT_DEFINITIONS.map((slot) => (
          <SlotRow
            key={slot.key}
            slotKey={slot.key}
            label={slot.label}
            description={slot.description}
            config={slots?.[slot.key] ?? null}
            enabledBackends={enabledBackends}
            onUpdate={(config) => handleUpdate(slot.key, config)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slotKey,
  label,
  description,
  config,
  enabledBackends,
  onUpdate,
}: {
  slotKey: string;
  label: string;
  description: string;
  config: AiSkillSlotConfig | null;
  enabledBackends: { value: AgentBackendType; label: string }[];
  onUpdate: (config: AiSkillSlotConfig | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localBackend, setLocalBackend] = useState<AgentBackendType>(
    config?.backend ?? enabledBackends[0]?.value ?? 'claude-code',
  );
  const [localModel, setLocalModel] = useState(config?.model ?? 'haiku');
  const [localSkillName, setLocalSkillName] = useState<string | null>(
    config?.skillName ?? null,
  );

  const { data: dynamicModels } = useBackendModels(localBackend);
  const { data: skills } = useManagedSkills(localBackend);

  const handleSave = () => {
    onUpdate({
      backend: localBackend,
      model: localModel,
      skillName: localSkillName,
    });
    setExpanded(false);
  };

  const handleRemove = () => {
    onUpdate(null);
    setExpanded(false);
  };

  const handleBackendChange = (value: string) => {
    const backend = value as AgentBackendType;
    setLocalBackend(backend);
    setLocalModel('haiku');
    setLocalSkillName(null);
  };

  const enabledSkills = useMemo(
    () => (skills ?? []).filter((s) => s.enabledBackends?.[localBackend]),
    [skills, localBackend],
  );

  const skillOptions = useMemo(
    () => [
      { value: '', label: 'None (built-in default)' },
      ...enabledSkills.map((s) => ({ value: s.name, label: s.name })),
    ],
    [enabledSkills],
  );

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3"
      >
        <div className="text-left">
          <div className="text-sm font-medium text-neutral-200">{label}</div>
          <div className="text-xs text-neutral-500">
            {config
              ? `${config.backend} · ${config.model}${config.skillName ? ` · ${config.skillName}` : ''}`
              : 'Not configured'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!config && (
            <span className="text-xs text-neutral-600">Disabled</span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-700 px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-neutral-500">{description}</p>

          <div className="space-y-3">
            {/* Backend */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Backend
              </label>
              <Select
                value={localBackend}
                options={enabledBackends.map((b) => ({
                  value: b.value,
                  label: b.label,
                }))}
                onChange={handleBackendChange}
                className="w-full justify-between"
              />
            </div>

            {/* Model */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Model
              </label>
              <ModelSelector
                value={localModel}
                onChange={setLocalModel}
                models={getModelsForBackend(localBackend, dynamicModels)}
              />
            </div>

            {/* Skill */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Skill
              </label>
              <Select
                value={localSkillName ?? ''}
                options={skillOptions}
                onChange={(v) => setLocalSkillName(v || null)}
                className="w-full justify-between"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            {config && (
              <button
                type="button"
                onClick={handleRemove}
                className="flex cursor-pointer items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add to General Settings**

In `src/features/settings/ui-general-settings/index.tsx`, add import:

```typescript
import { AiGenerationSettings } from '@/features/settings/ui-ai-generation-settings';
```

In the `GeneralSettings` component, after the `SummaryModelsSettings` section and its divider (around line 168), add:

```tsx
{/* Divider */}
<div className="my-8 border-t border-neutral-800" />

{/* AI Generation */}
<AiGenerationSettings />
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 4: Commit**

```bash
git add src/features/settings/ui-ai-generation-settings/index.tsx src/features/settings/ui-general-settings/index.tsx
git commit -m "feat(settings): add AI Generation settings section with slot configuration"
```

---

### Task 12: Add Per-Project AI Skill Slots Override in Project Settings

**Files:**
- Modify: `src/features/project/ui-project-settings/index.tsx`

**Step 1: Add local state for aiSkillSlots**

In the `ProjectSettings` component, alongside other state declarations (around line 69):

```typescript
const [aiSkillSlots, setAiSkillSlots] = useState<AiSkillSlotsSetting | null>(null);
```

Add import for `AiSkillSlotsSetting` from `@shared/types`.

**Step 2: Sync from project data**

In the `useEffect` that syncs from `project` (line 84-95), add:

```typescript
setAiSkillSlots(project.aiSkillSlots);
```

**Step 3: Include in save handler**

In `handleSave` (line 130-144), add `aiSkillSlots` to the update data:

```typescript
aiSkillSlots,
```

**Step 4: Include in hasChanges check**

In the `hasChanges` calculation (line 174-182), add:

```typescript
JSON.stringify(aiSkillSlots) !== JSON.stringify(project.aiSkillSlots ?? null)
```

**Step 5: Add a new menu item for AI Generation**

In the `ProjectSettingsMenuItem` type (line 27), add `'ai-generation'` to the union.

Add a case in the `switch` statement for the new menu item:

```typescript
case 'ai-generation':
  content = <ProjectAiGenerationSettings aiSkillSlots={aiSkillSlots} onUpdate={setAiSkillSlots} />;
  break;
```

Create a `ProjectAiGenerationSettings` component (either inline in the file or as a separate file). This is a slimmer version of the global `AiGenerationSettings` that adds a "Use global default" option per slot:

The key differences from the global version:
- Each slot has a "Use global default" toggle/option. When enabled, the slot key is removed from the project overrides.
- The local state is managed by the parent (`aiSkillSlots` state passed as prop) rather than a global setting.

**Step 6: Add the menu item to the sidebar menu**

Find where the menu items are rendered (look for the existing items like 'details', 'autocomplete', etc.) and add:

```typescript
{ key: 'ai-generation', label: 'AI Generation' },
```

**Step 7: Update the `assertNever` function**

Make sure the `assertNever` and switch-case handle the new `'ai-generation'` case.

**Step 8: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 9: Commit**

```bash
git add src/features/project/ui-project-settings/index.tsx
git commit -m "feat(project-settings): add per-project AI skill slot overrides"
```

---

### Task 13: Add `useManagedSkills` Hook Import (if missing)

**Files:**
- Check: `src/hooks/use-skills.ts`

**Step 1: Verify useManagedSkills exists**

Check that `useManagedSkills` hook exists and accepts a backend type parameter. The AI generation settings component uses it to populate the skill selector dropdown.

If it doesn't exist with the right signature, add or adjust it. Looking at the AGENTS.md, the hooks listed are `useManagedSkills()`, `useAllManagedSkills()`, etc.

Run: `pnpm ts-check`

If there are errors related to `useManagedSkills`, fix the import/signature.

---

### Task 14: Final Lint and Type Check

**Step 1:** Run `pnpm install`

**Step 2:** Run `pnpm lint --fix`

**Step 3:** Run `pnpm ts-check`

**Step 4:** Run `pnpm lint`

**Step 5:** Fix any remaining issues

**Step 6: Final commit if there are lint fixes**

```bash
git add -A
git commit -m "chore: fix lint errors from AI skill slots implementation"
```

---

## Summary of All Changes

| Area | Files | What |
|------|-------|------|
| Types | `shared/types.ts` | `AiSkillSlotConfig`, `AiSkillSlotsSetting`, validator, `SETTINGS_DEFINITIONS` entry, `aiSkillSlots` on `Project`/`NewProject`/`UpdateProject` |
| DB Schema | `electron/database/schema.ts` | `aiSkillSlots` column on `ProjectTable` |
| Migration | `electron/database/migrations/046_*.ts` | Add `aiSkillSlots` column |
| Migrator | `electron/database/migrator.ts` | Register migration |
| Repository | `electron/database/repositories/projects.ts` | JSON serialize/deserialize for `aiSkillSlots` |
| Service | `electron/services/ai-generation-service.ts` | `generateText()` backend abstraction |
| Service | `electron/services/merge-message-generation-service.ts` | Merge-specific prompt + structured output |
| Service | `electron/services/ai-skill-slot-resolver.ts` | Slot resolution (project → global → undefined) |
| Worktree | `electron/services/worktree-service.ts` | `getWorktreeCommitLog()` |
| IPC | `electron/ipc/handlers.ts` | `tasks:worktree:generateMergeMessage` |
| Preload | `electron/preload.ts` | Bridge for new IPC method |
| API | `src/lib/api.ts` | Type for new method |
| Hook | `src/hooks/use-settings.ts` | `useAiSkillSlotsSetting`, `useUpdateAiSkillSlotsSetting` |
| Hook | `src/hooks/use-worktree-diff.ts` | `useGenerateMergeMessage` |
| UI | `src/features/agent/ui-worktree-actions/merge-confirm-dialog.tsx` | Auto-generate on open, loading state, user-edit protection |
| UI | `src/features/settings/ui-ai-generation-settings/index.tsx` | New settings section with inline slot configuration |
| UI | `src/features/settings/ui-general-settings/index.tsx` | Mount `AiGenerationSettings` |
| UI | `src/features/project/ui-project-settings/index.tsx` | Per-project slot overrides |
