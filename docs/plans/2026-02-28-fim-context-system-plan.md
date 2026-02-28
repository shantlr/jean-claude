# FIM Context System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-project completion context that gets prepended to FIM prompts, with manual editing in project settings and auto-generation from task history via Claude Haiku.

**Architecture:** New `completionContext` column on `projects` table. The main-process completion service fetches the context from DB and prepends it to the FIM prompt. A new `completion-context-generation-service.ts` uses Claude Haiku to generate context from a project's task history. The project settings UI gets a new section for editing/generating the context.

**Tech Stack:** SQLite/Kysely migration, Electron IPC, Claude Agent SDK (`query()`), React + TanStack Query

---

### Task 1: Database Migration — Add `completionContext` column

**Files:**
- Create: `electron/database/migrations/031_project_completion_context.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`
- Modify: `shared/types.ts`

**Step 1: Create the migration file**

Create `electron/database/migrations/031_project_completion_context.ts`:

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('completionContext', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('completionContext').execute();
}
```

**Step 2: Register the migration in `electron/database/migrator.ts`**

Add import at line 32 (after `m030`):
```typescript
import * as m031 from './migrations/031_project_completion_context';
```

Add entry in the `migrations` record at line 63 (after `'030_replace_lastreadindex_with_hasunread'`):
```typescript
'031_project_completion_context': m031,
```

**Step 3: Update `electron/database/schema.ts`**

Add to `ProjectTable` interface (after `defaultAgentBackend` at line 82):
```typescript
completionContext: string | null;
```

**Step 4: Update `shared/types.ts`**

Add to `Project` interface (after `defaultAgentBackend` at ~line 184):
```typescript
completionContext: string | null;
```

Add to `NewProject` interface (after `defaultAgentBackend` at ~line 207):
```typescript
completionContext?: string | null;
```

Add to `UpdateProject` interface (after `defaultAgentBackend` at ~line 229):
```typescript
completionContext?: string | null;
```

**Step 5: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 2: Update Completion Service — Accept `projectId` and prepend context

**Files:**
- Modify: `electron/services/completion-service.ts`

**Step 1: Add ProjectRepository import**

At the top of `electron/services/completion-service.ts`, add import (after line 3):
```typescript
import { ProjectRepository } from '../database/repositories';
```

**Step 2: Update `complete()` function signature and logic**

Change the `complete` function (lines 27-80) to accept optional `projectId` and prepend context:

```typescript
export async function complete({
  prompt,
  suffix,
  projectId,
}: {
  prompt: string;
  suffix?: string;
  projectId?: string;
}): Promise<string | null> {
  try {
    const settings = await SettingsRepository.get('completion');

    if (!settings.enabled || !settings.apiKey || !settings.model) {
      dbg.completion(
        'Completion skipped: not configured (enabled=%s, hasKey=%s, model=%s)',
        settings.enabled,
        !!settings.apiKey,
        settings.model,
      );
      return null;
    }

    // Prepend project completion context if available
    let effectivePrompt = prompt;
    if (projectId) {
      const project = await ProjectRepository.findById(projectId);
      if (project?.completionContext) {
        effectivePrompt = project.completionContext + '\n\n' + prompt;
      }
    }

    const apiKey = encryptionService.decrypt(settings.apiKey);
    const client = getClient(apiKey, settings.serverUrl);

    dbg.completion(
      'Requesting FIM completion (model=%s, promptLen=%d, withContext=%s)',
      settings.model,
      effectivePrompt.length,
      effectivePrompt !== prompt,
    );

    const result = await client.fim.complete({
      model: settings.model,
      prompt: effectivePrompt,
      suffix: suffix || undefined,
      maxTokens: 64,
      temperature: 0,
      stop: ['\n\n'],
    });

    const content = result.choices?.[0]?.message?.content ?? null;
    if (content === null) {
      dbg.completion('FIM returned no content');
      return null;
    }

    // SDK returns string | ContentChunk[] — extract text
    const text = typeof content === 'string' ? content : null;
    dbg.completion('FIM result: %s', text?.slice(0, 80));

    return text?.trim() || null;
  } catch (error) {
    dbg.completion('FIM completion error: %O', error);
    return null;
  }
}
```

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 3: Create Context Generation Service

**Files:**
- Create: `electron/services/completion-context-generation-service.ts`

**Step 1: Create the service**

Create `electron/services/completion-context-generation-service.ts`:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

import { db } from '../database';
import { dbg } from '../lib/debug';

const CONTEXT_SCHEMA = {
  type: 'object',
  properties: {
    context: { type: 'string' },
  },
  required: ['context'],
} as const;

/**
 * Generates a completion context for a project by analyzing its task history.
 * Uses Claude Haiku to produce a project description and example prompts
 * that help the FIM model understand the project domain and writing style.
 */
export async function generateCompletionContext({
  projectId,
}: {
  projectId: string;
}): Promise<string | null> {
  try {
    // Fetch the last 30 task prompts for this project
    const tasks = await db
      .selectFrom('tasks')
      .select(['prompt'])
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .execute();

    if (tasks.length === 0) {
      return null;
    }

    const promptList = tasks
      .map((t) => t.prompt.trim())
      .filter((p) => p.length > 0)
      .map((p) => `- ${p}`)
      .join('\n');

    const generator = query({
      prompt: `You are analyzing a software project's task history to create a completion context.
