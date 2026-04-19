# Builtin Skills & Task Name Generation Slot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a builtin skills system that auto-provisions non-editable skills on startup, migrate the hardcoded task-name-generation prompt into a builtin skill, and expose task naming as a configurable AI Generation slot (defaulting to builtin skill + Haiku).

**Architecture:** Builtin skills are stored at `~/.config/jean-claude/skills/builtin/<name>/SKILL.md` and upserted on every app launch (overwriting any user modifications). They appear in the skill management UI with `source: 'builtin'` and `editable: false`. The `name-generation-service` is refactored to resolve a `'task-name'` AI skill slot — when the slot is unconfigured, it falls back to the builtin skill + Haiku defaults.

**Tech Stack:** Electron main process (Node.js), TypeScript, Kysely, React, TanStack Query, Zustand

---

## Task 1: Add `'builtin'` to skill source type

**Files:**
- Modify: `shared/skill-types.ts:9`

**Step 1: Update ManagedSkill source union**

In `shared/skill-types.ts`, change the `source` field on `ManagedSkill`:

```ts
// Before
source: 'user' | 'project' | 'plugin';

// After
source: 'user' | 'project' | 'plugin' | 'builtin';
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS — `'builtin'` is additive to the union, no downstream breakage.

**Step 3: Commit**

```bash
git add shared/skill-types.ts
git commit -m "feat: add 'builtin' to ManagedSkill source type"
```

---

## Task 2: Add `'task-name'` AI skill slot key

**Files:**
- Modify: `shared/types.ts` (lines ~596–632)

**Step 1: Add `'task-name'` to the `AiSkillSlotKey` type**

Find the `AiSkillSlotKey` type definition and add `'task-name'`:

```ts
// Before
export type AiSkillSlotKey =
  | 'merge-commit-message'
  | 'commit-message'
  | 'pr-description';

// After
export type AiSkillSlotKey =
  | 'merge-commit-message'
  | 'commit-message'
  | 'pr-description'
  | 'task-name';
```

**Step 2: Add `'task-name'` to `VALID_SLOT_KEYS`**

```ts
// Before
const VALID_SLOT_KEYS: AiSkillSlotKey[] = [
  'merge-commit-message',
  'commit-message',
  'pr-description',
];

// After
const VALID_SLOT_KEYS: AiSkillSlotKey[] = [
  'merge-commit-message',
  'commit-message',
  'pr-description',
  'task-name',
];
```

**Step 3: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add 'task-name' AI skill slot key"
```

---

## Task 3: Create the builtin skills service

**Files:**
- Create: `electron/services/builtin-skills-service.ts`

This service defines builtin skill content and upserts them to disk on startup.

**Step 1: Create the service**

```ts
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { dbg } from '../lib/debug';
import { buildSkillMd } from '../lib/skill-frontmatter';

const JC_BUILTIN_SKILLS_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'skills',
  'builtin',
);

export { JC_BUILTIN_SKILLS_DIR };

interface BuiltinSkillDefinition {
  /** Directory name under builtin/ */
  dirName: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Registry of all builtin skills.
 * Each entry defines the SKILL.md content that is written on every startup.
 */
const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  {
    dirName: 'task-name-generation',
    name: 'Task Name Generation',
    description: 'Generate concise task names from prompts',
    content: `You are a task naming assistant. Given a coding task description, produce a short name (≤40 characters) that captures the essence of the task.

Rules:
- MUST be ≤40 characters. This is a hard limit.
- Start with a lowercase verb (add, fix, refactor, update, implement, etc.)
- Be specific about WHAT is being done, but concise
- NEVER copy the input verbatim. Always summarize and compress.
- Ignore boilerplate, metadata, platform tags, ticket IDs, repro steps
- Focus on the single core action being described

Examples:
Input: "once a PR is associated to a task, in the task details diff view, we should have a button beside 'See PR' to be able to push new changes"
Output: "add push changes button to PR diff view"

Input: "The station subtitle is not clearing when the user searches for a new station in the search field, it persists from the previous selection"
Output: "fix subtitle not clearing on search"

Input: "We need to add retry logic to the webhook delivery system so that failed webhooks are retried up to 3 times with exponential backoff"
Output: "add retry logic to webhook delivery"

Input: "refactor the authentication middleware to use JWT tokens instead of session-based authentication"
Output: "refactor auth middleware to use JWT"

Input: "fix race condition in checkout flow where users are sometimes double-charged"
Output: "fix race condition in checkout flow"`,
  },
];

/**
 * Upserts all builtin skills to disk.
 * Called on every app startup to ensure builtin skills exist and are not
 * modified by the user. Overwrites any existing content.
 */
export async function upsertBuiltinSkills(): Promise<void> {
  await fs.mkdir(JC_BUILTIN_SKILLS_DIR, { recursive: true });

  for (const skill of BUILTIN_SKILLS) {
    const skillDir = path.join(JC_BUILTIN_SKILLS_DIR, skill.dirName);
    await fs.mkdir(skillDir, { recursive: true });

    const skillMd = buildSkillMd({
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });

    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
    dbg.main('Upserted builtin skill: %s', skill.name);
  }
}

/**
 * Returns the filesystem path for a builtin skill by directory name.
 * Used by services that need to resolve builtin skill content at runtime.
 */
export function getBuiltinSkillPath(dirName: string): string {
  return path.join(JC_BUILTIN_SKILLS_DIR, dirName);
}
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/services/builtin-skills-service.ts
git commit -m "feat: create builtin skills service with task-name-generation skill"
```

---

## Task 4: Discover builtin skills in skill management service

**Files:**
- Modify: `electron/services/skill-management-service.ts`

We need to add builtin skill discovery so they appear in the UI and can be selected in AI Generation slots.

**Step 1: Import the builtin skills dir constant**

At the top of `skill-management-service.ts`, add:

```ts
import { JC_BUILTIN_SKILLS_DIR } from './builtin-skills-service';
```

**Step 2: Create `discoverBuiltinSkills()` function**

Add this function after the existing `discoverJcManagedUserSkills` function (~line 231):

```ts
/**
 * Scans the JC builtin skills directory.
 * Builtin skills are read-only and managed by the application.
 * They are not symlinked to any backend — they are used internally
 * by JC's AI generation services.
 */
async function discoverBuiltinSkills(): Promise<ManagedSkill[]> {
  const skills: ManagedSkill[] = [];

  try {
    const entries = await fs.readdir(JC_BUILTIN_SKILLS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(JC_BUILTIN_SKILLS_DIR, entry.name);
      const info = await readSkillDir(skillDir);
      if (!info) continue;

      skills.push({
        ...info,
        source: 'builtin',
        skillPath: skillDir,
        enabledBackends: {},
        editable: false,
      });
    }
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.skill(
        'Error reading builtin skills dir %s: %O',
        JC_BUILTIN_SKILLS_DIR,
        error,
      );
    }
  }

  return skills;
}
```

**Step 3: Include builtin skills in `discoverSkillsForBackend()`**

In the `discoverSkillsForBackend` function (~line 662), add builtin discovery after the existing sources:

```ts
// At the end, before `return results;`:
// Builtin skills: managed by JC, not symlinked to backends
results.push(...(await discoverBuiltinSkills()));
```

**Step 4: Include builtin skills in `getAllManagedSkillsUnified()`**

In `getAllManagedSkillsUnified` (~line 712), add builtin discovery after the JC-managed user skills block (~after line 726):

```ts
// Builtin skills
const builtinSkills = await discoverBuiltinSkills();
for (const skill of builtinSkills) {
  if (seenPaths.has(skill.skillPath)) continue;
  seenPaths.add(skill.skillPath);
  results.push(skill);
}
```

**Step 5: Guard `deleteSkill` and `updateSkill` against builtin skills**

At the top of `deleteSkill` (~line 1116), add:

```ts
if (skillPath.startsWith(JC_BUILTIN_SKILLS_DIR + path.sep)) {
  throw new Error('Cannot delete builtin skills');
}
```

At the top of `updateSkill` (~line 1065), add:

```ts
if (skillPath.startsWith(JC_BUILTIN_SKILLS_DIR + path.sep)) {
  throw new Error('Cannot modify builtin skills');
}
```

**Step 6: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS

**Step 7: Commit**

```bash
git add electron/services/skill-management-service.ts
git commit -m "feat: discover builtin skills in skill management service"
```

---

## Task 5: Upsert builtin skills on app startup

**Files:**
- Modify: `electron/main.ts`

**Step 1: Import and call upsert**

Add import at the top of `electron/main.ts`:

```ts
import { upsertBuiltinSkills } from './services/builtin-skills-service';
```

After the database migration block (~line 119, after `dbg.main('Database migrations complete');`), add:

```ts
dbg.main('Upserting builtin skills...');
await upsertBuiltinSkills();
dbg.main('Builtin skills upserted');
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: upsert builtin skills on app startup"
```

---

## Task 6: Refactor name-generation-service to use AI skill slot

**Files:**
- Modify: `electron/services/name-generation-service.ts`

This is the core migration. The service will resolve the `'task-name'` slot and use the configured skill + model, falling back to the builtin skill + Haiku when unconfigured.

**Step 1: Rewrite the service**

Replace the entire content of `name-generation-service.ts`:

```ts
import type { AiSkillSlotsSetting } from '@shared/types';

import { dbg } from '../lib/debug';
import { extractBody } from '../lib/skill-frontmatter';

import { generateText } from './ai-generation-service';
import { resolveAiSkillSlot } from './ai-skill-slot-resolver';
import { getBuiltinSkillPath } from './builtin-skills-service';
import { getSkillContent } from './skill-management-service';

const TASK_NAME_MAX_PROMPT_LENGTH = 8000;
const TASK_NAME_TIMEOUT_MS = 60_000;

const TASK_NAME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
} as const;

/** Default backend when no slot is configured. */
const DEFAULT_BACKEND = 'claude-code' as const;
/** Default model when no slot is configured. */
const DEFAULT_MODEL = 'haiku';
/** Default builtin skill directory name. */
const BUILTIN_SKILL_DIR = 'task-name-generation';

/**
 * Reads the prompt content from a skill.
 * For builtin skills (skillName is null), reads from the builtin skill path.
 * For user/plugin skills, reads from the skill management service.
 */
async function resolveSkillPrompt(
  skillName: string | null,
): Promise<string | null> {
  try {
    if (skillName === null) {
      // Use builtin skill
      const builtinPath = getBuiltinSkillPath(BUILTIN_SKILL_DIR);
      const { content } = await getSkillContent({ skillPath: builtinPath });
      return content;
    }

    // User/plugin skill: we need to find the skill by name.
    // For now, use the skillName as a reference for the agent backend
    // (the skill is already symlinked and the agent can access it).
    return null;
  } catch (error) {
    dbg.agent('Failed to resolve skill prompt: %O', error);
    return null;
  }
}

/**
 * Generates a task name from a prompt using the configured AI skill slot.
 * Falls back to builtin skill + Haiku when unconfigured.
 *
 * @param prompt - The task prompt to generate a name from
 * @param projectSlots - Optional project-level slot overrides
 * @returns The generated name, or null if generation fails
 */
export async function generateTaskName(
  prompt: string,
  projectSlots?: AiSkillSlotsSetting | null,
): Promise<string | null> {
  const truncatedPrompt = prompt.slice(0, TASK_NAME_MAX_PROMPT_LENGTH);

  try {
    // Resolve slot configuration
    const slotConfig = await resolveAiSkillSlot(
      'task-name',
      projectSlots ?? null,
    );

    const backend = slotConfig?.backend ?? DEFAULT_BACKEND;
    const model = slotConfig?.model ?? DEFAULT_MODEL;
    const skillName = slotConfig?.skillName ?? null;

    // Resolve the prompt content from the skill
    const skillPrompt = await resolveSkillPrompt(skillName);

    let fullPrompt: string;
    if (skillPrompt) {
      // Use skill content as the prompt template
      fullPrompt = `${skillPrompt}\n\nTask to name:\n${truncatedPrompt}`;
    } else if (skillName) {
      // User skill that we can't read directly — reference it for the agent
      fullPrompt = `Task to name:\n${truncatedPrompt}`;
    } else {
      // No skill at all — use builtin as inline fallback
      const builtinPrompt = await resolveSkillPrompt(null);
      fullPrompt = builtinPrompt
        ? `${builtinPrompt}\n\nTask to name:\n${truncatedPrompt}`
        : `Generate a short task name (≤40 characters) for this task:\n${truncatedPrompt}`;
    }

    const result = await generateText({
      backend,
      model,
      prompt: fullPrompt,
      skillName: skillPrompt ? undefined : skillName,
      outputSchema: TASK_NAME_SCHEMA,
      timeoutMs: TASK_NAME_TIMEOUT_MS,
    });

    if (
      result &&
      typeof result === 'object' &&
      'name' in result &&
      typeof (result as { name: unknown }).name === 'string'
    ) {
      const name = (result as { name: string }).name.slice(0, 40);
      dbg.agent('Generated task name: %s', name);
      return name;
    }

    return null;
  } catch (error) {
    dbg.agent('Failed to generate task name: %O', error);
    return null;
  }
}
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS — the `generateTaskName` signature is backward-compatible (new param is optional).

**Step 3: Commit**

```bash
git add electron/services/name-generation-service.ts
git commit -m "refactor: migrate task name generation to AI skill slot system"
```

---

## Task 7: Add task-name slot to UI

**Files:**
- Modify: `src/features/common/ui-ai-skill-slot/index.tsx`

**Step 1: Add task-name to SLOT_DEFINITIONS**

Add a new entry to the `SLOT_DEFINITIONS` array (after the existing entries, ~line 39):

```ts
{
  key: 'task-name',
  label: 'Task Name',
  description:
    'Auto-generate short task names from prompts (defaults to builtin skill with Haiku)',
},
```

**Step 2: Update the enable logic to allow slots without a user-selected skill**

The current UI requires a skill to be selected before the toggle can be enabled. For `task-name`, the slot works by default (with no skill = builtin prompt). We need to update the `canEnable` logic.

Find the `canEnable` const (~line 182):

```ts
// Before
const canEnable = hasSkillSelected;

// After
const canEnable = true;
```

This allows all slots to be enabled without a skill — `skillName: null` means "use builtin/default prompt". This is the correct behavior for all slots since `generateText` already handles `skillName: null` gracefully for existing slots too.

**Step 3: Update the summary display for null skill**

In the summary building block (~line 165), update to show "Builtin" when no skill is selected:

```ts
// Before
const summary = config
  ? [
      enabledBackends.find((b) => b.value === config.backend)?.label ??
        config.backend,
      config.model,
      config.skillName,
    ]
      .filter(Boolean)
      .join(' · ')
  : 'Not configured';

// After
const summary = config
  ? [
      enabledBackends.find((b) => b.value === config.backend)?.label ??
        config.backend,
      config.model,
      config.skillName ?? 'Builtin',
    ]
      .join(' · ')
  : 'Not configured';
```

**Step 4: Update the "Select a skill to enable" hint**

Remove the hint since skills are now optional. Find the hint block (~line 254):

```tsx
// Before
{!canEnable && !isEnabled && (
  <span className="text-ink-4 text-xs">
    Select a skill to enable
  </span>
)}

// After — remove this block entirely
```

**Step 5: Verify no type errors**

Run: `pnpm ts-check`
Expected: PASS

**Step 6: Commit**

```bash
git add src/features/common/ui-ai-skill-slot/index.tsx
git commit -m "feat: add task-name slot to AI Generation settings UI"
```

---

## Task 8: Lint, type-check, and final commit

**Step 1: Install dependencies**

```bash
pnpm install
```

**Step 2: Auto-fix lint issues**

```bash
pnpm lint --fix
```

**Step 3: Verify TypeScript**

```bash
pnpm ts-check
```

**Step 4: Run lint to check for remaining issues**

```bash
pnpm lint
```

**Step 5: Fix any remaining issues and commit**

```bash
git add -A
git commit -m "chore: lint fixes for builtin skills feature"
```

---

## Summary of Changes

| File | Change |
|---|---|
| `shared/skill-types.ts` | Add `'builtin'` to `ManagedSkill.source` union |
| `shared/types.ts` | Add `'task-name'` to `AiSkillSlotKey` and `VALID_SLOT_KEYS` |
| `electron/services/builtin-skills-service.ts` | **NEW** — defines builtin skills, upserts on startup |
| `electron/services/skill-management-service.ts` | Discover builtin skills, guard delete/update |
| `electron/main.ts` | Call `upsertBuiltinSkills()` after DB migrations |
| `electron/services/name-generation-service.ts` | Refactor to use AI skill slot + builtin skill content |
| `src/features/common/ui-ai-skill-slot/index.tsx` | Add task-name slot, allow enabling without skill |

## Default Behavior

- **Task name generation** works out of the box with no user configuration
- When the `'task-name'` slot is unconfigured (no entry in `aiSkillSlots`), the service falls back to `claude-code` + `haiku` + the builtin skill prompt
- Users can override via Settings → AI Generation → Task Name:
  - Change backend (claude-code / opencode)
  - Change model
  - Select a custom user skill (or keep builtin)
- Builtin skills are overwritten on every startup — user modifications are reset
- Builtin skills cannot be deleted or edited through the UI (`editable: false`)
