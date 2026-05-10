# Expand Prompt Snippets with Handlebars Templating

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve prompt snippets from simple autocomplete triggers into powerful prompt templates with Handlebars templating, contextual usage (new task from work items, new step), and configurable autocomplete behavior.

**Architecture:** Replace the simple `{variable}` regex resolver with Handlebars engine. Extend `PromptSnippet` type with `contexts` and `autocomplete` fields. Snippets become reusable in the compose step (new task from work items) and add-step dialog, not just prompt autocomplete. The compose step's `generateInitialTemplate` can be driven by a snippet's Handlebars template that loops over work items.

**Tech Stack:** `handlebars` (npm), existing Zustand/React Query settings infrastructure, CodeMirror 6 with `@replit/codemirror-lang-handlebars` for template editing.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install handlebars and codemirror handlebars language**

```bash
pnpm add handlebars
pnpm add @replit/codemirror-lang-handlebars
```

**Step 2: Verify installation**

```bash
pnpm ts-check
```

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add handlebars and codemirror-lang-handlebars deps"
```

---

## Task 2: Extend PromptSnippet Type

**Files:**
- Modify: `shared/types.ts` (lines 667-693)

**Step 1: Update the PromptSnippet type**

Replace the current type with the expanded version:

```typescript
// Prompt Snippets
export type PromptSnippetContext = {
  newTask: boolean;
  newTaskStep: boolean;
};

export type PromptSnippetAutocomplete = {
  enabled: boolean;
  slugs: string[];
};

export type PromptSnippet = {
  id: string;
  name: string;
  description: string;
  template: string;
  enabled: boolean;
  builtin: boolean;
  contexts: PromptSnippetContext;
  autocomplete: PromptSnippetAutocomplete;
};
```

**Step 2: Update the validator**

```typescript
function isPromptSnippetsSetting(
  value: unknown,
): value is PromptSnippetsSetting {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.description === 'string' &&
      typeof item.template === 'string' &&
      typeof item.enabled === 'boolean' &&
      typeof item.builtin === 'boolean' &&
      typeof item.contexts === 'object' &&
      item.contexts !== null &&
      typeof item.contexts.newTask === 'boolean' &&
      typeof item.contexts.newTaskStep === 'boolean' &&
      typeof item.autocomplete === 'object' &&
      item.autocomplete !== null &&
      typeof item.autocomplete.enabled === 'boolean' &&
      Array.isArray(item.autocomplete.slugs) &&
      item.autocomplete.slugs.every((s: unknown) => typeof s === 'string'),
  );
}
```

**Step 3: Add migration helper for old format**

Add a function that normalizes old snippets to new format (for backwards compat when loading settings):

```typescript
export function migratePromptSnippet(raw: Record<string, unknown>): PromptSnippet {
  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    name: (raw.name as string) ?? '',
    description: (raw.description as string) ?? '',
    template: (raw.template as string) ?? '',
    enabled: (raw.enabled as boolean) ?? true,
    builtin: (raw.builtin as boolean) ?? false,
    contexts: (raw.contexts as PromptSnippetContext) ?? { newTask: true, newTaskStep: true },
    autocomplete: (raw.autocomplete as PromptSnippetAutocomplete) ?? {
      enabled: true,
      slugs: raw.trigger ? [raw.trigger as string] : [],
    },
  };
}
```

**Step 4: Update the validator to accept both old and new formats with auto-migration**

In the settings repository (or at the validation layer), apply `migratePromptSnippet` when loading. The validator should validate the migrated form.

**Step 5: Commit**

```bash
git add shared/types.ts
git commit -m "feat: extend PromptSnippet type with contexts, autocomplete, description"
```

---

## Task 3: Replace Template Resolver with Handlebars

**Files:**
- Modify: `src/lib/resolve-snippet-template.ts`

**Step 1: Rewrite resolver to use Handlebars**

```typescript
import Handlebars from 'handlebars';
import type { PromptSnippet } from '@shared/types';

export type SnippetVariableContext = {
  task?: {
    worktreePath?: string | null;
    name?: string | null;
    note?: string | null;
    sourceBranch?: string | null;
    branchName?: string | null;
  };
  project?: {
    name?: string | null;
    path?: string | null;
  };
  workItems?: Array<{
    id: string | number;
    title?: string;
    description?: string;
    comments?: Array<{
      author?: string;
      date?: string;
      body?: string;
    }>;
    testCases?: string[];
  }>;
};

// Register custom helpers
Handlebars.registerHelper('ifPresent', function (this: unknown, value: unknown, options: Handlebars.HelperOptions) {
  return value ? options.fn(this) : options.inverse(this);
});

export function resolveSnippetTemplate(
  template: string,
  context: SnippetVariableContext,
): string {
  try {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(context);
  } catch {
    // Fallback: return template as-is if compilation fails
    return template;
  }
}

export function resolvePromptSnippet(
  snippet: PromptSnippet,
  context: SnippetVariableContext,
): string {
  return resolveSnippetTemplate(snippet.template, context);
}
```

**Step 2: Update callers that pass old `{variable}` syntax in built-in templates**

Any built-in snippet templates need updating from `{task.name}` to `{{task.name}}`. Check existing data in settings — old user templates with `{var}` won't break (they'll pass through as literal text since `{` alone doesn't trigger Handlebars).

**Step 3: Verify TypeScript compiles**

```bash
pnpm ts-check
```

**Step 4: Commit**

```bash
git add src/lib/resolve-snippet-template.ts
git commit -m "feat: replace regex template resolver with Handlebars engine"
```

---

## Task 4: Update Settings UI for New Snippet Fields

**Files:**
- Modify: `src/features/settings/ui-prompt-snippets-settings/index.tsx`

**Step 1: Update SnippetForm to show new fields**

Add to the form:
- **Description** textarea (short, 1-2 lines)
- **Contexts** section with checkboxes: "Available in new task", "Available in new task step"
- **Autocomplete** section:
  - Checkbox: "Show in autocomplete"
  - Slugs input (comma-separated, sanitized to kebab-case)
- Replace "Trigger" field with "Slugs" since `trigger` is removed

**Step 2: Update handleCreate to use new defaults**

```typescript
const newSnippet: PromptSnippet = {
  id: generateId(),
  name: '',
  description: '',
  template: '',
  enabled: true,
  builtin: false,
  contexts: { newTask: true, newTaskStep: true },
  autocomplete: { enabled: true, slugs: [] },
};
```

**Step 3: Update AVAILABLE_VARIABLES to show Handlebars syntax**

```typescript
const AVAILABLE_VARIABLES = [
  '{{task.worktreePath}}',
  '{{task.name}}',
  '{{task.note}}',
  '{{task.sourceBranch}}',
  '{{task.branchName}}',
  '{{project.name}}',
  '{{project.path}}',
  '{{#each workItems}}...{{/each}}',
  '{{#if task.note}}...{{/if}}',
];
```

**Step 4: Replace textarea with CodeMirror for template field**

Create a small wrapper component:

```typescript
// Use @replit/codemirror-lang-handlebars for syntax highlighting
import { handlebars } from '@replit/codemirror-lang-handlebars';
```

(If CodeMirror integration is too heavy for this task, defer to a follow-up. A plain textarea with monospace font works initially.)

**Step 5: Commit**

```bash
git add src/features/settings/ui-prompt-snippets-settings/
git commit -m "feat: update snippet settings UI for new fields (contexts, autocomplete, description)"
```

---

## Task 5: Update Autocomplete Dropdown to Use Slugs

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx`

**Step 1: Update snippet filtering logic**

Currently filters on `snippet.trigger` and `snippet.name`. Change to:
- Only include snippets where `snippet.autocomplete.enabled === true`
- Fuzzy match against `snippet.autocomplete.slugs` array entries AND `snippet.name`

```typescript
// Filter snippets for autocomplete
const autocompleteSnippets = promptSnippets?.filter(
  (s) => s.enabled && s.autocomplete.enabled,
) ?? [];

// Fuse keys: search across all slugs and name
const snippetFuse = new Fuse(autocompleteSnippets, {
  keys: ['autocomplete.slugs', 'name'],
  threshold: 0.4,
});
```

**Step 2: Update dropdown item display**

Show first slug as the trigger display (e.g., `/review`) and snippet name + description.

**Step 3: Commit**

```bash
git add src/features/common/ui-prompt-textarea/
git commit -m "feat: update autocomplete to use snippet slugs field"
```

---

## Task 6: Integrate Snippets into New Task Compose Step

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx`
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Add snippet selector to compose step**

When user has work items selected and moves to compose step, instead of always using `generateInitialTemplate()`, show a dropdown/selector of snippets where `contexts.newTask === true`. The selected snippet's Handlebars template is used as the initial template.

Keep `generateInitialTemplate()` as the default (built-in) behavior when no snippet is selected.

**Step 2: Update template expansion**

Currently `expandTemplate()` uses regex `{#id}` replacement. With Handlebars, the compose template becomes:

```handlebars
Implement the following work items:

{{#each workItems}}
<work_item id="{{this.id}}">
  <title>{{this.title}}</title>
  {{#if this.description}}
  <description>{{this.description}}</description>
  {{/if}}
  {{#if this.comments}}
  <comments>
    {{#each this.comments}}
    <comment by="{{this.author}}" date="{{this.date}}">
      {{this.body}}
    </comment>
    {{/each}}
  </comments>
  {{/if}}
</work_item>
{{/each}}
```

**Step 3: Create a built-in "Implement Work Items" snippet**

This is the default snippet used in compose step. Mark it `builtin: true`, `contexts.newTask: true`, `autocomplete.enabled: false` (not needed in autocomplete).

**Step 4: Pass work items data to Handlebars context**

When resolving the template, build `SnippetVariableContext` with `workItems` array populated from selected `AzureDevOpsWorkItem[]` objects + selected comments.

**Step 5: Keep backward compat**

If template still uses old `{#id}` syntax, fall back to `expandTemplate()` regex approach. Check if template contains `{{` to determine which engine to use.

**Step 6: Commit**

```bash
git add src/features/new-task/
git commit -m "feat: integrate snippet templates into new task compose step"
```

---

## Task 7: Integrate Snippets into Add Step Dialog

**Files:**
- Modify: `src/features/task/ui-task-panel/add-step-dialog.tsx`

**Step 1: Add snippet picker for step prompt**

In the add-step dialog, when creating a new step, show available snippets where `contexts.newTaskStep === true` as quick-insert options (like preset buttons or a dropdown).

**Step 2: When snippet selected, resolve template with current task context**

Build context from current task (worktree path, branch, name) and insert resolved template into step prompt textarea.

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/add-step-dialog.tsx
git commit -m "feat: add snippet picker in add-step dialog"
```

---

## Task 8: Add Built-in Snippets

**Files:**
- Create: `src/lib/builtin-snippets.ts`
- Modify: `src/hooks/use-settings.ts`

**Step 1: Define built-in snippets**

```typescript
import type { PromptSnippet } from '@shared/types';

export const BUILTIN_SNIPPETS: PromptSnippet[] = [
  {
    id: 'builtin-implement-work-items',
    name: 'Implement Work Items',
    description: 'Standard work item implementation template with comments',
    template: `Implement the following work items:

{{#each workItems}}
<work_item id="{{this.id}}">
  <title>{{this.title}}</title>
{{#if this.description}}
  <description>
    {{this.description}}
  </description>
{{/if}}
{{#if this.comments}}
  <comments>
{{#each this.comments}}
    <comment by="{{this.author}}" date="{{this.date}}">
      {{this.body}}
    </comment>
{{/each}}
  </comments>
{{/if}}
</work_item>
{{/each}}`,
    enabled: true,
    builtin: true,
    contexts: { newTask: true, newTaskStep: false },
    autocomplete: { enabled: false, slugs: [] },
  },
  {
    id: 'builtin-code-review',
    name: 'Code Review',
    description: 'Review changes on current branch',
    template: `Review the changes on branch {{task.branchName}} in {{task.worktreePath}}.

Focus on:
- Correctness
- Edge cases
- Code style consistency`,
    enabled: true,
    builtin: true,
    contexts: { newTask: false, newTaskStep: true },
    autocomplete: { enabled: true, slugs: ['review', 'cr'] },
  },
];
```

**Step 2: Merge built-ins with user snippets in the hook**

In `usePromptSnippetsSetting()`, merge built-in snippets with user-saved snippets. Built-ins always present but user can disable them.

**Step 3: Commit**

```bash
git add src/lib/builtin-snippets.ts src/hooks/use-settings.ts
git commit -m "feat: add built-in prompt snippets (implement work items, code review)"
```

---

## Task 9: Settings Migration for Existing Users

**Files:**
- Modify: `electron/database/repositories/settings.ts`

**Step 1: Apply migration when loading promptSnippets**

When `SettingsRepository.get('promptSnippets')` returns data, apply `migratePromptSnippet()` to each item to handle old format (has `trigger` field, missing `contexts`/`autocomplete`/`description`).

```typescript
// In the get method for promptSnippets, after parsing:
if (key === 'promptSnippets' && Array.isArray(parsed)) {
  return parsed.map(migratePromptSnippet);
}
```

**Step 2: Ensure validator accepts migrated format**

The validator in step 2 already validates the new shape. The migration ensures old data conforms.

**Step 3: Commit**

```bash
git add electron/database/repositories/settings.ts
git commit -m "feat: auto-migrate old prompt snippets to new format on load"
```

---

## Task 10: Final Verification

**Step 1: Run linting**

```bash
pnpm lint --fix
pnpm lint
```

**Step 2: Run TypeScript check**

```bash
pnpm ts-check
```

**Step 3: Fix any errors**

**Step 4: Final commit if needed**

---

## Summary of Key Changes

| What | Before | After |
|------|--------|-------|
| Template syntax | `{task.name}` regex | `{{task.name}}` Handlebars |
| Looping | Not possible | `{{#each workItems}}` |
| Conditionals | Not possible | `{{#if task.note}}` |
| Trigger field | Single `trigger` string | `autocomplete.slugs` array |
| Contexts | Implicit (always autocomplete) | Explicit `contexts.newTask`, `contexts.newTaskStep` |
| Compose step | Hardcoded `generateInitialTemplate` | Snippet-driven template |
| Template editor | Plain textarea | CodeMirror with Handlebars syntax |

## Open Questions / Follow-ups

1. **CodeMirror integration** — If too heavy for initial pass, keep plain textarea + monospace. Add CM in follow-up.
2. **Template preview** — Show resolved output next to editor? Good UX but separate task.
3. **Custom Handlebars helpers** — May want `{{formatDate}}`, `{{truncate}}` etc. Add as needed.
4. **Snippet sharing/export** — Future: JSON import/export of snippet packs.
