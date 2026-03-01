# Skills Card Grid with Backend Badge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the skills settings list UI with a card grid that merges skills from all backends and shows backend badges, removing the backend selector dropdown.

**Architecture:** Add a composite `useAllManagedSkills()` hook that fetches from both backends in parallel and merges results. Replace `skill-list.tsx` with a new `skill-card-grid.tsx` component using CSS Grid. Keep the existing two-pane layout (grid left, detail/form right). Add a backend selector inside the create form only.

**Tech Stack:** React, TanStack React Query, Tailwind CSS, Lucide icons

---

### Task 1: Add `useAllManagedSkills` hook

**Files:**
- Modify: `src/hooks/use-managed-skills.ts`

**Step 1: Add the composite hook**

Add the following hook at the end of `src/hooks/use-managed-skills.ts`:

```typescript
export function useAllManagedSkills(projectPath?: string) {
  const claude = useManagedSkills('claude-code', projectPath);
  const opencode = useManagedSkills('opencode', projectPath);

  const skills = useMemo(() => {
    const all = [...(claude.data ?? []), ...(opencode.data ?? [])];
    const seen = new Set<string>();
    return all.filter((s) => {
      if (seen.has(s.skillPath)) return false;
      seen.add(s.skillPath);
      return true;
    });
  }, [claude.data, opencode.data]);

  return {
    data: skills,
    isLoading: claude.isLoading || opencode.isLoading,
    isError: claude.isError || opencode.isError,
    error: claude.error ?? opencode.error,
  };
}
```

Add the `useMemo` import at the top of the file (add to existing imports from 'react' or add a new import).

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/hooks/use-managed-skills.ts
git commit -m "feat: add useAllManagedSkills composite hook"
```

---

### Task 2: Create `skill-card-grid.tsx` component

**Files:**
- Create: `src/features/settings/ui-skills-settings/skill-card-grid.tsx`

**Step 1: Create the card grid component**

Create `src/features/settings/ui-skills-settings/skill-card-grid.tsx` with the following content:

```tsx
import { Wand2 } from 'lucide-react';

import type { ManagedSkill } from '@shared/skill-types';

function backendLabel(backendType: string): string {
  switch (backendType) {
    case 'claude-code':
      return 'Claude Code';
    case 'opencode':
      return 'OpenCode';
    default:
      return backendType;
  }
}

function BackendBadge({ backendType }: { backendType: string }) {
  const isClaude = backendType === 'claude-code';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        isClaude
          ? 'bg-orange-900/30 text-orange-400'
          : 'bg-blue-900/30 text-blue-400'
      }`}
    >
      {backendLabel(backendType)}
    </span>
  );
}

function SourceBadge({ skill }: { skill: ManagedSkill }) {
  if (skill.source === 'plugin') {
    return (
      <span className="rounded bg-purple-900/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
        {skill.pluginName ?? 'Plugin'}
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
      {skill.source === 'user' ? 'User' : 'Project'}
    </span>
  );
}

export function SkillCardGrid({
  skills,
  selectedPath,
  onSelect,
}: {
  skills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
        No skills found.
        <br />
        Click &quot;Add&quot; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {skills.map((skill) => {
        const isSelected = selectedPath === skill.skillPath;

        return (
          <button
            key={skill.skillPath}
            type="button"
            onClick={() => onSelect(skill.skillPath)}
            className={`flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
              isSelected
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'
            } ${!skill.enabled ? 'opacity-60' : ''}`}
          >
            <div className="flex w-full items-center gap-2">
              <Wand2
                className={`h-4 w-4 shrink-0 ${skill.enabled ? 'text-purple-400' : 'text-neutral-600'}`}
              />
              <span className="truncate text-sm font-medium text-neutral-200">
                {skill.name}
              </span>
            </div>

            {skill.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-neutral-500">
                {skill.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              <BackendBadge backendType={skill.backendType} />
              <SourceBadge skill={skill} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-card-grid.tsx
git commit -m "feat: add SkillCardGrid component"
```

---

### Task 3: Update `skill-form.tsx` to include backend selector for create mode

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-form.tsx`

**Step 1: Add backend selector to create form**

When creating a new skill (not editing), the form needs a backend selector since we no longer have one in the parent. Add a `backendType` state inside the form that defaults to the prop but is changeable during create mode.

Replace the current `SkillForm` component to add a `useState` for `formBackendType` initialized from the prop, and add a backend selector field visible only when `!isEditing`:

After the existing `description` field (line 123), before the `content` field, add:

```tsx
{!isEditing && (
  <div>
    <label className="mb-1 block text-sm font-medium text-neutral-400">
      Backend
    </label>
    <select
      value={formBackendType}
      onChange={(e) =>
        setFormBackendType(e.target.value as AgentBackendType)
      }
      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
    >
      <option value="claude-code">Claude Code</option>
      <option value="opencode">OpenCode</option>
    </select>
    <p className="mt-1 text-xs text-neutral-500">
      Which agent backend this skill will be available to
    </p>
  </div>
)}
```

Also:
- Add `const [formBackendType, setFormBackendType] = useState(backendType);` after the existing `content` state (line 35)
- In `handleSave`, replace references to the `backendType` prop with `formBackendType` for the create path (the `createSkill.mutateAsync` call), keep the prop `backendType` for the edit path (`updateSkill.mutateAsync`)

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-form.tsx
git commit -m "feat: add backend selector to skill create form"
```

---

