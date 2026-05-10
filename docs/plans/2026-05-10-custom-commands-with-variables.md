# Prompt Snippets — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user-configurable prompt snippets (triggered by `/` autocomplete) with template variables resolved from task/project context.

**Architecture:** New `promptSnippets` setting stored in SQLite settings table. A pure utility resolves `{variable}` placeholders at selection time. The prompt textarea gains a new `promptSnippets` prop and renders them as a dedicated group in the autocomplete dropdown. Snippets can be enabled/disabled and marked as builtin.

**Tech Stack:** React, TanStack Query, Kysely (settings repo), Fuse.js (fuzzy search)

---

### Task 1: Add PromptSnippet type and setting definition

**Files:**
- Modify: `shared/types.ts`

**Step 1: Add the PromptSnippet type**

In `shared/types.ts`, add before `SETTINGS_DEFINITIONS`:

```typescript
// Prompt Snippets
export type PromptSnippet = {
  id: string;
  name: string;
  trigger: string;
  template: string;
  enabled: boolean;
  builtin: boolean;
};

export type PromptSnippetsSetting = PromptSnippet[];
```

**Step 2: Add validator function**

Add after `isAiSkillSlotsSetting`:

```typescript
function isPromptSnippetsSetting(value: unknown): value is PromptSnippetsSetting {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.trigger === 'string' &&
      typeof item.template === 'string' &&
      typeof item.enabled === 'boolean' &&
      typeof item.builtin === 'boolean',
  );
}
```

**Step 3: Register in SETTINGS_DEFINITIONS**

Add to `SETTINGS_DEFINITIONS` object (before the closing `}` with `satisfies`):

```typescript
promptSnippets: {
  defaultValue: [] as PromptSnippetsSetting,
  validate: isPromptSnippetsSetting,
},
```

**Step 4: Verify**

Run: `pnpm ts-check`

**Step 5: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add PromptSnippet type and promptSnippets setting definition"
```

---

### Task 2: Create resolve-snippet-template utility

**Files:**
- Create: `src/lib/resolve-snippet-template.ts`

**Step 1: Create the utility**

```typescript
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
};

const VARIABLE_MAP: Record<string, (ctx: SnippetVariableContext) => string | null | undefined> = {
  'task.worktree.path': (ctx) => ctx.task?.worktreePath,
  'task.name': (ctx) => ctx.task?.name,
  'task.note': (ctx) => ctx.task?.note,
  'task.sourceBranch': (ctx) => ctx.task?.sourceBranch,
  'task.branch.name': (ctx) => ctx.task?.branchName,
  'project.name': (ctx) => ctx.project?.name,
  'project.path': (ctx) => ctx.project?.path,
};

export function resolveSnippetTemplate(
  template: string,
  context: SnippetVariableContext,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const resolver = VARIABLE_MAP[key];
    if (!resolver) return match;
    const value = resolver(context);
    return value ?? match;
  });
}

export function resolvePromptSnippet(
  snippet: PromptSnippet,
  context: SnippetVariableContext,
): string {
  return resolveSnippetTemplate(snippet.template, context);
}
```

**Step 2: Commit**

```bash
git add src/lib/resolve-snippet-template.ts
git commit -m "feat: add resolveSnippetTemplate utility for prompt snippet variable substitution"
```

---

### Task 3: Add usePromptSnippetsSetting hook

**Files:**
- Modify: `src/hooks/use-settings.ts`

**Step 1: Add import**

Add `PromptSnippetsSetting` to the import from `@shared/types`.

**Step 2: Add convenience hooks at end of file**

```typescript
// Convenience hooks for prompt snippets setting
export function usePromptSnippetsSetting() {
  return useSetting('promptSnippets');
}

export function useUpdatePromptSnippetsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: PromptSnippetsSetting) =>
      api.settings.set('promptSnippets', value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'promptSnippets'],
      });
    },
  });
}
```

**Step 3: Verify**

Run: `pnpm ts-check`

**Step 4: Commit**

```bash
git add src/hooks/use-settings.ts
git commit -m "feat: add usePromptSnippetsSetting hooks"
```

---

### Task 4: Integrate prompt snippets into PromptTextarea

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx`

