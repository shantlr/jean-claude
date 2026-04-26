# Skills Registry Inline Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the separate registry browser modal with an inline "Browse" mode that reuses the existing skill rail + detail pane layout.

**Architecture:** The skill rail gets a mode toggle (Installed / Browse). In Browse mode, the rail shows a search input + registry results list using the same `SkillRow`-style rows. Selecting a registry skill shows its content in the detail pane using a new `RegistrySkillDetails` component (matching the existing `SkillDetails` layout but with install controls instead of edit). Shared row components are extracted for reuse.

**Tech Stack:** React, TypeScript, Tailwind, TanStack Query (existing hooks: `useRegistrySearch`, `useRegistrySkillContent`, `useInstallRegistrySkill`)

---

### Task 1: Extract shared SkillRow into its own file

The `SkillRow` and `GroupHeader` components in `skill-rail.tsx` are currently internal. Extract them so they can be reused by both the installed list and registry results list.

**Files:**
- Create: `src/features/settings/ui-skills-settings/skill-row.tsx`
- Modify: `src/features/settings/ui-skills-settings/skill-rail.tsx`

**Step 1: Create `skill-row.tsx`**

Extract `SkillRow` and `GroupHeader` into a new file. Make `SkillRow` slightly more generic — accept `icon`, `label`, `isActive`, `isEnabled`, `suffix` (for install count badge etc.), and `onClick`.

```tsx
// skill-row.tsx
import clsx from 'clsx';
import { Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function SkillRow({
  label,
  isActive,
  isEnabled = true,
  suffix,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isEnabled?: boolean;
  suffix?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
        isActive
          ? 'border-acc bg-acc-soft text-ink-0 border-l-2 font-medium'
          : 'text-ink-2 hover:bg-glass-light hover:text-ink-1 border-l-2 border-transparent',
      )}
    >
      <Wand2
        size={14}
        className={clsx('shrink-0', isEnabled ? 'text-acc-ink' : 'text-ink-4')}
      />
      <span className="truncate">{label}</span>
      {suffix && <span className="ml-auto shrink-0">{suffix}</span>}
    </button>
  );
}

export function GroupHeader({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={clsx(
        'px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-wider uppercase',
        accent ? 'text-acc' : 'text-ink-3',
      )}
    >
      {label}
    </div>
  );
}
```

**Step 2: Update `skill-rail.tsx`**

Remove the internal `SkillRow` and `GroupHeader`. Import from `./skill-row`. Pass `label={skill.name}`, `isEnabled={isAnyBackendEnabled(skill)}`, `onClick={() => onSelect(skill.skillPath)}`.

**Step 3: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 4: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-row.tsx src/features/settings/ui-skills-settings/skill-rail.tsx
git commit -m "refactor(skills): extract SkillRow and GroupHeader into shared file"
```

---

### Task 2: Add rail mode toggle (Installed / Browse)

Add a segmented toggle at the top of the skill rail that switches between showing installed skills and showing registry search results.

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-rail.tsx`
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Add mode state to index.tsx**

Add `railMode` state (`'installed' | 'browse'`) to `SkillsSettings`. The `onBrowse` callback now toggles this mode instead of opening the modal. Pass `railMode` and `onModeChange` to `SkillRail`.

Remove `showRegistryBrowser` state entirely. Remove the `SkillRegistryBrowser` modal rendering. Remove the `SkillRegistryBrowser` import.

**Step 2: Update SkillRail props and render**

Add props: `mode: 'installed' | 'browse'`, `onModeChange: (mode) => void`.

Replace the header "Skills" label + count with a segmented toggle:
- Two buttons: "Installed" (with count badge) and "Browse"
- Active tab gets `bg-acc-soft text-acc-ink` styling
- Keep the Browse/Bot/Add action buttons only in "installed" mode header

When `mode === 'browse'`, render a search input + results list (next task).

When `mode === 'installed'`, render the current skill groups.

Remove `onBrowse` prop (no longer needed — browse is now a mode, not a separate action).

**Step 3: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 4: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-rail.tsx src/features/settings/ui-skills-settings/index.tsx
git commit -m "feat(skills): add installed/browse mode toggle to skill rail"
```

---

### Task 3: Registry search results in the rail

When rail mode is "browse", show a search input and list registry results using `SkillRow`.

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-rail.tsx`
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Add registry search to the rail**