Given these recent task prompts from a project, generate a concise context block that will help an autocomplete model complete future prompts.

The context should include:
1. A short description of what this project is about (1-2 sentences, focus on purpose/domain, not technical stack)
2. A curated list of 5-10 representative example prompts that capture the user's writing style and common task patterns

Task prompts:
${promptList}

Output a single text block formatted exactly like this:
Project: <description>

Example prompts:
- <prompt 1>
- <prompt 2>
...

Keep it concise. The total should be under 500 characters.`,
      options: {
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        model: 'haiku',
        outputFormat: {
          type: 'json_schema',
          schema: CONTEXT_SCHEMA,
        },
        persistSession: false,
      },
    });

    for await (const message of generator) {
      const msg = message as {
        type: string;
        structured_output?: { context: string };
      };
      if (msg.type === 'result' && msg.structured_output?.context) {
        return msg.structured_output.context;
      }
    }

    return null;
  } catch (error) {
    dbg.agent('Failed to generate completion context: %O', error);
    return null;
  }
}
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 4: Wire Up IPC Handlers and API Types

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Update `completion:complete` handler in `electron/ipc/handlers.ts`**

Change the handler at lines 1879-1885 from:
```typescript
ipcMain.handle(
  'completion:complete',
  (_, params: { prompt: string; suffix?: string }) => {
    dbg.ipc('completion:complete (prompt length: %d)', params.prompt.length);
    return completeText(params);
  },
);
```
to:
```typescript
ipcMain.handle(
  'completion:complete',
  (_, params: { prompt: string; suffix?: string; projectId?: string }) => {
    dbg.ipc('completion:complete (prompt length: %d)', params.prompt.length);
    return completeText(params);
  },
);
```

**Step 2: Add `completion:generateContext` handler in `electron/ipc/handlers.ts`**

Add after the `completion:saveSettings` handler (after line 1936), before `// Project Todos`:

```typescript
ipcMain.handle(
  'completion:generateContext',
  async (_, params: { projectId: string }) => {
    dbg.ipc('completion:generateContext projectId=%s', params.projectId);
    const { generateCompletionContext } = await import(
      '../services/completion-context-generation-service'
    );
    return generateCompletionContext(params);
  },
);
```

**Step 3: Update `electron/preload.ts`**

Update the completion section (lines 450-460). Change `complete` to accept `projectId`:
```typescript
complete: (params: { prompt: string; suffix?: string; projectId?: string }) =>
  ipcRenderer.invoke('completion:complete', params),
```

Add `generateContext` after `saveSettings`:
```typescript
generateContext: (params: { projectId: string }) =>
  ipcRenderer.invoke('completion:generateContext', params),
```

**Step 4: Update `src/lib/api.ts`**

Update the completion type definition (lines 662-674). Change `complete` params:
```typescript
complete: (params: {
  prompt: string;
  suffix?: string;
  projectId?: string;
}) => Promise<string | null>;
```

Add `generateContext` after `saveSettings`:
```typescript
generateContext: (params: { projectId: string }) => Promise<string | null>;
```

**Step 5: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 5: Thread `projectId` Through Hooks and Components