**Step 1: Add imports**

```typescript
import type { PromptSnippet } from '@shared/types';
import type { SnippetVariableContext } from '@/lib/resolve-snippet-template';
import { resolvePromptSnippet } from '@/lib/resolve-snippet-template';
```

**Step 2: Add new DropdownItem variant**

Update `DropdownItem` type:

```typescript
type DropdownItem =
  | { type: 'command'; command: string; description: string }
  | { type: 'skill'; skill: Skill }
  | { type: 'file'; filePath: string }
  | { type: 'snippet'; snippet: PromptSnippet };
```

**Step 3: Add props to PromptTextareaProps**

```typescript
/** Prompt snippets from settings */
promptSnippets?: PromptSnippet[];
/** Context for resolving snippet variables */
snippetVariableContext?: SnippetVariableContext;
```

**Step 4: Destructure new props**

```typescript
promptSnippets = [],
snippetVariableContext,
```

**Step 5: Add snippets to filteredItems useMemo**

After skills fuzzy search block, add:

```typescript
// Fuzzy filter prompt snippets (only enabled ones)
const enabledSnippets = promptSnippets.filter((s) => s.enabled);
if (enabledSnippets.length > 0) {
  const matchedSnippets = searchText
    ? new Fuse(enabledSnippets, {
        keys: ['trigger', 'name'],
        threshold: 0.4,
        ignoreLocation: true,
      })
        .search(searchText)
        .map((r) => r.item)
    : enabledSnippets;
  for (const snippet of matchedSnippets) {
    items.push({ type: 'snippet', snippet });
  }
}
```

Add `promptSnippets` to dependency array.

**Step 6: Update selectItem for snippets**

In selectItem callback, add before the existing else:

```typescript
} else if (item.type === 'snippet') {
  const resolved = resolvePromptSnippet(
    item.snippet,
    snippetVariableContext ?? {},
  );
  onChange(resolved);
```

Add `snippetVariableContext` to useCallback dependency array.

**Step 7: Update item grouping and index calculation**

```typescript
const snippetItems = filteredItems.filter((item) => item.type === 'snippet');
```

Update `getItemIndex`:

```typescript
const getItemIndex = (
  type: 'file' | 'command' | 'snippet' | 'skill',
  localIndex: number,
) => {
  if (type === 'file') return localIndex;
  if (type === 'command') return fileItems.length + localIndex;
  if (type === 'snippet') return fileItems.length + commandItems.length + localIndex;
  return fileItems.length + commandItems.length + snippetItems.length + localIndex;
};
```

**Step 8: Add snippet section in dropdown JSX**

Between commands and skills sections:

```tsx
{/* Divider between commands and snippets */}
{commandItems.length > 0 && snippetItems.length > 0 && (
  <div className="border-glass-border my-1 border-t" />
)}

{/* Snippets section header */}
{snippetItems.length > 0 && (
  <div className="text-ink-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
    Snippets
  </div>
)}

{/* Snippets */}
{snippetItems.map((item, localIndex) => {
  if (item.type !== 'snippet') return null;
  const index = getItemIndex('snippet', localIndex);
  const { snippet } = item;
  return (
    <button
      key={snippet.id}
      type="button"
      data-index={index}
      onClick={() => selectItem(item)}
      onMouseEnter={() => setSelectedIndex(index)}
      className={clsx(
        'w-full px-3 py-1.5 text-left',
        index === selectedIndex
          ? 'bg-glass-medium'
          : 'hover:bg-glass-medium',
      )}
    >
      <div className="text-ink-1 text-xs font-medium">
        /{snippet.trigger}
      </div>
      <div className="text-ink-2 text-xs">{snippet.name}</div>
    </button>
  );
})}
```

Update existing divider before skills:

```tsx
{(commandItems.length > 0 || snippetItems.length > 0) && skillItems.length > 0 && (
  <div className="border-glass-border my-1 border-t" />
)}
```

**Step 9: Verify**

Run: `pnpm ts-check`

**Step 10: Commit**