In `SkillRail`, when `mode === 'browse'`:
- Show a search `<input>` below the header (styled with `bg-bg-1 border-glass-border text-ink-1 text-sm rounded px-3 py-1.5`)
- Use local state for `searchInput` with 300ms debounce → `debouncedQuery`
- Call `useRegistrySearch(debouncedQuery || 'skill')` — the default query shows popular skills
- Render results as `SkillRow` items with `label={skill.name}`, `suffix` showing install count chip
- Mark already-installed skills with a green dot or "Installed" chip suffix

Add props: `selectedRegistrySkillId: string | null`, `onSelectRegistrySkill: (skill: RegistrySkill) => void`.

**Step 2: Wire up in index.tsx**

Add `selectedRegistrySkill` state. Pass it down. When a registry skill is selected, show its details in the right pane (next task handles the detail component).

**Step 3: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 4: Commit**

```bash
git add src/features/settings/ui-skills-settings/skill-rail.tsx src/features/settings/ui-skills-settings/index.tsx
git commit -m "feat(skills): show registry search results in browse mode rail"
```

---

### Task 4: Registry skill detail pane

Create `RegistrySkillDetails` — a detail pane for registry skills matching the `SkillDetails` layout but with install controls.

**Files:**
- Create: `src/features/settings/ui-skills-settings/registry-skill-details.tsx`
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Create RegistrySkillDetails**

Layout mirrors `SkillDetails`:
- **Header**: Wand2 icon + skill name (same as SkillDetails header)
- **Metadata strip**: Install count chip, source chip, link to skills.sh
- **Body**: Markdown content from `useRegistrySkillContent(skill.source, skill.skillId)`
  - Show loading spinner while fetching
  - Render with `<MarkdownContent>` in `text-xs leading-relaxed` wrapper (same as SkillDetails read mode)
- **Footer bar** (sticky at bottom): Backend checkboxes (Claude Code, OpenCode) + Install button
  - If already installed, show green "Installed" state
  - Uses `useInstallRegistrySkill()` mutation

Props:
```tsx
{
  skill: RegistrySkill;
  installedNames: Set<string>;
}
```

**Step 2: Wire up in index.tsx**

When `railMode === 'browse'` and a registry skill is selected, render `<RegistrySkillDetails>` instead of `<SkillDetails>` in the detail pane slot.

Compute `installedNames` set from `skills` data (same as old registry browser did).

**Step 3: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 4: Commit**

```bash
git add src/features/settings/ui-skills-settings/registry-skill-details.tsx src/features/settings/ui-skills-settings/index.tsx
git commit -m "feat(skills): add inline registry skill detail pane with install controls"
```

---

### Task 5: Delete old registry browser modal

Clean up the old modal-based registry browser.

**Files:**
- Delete: `src/features/settings/ui-skills-settings/skill-registry-browser.tsx`
- Modify: `src/features/settings/ui-skills-settings/index.tsx` (remove any remaining references)

**Step 1: Delete `skill-registry-browser.tsx`**

**Step 2: Verify no remaining imports**

```bash
grep -r "skill-registry-browser\|SkillRegistryBrowser" src/
```

Clean up any stale references.

**Step 3: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 4: Commit**

```bash
git add -u
git commit -m "refactor(skills): remove old modal-based registry browser"
```

---

### Task 6: Polish and edge cases

**Files:**
- Modify: `src/features/settings/ui-skills-settings/skill-rail.tsx`
- Modify: `src/features/settings/ui-skills-settings/index.tsx`

**Step 1: Auto-switch to browse mode when no skills exist**

If `builtinSkills + mySkills + installedSkills` is empty, default `railMode` to `'browse'`.

**Step 2: After installing a registry skill, switch back to installed mode**

In the `onInstalled` callback from `RegistrySkillDetails`, switch `railMode` to `'installed'` and select the newly installed skill.

**Step 3: Keyboard shortcut**

Register `cmd+shift+b` to toggle browse mode (replacing the old "open registry browser" command).

**Step 4: Run lint + ts-check**

```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 5: Commit**

```bash
git add src/features/settings/ui-skills-settings/
git commit -m "feat(skills): polish browse mode UX and keyboard shortcut"
```