### Task 4: Update `skill-details.tsx` to show backend badge

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-details.tsx`

**Step 1: Add backend badge to the details view**

In the badges section (around line 49-55), add a backend badge alongside the existing source and enabled badges:

```tsx
<span
  className={`rounded px-2 py-1 ${
    skill.backendType === 'claude-code'
      ? 'bg-orange-900/30 text-orange-400'
      : 'bg-blue-900/30 text-blue-400'
  }`}
>
  {skill.backendType === 'claude-code' ? 'Claude Code' : 'OpenCode'}
</span>
```

Add this as the first badge in the existing `flex flex-wrap gap-2` container (before the source label badge).

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-details.tsx
git commit -m "feat: add backend badge to skill details panel"
```

---

### Task 5: Rewire `index.tsx` — remove backend selector, use card grid, merge all skills

**Files:**
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Rewrite the orchestrator**

Replace the full content of `index.tsx` with:

```tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  useAllManagedSkills,
  useDeleteSkill,
  useDisableSkill,
  useEnableSkill,
} from '@/hooks/use-managed-skills';
import type { ManagedSkill } from '@shared/skill-types';

import { SkillCardGrid } from './skill-card-grid';
import { SkillDetails } from './skill-details';
import { SkillForm } from './skill-form';

export function SkillsSettings() {
  const { data: skills, isLoading } = useAllManagedSkills();
  const deleteSkill = useDeleteSkill();
  const disableSkill = useDisableSkill();
  const enableSkill = useEnableSkill();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedSkill = skills?.find((s) => s.skillPath === selectedPath);

  const handleCreate = () => {
    setSelectedPath(null);
    setIsCreating(true);
  };

  const handleSelect = (skillPath: string) => {
    setIsCreating(false);
    setSelectedPath(skillPath);
  };

  const handleDelete = async (skillPath: string) => {
    const skill = skills?.find((s) => s.skillPath === skillPath);
    if (!skill) return;
    await deleteSkill.mutateAsync({
      skillPath,
      backendType: skill.backendType,
    });
    if (selectedPath === skillPath) setSelectedPath(null);
  };

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
      {/* Left: Card Grid */}
      <div className="min-w-0 flex-1 pb-2">
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

        <SkillCardGrid
          skills={skills ?? []}
          selectedPath={selectedPath}
          onSelect={handleSelect}
        />
      </div>

      {/* Right: Detail/Form pane */}
      {(isCreating || selectedSkill) && (
        <div className="w-96 flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          {isCreating ? (
            <SkillForm
              backendType="claude-code"
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill?.editable ? (
            <SkillForm
              skillPath={selectedSkill.skillPath}
              backendType={selectedSkill.backendType}
              scope="user"
              onClose={handleClose}
              onSaved={handleSaved}
            />
          ) : selectedSkill ? (
            <SkillDetails
              skill={selectedSkill}
              onClose={handleClose}
              onToggleEnabled={handleToggleEnabled}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
```

Key changes:
- Removed `backendType` state, `BACKENDS` constant, backend selector dropdown
- Replaced `useManagedSkills(backendType)` with `useAllManagedSkills()`
- Removed `userSkills`/`pluginSkills` grouping memo
- Replaced `<SkillList>` with `<SkillCardGrid>`
- Left pane is now `flex-1` (was `w-80`)
- Right pane is now `w-96 flex-shrink-0` (was `flex-1`)
- `handleDelete` now looks up the skill's own `backendType` from the merged list
- Pass `selectedSkill.backendType` when editing (instead of parent state)
- Pass `onToggleEnabled` to `SkillDetails` for read-only skills

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/index.tsx
git commit -m "feat: rewire skills settings to use card grid with merged backends"
```

---

### Task 6: Update `skill-details.tsx` to support enable/disable toggle

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-details.tsx`

**Step 1: Add enable/disable toggle to details panel**

Update the `SkillDetails` props to accept `onToggleEnabled`:

```tsx
export function SkillDetails({
  skill,
  onClose,
  onToggleEnabled,
}: {
  skill: ManagedSkill;
  onClose: () => void;
  onToggleEnabled?: (skill: ManagedSkill) => void;
}) {
```

Add a toggle button in the header area (next to close button) or in the badges section. Adding it next to the enabled/disabled badge is most natural. Replace the static enabled/disabled badge with a clickable toggle:

```tsx
{onToggleEnabled && (
  <button
    type="button"
    onClick={() => onToggleEnabled(skill)}
    className={`cursor-pointer rounded px-2 py-1 ${
      skill.enabled
        ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
        : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
    }`}
  >
    {skill.enabled ? 'Enabled' : 'Disabled'}
  </button>
)}
{!onToggleEnabled && (
  <span className="rounded bg-neutral-700 px-2 py-1 text-neutral-300">
    {skill.enabled ? 'Enabled' : 'Disabled'}
  </span>
)}
```

**Step 2: Verify TypeScript**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-details.tsx
git commit -m "feat: add enable/disable toggle to skill details panel"
```

---

### Task 7: Delete old `skill-list.tsx`

**Files:**
- Delete: `src/features/settings/ui-skills-settings/skill-list.tsx`

**Step 1: Remove the old list component**

```bash
rm src/features/settings/ui-skills-settings/skill-list.tsx
```

Verify no other files import from `skill-list.tsx`:

Run: `pnpm ts-check`
Expected: No errors (index.tsx no longer imports SkillList)

**Step 2: Commit**

```bash
git add -u src/features/settings/ui-skills-settings/skill-list.tsx
git commit -m "chore: remove unused skill-list component"
```

---

### Task 8: Lint and final verification

**Step 1: Run lint with auto-fix**

Run: `pnpm install && pnpm lint --fix`

**Step 2: Run TypeScript check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Fix any remaining issues**

If lint or ts-check report issues, fix them.

**Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for skills card grid"
```