```bash
git add src/features/common/ui-prompt-textarea/index.tsx
git commit -m "feat: integrate prompt snippets into autocomplete dropdown"
```

---

### Task 5: Pass prompt snippets to all PromptTextarea consumers

**Files:**
- Modify: `src/features/agent/ui-message-input/index.tsx`
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`
- Modify: `src/features/task/ui-task-panel/add-step-dialog.tsx`

**Step 1: Update MessageInput**

Add props:

```typescript
promptSnippets?: PromptSnippet[];
snippetVariableContext?: SnippetVariableContext;
```

Import types and pass through to `PromptTextarea`.

**Step 2: Update each consumer**

Each consumer that renders MessageInput or PromptTextarea directly:

```typescript
import { usePromptSnippetsSetting } from '@/hooks/use-settings';
import type { SnippetVariableContext } from '@/lib/resolve-snippet-template';

// In component:
const { data: promptSnippets = [] } = usePromptSnippetsSetting();

const snippetVariableContext: SnippetVariableContext = useMemo(() => ({
  task: task ? {
    worktreePath: task.worktreePath,
    name: task.name,
    note: task.prompt,
    sourceBranch: task.sourceBranch,
    branchName: task.branchName,
  } : undefined,
  project: project ? {
    name: project.name,
    path: project.path,
  } : undefined,
}), [task, project]);
```

Pass `promptSnippets` and `snippetVariableContext` to MessageInput/PromptTextarea.

**Step 3: Verify**

Run: `pnpm ts-check`

**Step 4: Commit**

```bash
git add src/features/agent/ui-message-input/index.tsx src/features/new-task/ui-new-task-overlay/index.tsx src/features/task/ui-task-panel/add-step-dialog.tsx
git commit -m "feat: pass prompt snippets and variable context to all textarea consumers"
```

---

### Task 6: Create Prompt Snippets settings UI

**Files:**
- Create: `src/features/settings/ui-prompt-snippets-settings/index.tsx`

**Step 1: Create the settings component**

```typescript
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import {
  usePromptSnippetsSetting,
  useUpdatePromptSnippetsSetting,
} from '@/hooks/use-settings';
import type { PromptSnippet } from '@shared/types';

const AVAILABLE_VARIABLES = [
  '{task.worktree.path}',
  '{task.name}',
  '{task.note}',
  '{task.sourceBranch}',
  '{task.branch.name}',
  '{project.name}',
  '{project.path}',
];

function generateId(): string {
  return crypto.randomUUID();
}

export function PromptSnippetsSettings() {
  const { data: snippets = [] } = usePromptSnippetsSetting();
  const updateSnippets = useUpdatePromptSnippetsSetting();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = () => {
    const newSnippet: PromptSnippet = {
      id: generateId(),
      name: '',
      trigger: '',
      template: '',
      enabled: true,
      builtin: false,
    };
    updateSnippets.mutate([...snippets, newSnippet]);
    setEditingId(newSnippet.id);
  };

  const handleUpdate = useCallback(
    (id: string, updates: Partial<Omit<PromptSnippet, 'id' | 'builtin'>>) => {
      const updated = snippets.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      );
      updateSnippets.mutate(updated);
    },
    [snippets, updateSnippets],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const snippet = snippets.find((s) => s.id === id);
      if (snippet?.builtin) return; // Can't delete builtins
      updateSnippets.mutate(snippets.filter((s) => s.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [snippets, updateSnippets, editingId],
  );

  const handleToggle = useCallback(
    (id: string) => {
      const updated = snippets.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      updateSnippets.mutate(updated);
    },
    [snippets, updateSnippets],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ink-1 text-sm font-medium">Prompt Snippets</h3>
          <p className="text-ink-3 text-xs">
            Create reusable prompt templates triggered by / in the input
          </p>
        </div>
        <Button onClick={handleCreate} size="sm" icon={<Plus />}>
          Add Snippet
        </Button>
      </div>

      {snippets.length === 0 && (
        <p className="text-ink-3 py-8 text-center text-sm">
          No prompt snippets yet. Click &ldquo;Add Snippet&rdquo; to create one.
        </p>
      )}

      <div className="space-y-2">
        {snippets.map((snippet) => (
          <div
            key={snippet.id}
            className="border-glass-border rounded-lg border p-3"
          >
            {editingId === snippet.id ? (
              <SnippetForm
                snippet={snippet}
                onUpdate={(updates) => handleUpdate(snippet.id, updates)}
                onDelete={() => handleDelete(snippet.id)}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setEditingId(snippet.id)}
                >
                  <span className="text-ink-1 text-sm font-medium">
                    /{snippet.trigger || '...'}
                  </span>
                  <span className="text-ink-3 ml-2 text-sm">
                    {snippet.name}
                  </span>
                  {snippet.builtin && (
                    <span className="bg-glass-medium text-ink-3 ml-2 rounded px-1.5 py-0.5 text-xs">
                      builtin
                    </span>
                  )}
                </button>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={snippet.enabled}
                    onChange={() => handleToggle(snippet.id)}
                    className="accent-acc h-3.5 w-3.5"
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnippetForm({
  snippet,
  onUpdate,
  onDelete,
  onDone,
}: {
  snippet: PromptSnippet;
  onUpdate: (updates: Partial<Omit<PromptSnippet, 'id' | 'builtin'>>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Trigger</label>
          <div className="flex items-center">
            <span className="text-ink-3 mr-1 text-sm">/</span>
            <input
              type="text"
              value={snippet.trigger}
              onChange={(e) =>
                onUpdate({
                  trigger: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-'),
                })
              }
              placeholder="my-snippet"
              className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
              disabled={snippet.builtin}
            />
          </div>
        </div>
        <div>
          <label className="text-ink-2 mb-1 block text-xs">Name</label>
          <input
            type="text"
            value={snippet.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="My Snippet"
            className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1 text-sm focus:outline-none"
            disabled={snippet.builtin}
          />
        </div>
      </div>
      <div>
        <label className="text-ink-2 mb-1 block text-xs">Template</label>
        <textarea
          value={snippet.template}
          onChange={(e) => onUpdate({ template: e.target.value })}
          placeholder="Review the changes on branch {task.branch.name} in {task.worktree.path}..."
          rows={4}
          className="border-glass-border bg-bg-2 text-ink-1 placeholder-ink-3 w-full rounded border px-2 py-1.5 text-sm focus:outline-none"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {AVAILABLE_VARIABLES.map((v) => (
            <span
              key={v}
              className="bg-glass-light text-ink-3 rounded px-1.5 py-0.5 font-mono text-xs"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        {!snippet.builtin ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        ) : (
          <span />
        )}
        <Button onClick={onDone} size="sm">
          Done
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/settings/ui-prompt-snippets-settings/index.tsx
git commit -m "feat: add Prompt Snippets settings UI component"
```

---

### Task 7: Register Prompt Snippets tab in settings overlay

**Files:**
- Modify: `src/features/settings/ui-settings-overlay/index.tsx`

**Step 1: Add import**

```typescript
import { PromptSnippetsSettings } from '@/features/settings/ui-prompt-snippets-settings';
```

**Step 2: Add to GlobalMenuItem type**

Add `'prompt-snippets'` to the union.

**Step 3: Add to GLOBAL_MENU_ITEMS**

Insert after `'skills'` entry:

```typescript
{
  id: 'prompt-snippets',
  label: 'Snippets',
  icon: Terminal,
  title: 'Prompt Snippets',
  subtitle: 'Reusable prompt templates with variables',
},
```

**Step 4: Add render case**

```typescript
{activeTab === 'prompt-snippets' && <PromptSnippetsSettings />}
```

**Step 5: Verify**

Run: `pnpm ts-check`

**Step 6: Commit**

```bash
git add src/features/settings/ui-settings-overlay/index.tsx
git commit -m "feat: add Prompt Snippets tab to settings overlay"
```

---

### Task 8: Final verification

**Step 1:** `pnpm install`
**Step 2:** `pnpm lint --fix`
**Step 3:** `pnpm ts-check`
**Step 4:** `pnpm lint`
**Step 5:** Fix remaining issues, commit.