**Files:**
- Modify: `src/hooks/use-inline-completion.ts`
- Modify: `src/features/common/ui-prompt-textarea/index.tsx`
- Modify: `src/features/agent/ui-message-input/index.tsx`
- Modify: `src/features/task/ui-task-panel/index.tsx`
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/routes/projects/$projectId/tasks/new.tsx`

**Step 1: Update `useInlineCompletion` hook**

In `src/hooks/use-inline-completion.ts`, add `projectId` parameter:

Change lines 8-15 to:
```typescript
export function useInlineCompletion({
  text,
  cursorPosition,
  enabled,
  projectId,
}: {
  text: string;
  cursorPosition: number;
  enabled: boolean;
  projectId?: string;
}) {
```

Change line 49 to pass `projectId`:
```typescript
const result = await api.completion.complete({ prompt, suffix, projectId });
```

Add `projectId` to the useEffect dependency array at line 65:
```typescript
}, [text, cursorPosition, enabled, projectId]);
```

**Step 2: Update `PromptTextareaProps` and hook call**

In `src/features/common/ui-prompt-textarea/index.tsx`:

Add `projectId` prop to `PromptTextareaProps` interface (after `enableCompletion` at ~line 150):
```typescript
projectId?: string;
```

Add `projectId` to the destructured props in the component function (after `enableCompletion`):
```typescript
projectId,
```

Pass `projectId` to `useInlineCompletion` (update the call at ~line 238-248):
```typescript
const {
  completion,
  isLoading: isCompletionLoading,
  accept,
  dismiss,
} = useInlineCompletion({
  text: value,
  cursorPosition,
  enabled: enableCompletion && !showDropdown,
  projectId,
});
```

**Step 3: Update `MessageInput` to accept and pass `projectId`**

In `src/features/agent/ui-message-input/index.tsx`:

Add `projectId` prop to the component's parameter list (after `supportsImages`):
```typescript
projectId?: string;
```

Pass `projectId` to `PromptTextarea` (after `enableCompletion` at ~line 134):
```typescript
projectId={projectId}
```

**Step 4: Pass `projectId` in `ui-task-panel/index.tsx`**

In `src/features/task/ui-task-panel/index.tsx` at the `<MessageInput>` usage (~line 1017):

Add `projectId` prop:
```typescript
projectId={project?.id}
```

(The `project` variable is already available via `useProject(projectId ?? '')` at line 95.)

**Step 5: Pass `projectId` in new task overlay**

In `src/features/new-task/ui-new-task-overlay/index.tsx` at the `<PromptTextarea>` usage (~line 758):

Add after `enableFilePathAutocomplete`:
```typescript
projectId={selectedProject?.id}
```

**Step 6: Pass `projectId` in new task route**

In `src/routes/projects/$projectId/tasks/new.tsx` at the `<PromptTextarea>` usage (~line 177):

Add after `enableFilePathAutocomplete`:
```typescript
projectId={projectId}
```

(The `projectId` is available from route params.)

**Step 7: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 6: Add Autocomplete Context Section to Project Settings UI

**Files:**
- Modify: `src/features/project/ui-project-settings/index.tsx`
- Modify: `src/hooks/use-projects.ts` (if `useUpdateProject` doesn't already handle `completionContext`)

**Step 1: Add state and change detection for `completionContext`**

In `src/features/project/ui-project-settings/index.tsx`:

Add state variable (after `showDeleteConfirm` state at ~line 41):
```typescript
const [completionContext, setCompletionContext] = useState('');
const [isGeneratingContext, setIsGeneratingContext] = useState(false);
```

Sync from project in the `useEffect` at ~line 54-61 (add inside the `if (project)` block):
```typescript
setCompletionContext(project.completionContext ?? '');
```

Add `completionContext` to `hasChanges` check (~line 103-107):
```typescript
completionContext !== (project.completionContext ?? '');
```

Add `completionContext` to `handleSave` (~line 86-95):
```typescript
completionContext: completionContext || null,
```

**Step 2: Add the generate handler**

Add after `handleDelete` function:
```typescript
async function handleGenerateContext() {
  setIsGeneratingContext(true);
  try {
    const result = await api.completion.generateContext({ projectId });
    if (result) {
      setCompletionContext(result);
    }
  } finally {
    setIsGeneratingContext(false);
  }
}
```

Add the `api` import at the top:
```typescript
import { api } from '@/lib/api';
```

**Step 3: Add the UI section**

Add a new section between the existing `#project-details` div (ends ~line 238) and the `#project-integrations` div (~line 241). Place it inside a new `<div>` with a top border:

```tsx
{/* Autocomplete Context */}
<div
  id="project-autocomplete-context"
  className="border-t border-neutral-700 pt-6"
>
  <h2 className="mb-4 text-lg font-semibold text-neutral-200">
    Autocomplete Context
  </h2>
  <p className="mb-3 text-xs text-neutral-500">
    Provides context to the autocomplete model when completing prompts in
    this project. Describe what the project is about and include example
    prompts.
  </p>
  <textarea
    value={completionContext}
    onChange={(e) => setCompletionContext(e.target.value)}
    placeholder={`Project: An e-commerce platform for artisan goods\n\nExample prompts:\n- add filtering by price range to the product catalog\n- fix the checkout flow when cart has mixed shipping`}
    rows={8}
    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
  />
  <button
    type="button"
    onClick={handleGenerateContext}
    disabled={isGeneratingContext}
    className="mt-2 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {isGeneratingContext
      ? 'Generating...'
      : 'Generate from task history'}
  </button>
</div>
```

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: No type errors

---

### Task 7: Lint and Final Verification

**Step 1: Run linter**

Run: `pnpm lint --fix`
Expected: No errors (warnings ok)

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds
