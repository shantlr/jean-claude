# AI Skill Slots & Merge Commit Message Generation — Design

## Overview

A reusable **AI skill slot** system that lets users configure "backend + model + skill" triples for various AI-powered generation features. The first consumer is **auto-generating merge commit messages** when the merge dialog opens.

## AI Skill Slots

### Concept

An AI skill slot is a named purpose that needs AI generation. Each slot is identified by a string key (e.g., `merge-commit-message`) and configured with:

```typescript
{
  backend: AgentBackendType;  // 'claude-code' | 'opencode'
  model: string;              // 'haiku', 'sonnet', etc.
  skillName: string | null;   // null = use built-in default prompt
}
```

- **Not configured → feature disabled.** No fallback. If neither global nor project settings define a slot, the feature simply doesn't run.
- **Skill selected → the agent uses the skill.** The skill's instructions naturally shape the output format. The prompt tells the agent to use the skill.
- **No skill selected (`null`) → built-in default prompt.** A sensible hardcoded prompt is used.

### Resolution Order

```
project.aiSkillSlots["merge-commit-message"]   // 1. project override
  ?? globalSettings.aiSkillSlots["merge-commit-message"]   // 2. global default
  ?? undefined   // 3. not configured → feature disabled
```

### Storage

**Global:** A new `aiSkillSlots` key in the existing `AppSettings` key-value store.

```typescript
type AiSkillSlotsSetting = Record<string, {
  backend: AgentBackendType;
  model: string;
  skillName: string | null;
}>;
```

Default value: `{}` (empty record — nothing configured, all features disabled).

**Per-project:** A new `aiSkillSlots` JSON text column on the `projects` table. Same shape. `null` means "use global". If set, it's a partial record — only the slots the project wants to override.

### Initial Slot Types

Only one slot built now:

- `merge-commit-message` — generates the squash merge commit message

Future candidates (not built, but the schema supports them): `pr-description`, `task-summary`, `commit-message`, etc.

## AI Generation Service

### `ai-generation-service.ts`

A thin abstraction for "run a simple text generation with a given backend + model + prompt + optional skill":

```typescript
async function generateText(params: {
  backend: AgentBackendType;
  model: string;
  prompt: string;
  skillName?: string | null;
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<unknown | null>
```

- Branches internally on backend type:
  - **`claude-code`** → uses `query()` from Claude Agent SDK with `persistSession: false`
  - **`opencode`** → uses OpenCode SDK equivalent (TBD during implementation)
- Handles skill activation per backend type
- Returns structured output (if `outputSchema` provided) or raw text
- Returns `null` on timeout or failure — never throws

This keeps callers simple — they don't need to know backend-specific details.

## Merge Commit Message Generation

### Service: `merge-message-generation-service.ts`

Calls `generateText()` with:

- The resolved slot config (backend, model, skill)
- A prompt containing: branch names, git commit log (since worktree creation), changed file list
- Structured output schema: `{ title: string, body: string }`

Returns `{ title, body } | null`.

### Data Gathering

A new `getWorktreeCommitLog()` function in `worktree-service.ts`:

```typescript
git log --oneline <startCommitHash>..HEAD
```

Changed files are already available via `getWorktreeDiff()` — we just need the file paths and statuses, not the full diff content.

### Merge Dialog Integration

When the merge dialog opens:

1. Resolve `merge-commit-message` slot config (project → global → undefined)
2. If **undefined** → do nothing. Dialog shows task name as default (current behavior, unchanged)
3. If **configured** → call the generation service
   - Show a loading spinner next to the "Commit message" label
   - Textarea remains editable during generation
   - If user starts typing before generation completes, their edits are preserved (generation result won't overwrite)
   - On success → populate textarea with `title\n\nbody`
   - On failure → silently fall back to task name default (no error shown)

## Settings UI

### Global Settings

A new **"AI Generation"** section in General Settings (below Summary Models).

Shows a list of available slot types. Each slot is a row/card:

- **Not configured:** Shows slot label + "Not configured" + a "Configure" button
- **Configured:** Shows slot label + summary (e.g., "Claude Code · Haiku · conventional-commits") + "Edit" / "Remove" buttons

Clicking "Configure" or "Edit" **expands the row inline** (accordion style) to show three dropdowns:

1. **Backend** — Claude Code / OpenCode (filtered to enabled backends)
2. **Model** — dynamic model list for the selected backend
3. **Skill** — all user skills for the selected backend + "None (built-in default)" option

### Per-Project Settings

Same inline UI appears in Project Settings (under a new menu item or within "details"). Each slot shows an additional option:

- **"Use global default"** — clears the project-level override (sets to null)
- Otherwise same three dropdowns as global
