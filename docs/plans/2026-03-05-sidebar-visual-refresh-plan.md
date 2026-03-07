# Sidebar Visual Refresh — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the main sidebar with refined spacing, project color accents, micro-interactions, and updated typography — without structural changes.

**Architecture:** Pure CSS/Tailwind + React component updates across 7 files. No new dependencies, no state changes, no IPC changes. All changes are visual — spacing, colors, transitions, and animations.

**Tech Stack:** React, Tailwind CSS v4 (`@utility` syntax), clsx, lucide-react

**Design doc:** `docs/plans/2026-03-05-sidebar-visual-refresh-design.md`

---

### Task 1: Add Card Enter Animation to CSS

**Files:**
- Modify: `src/index.css` (append after line 469)

**Step 1: Add the keyframes and utility class**

Add at the end of `src/index.css`, before the closing:

```css
/* ── Sidebar: card enter animation (fade + slide from left) ── */
@keyframes sidebar-card-enter {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@utility sidebar-card-enter {
  animation: sidebar-card-enter 200ms ease-out both;
}
```

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "style: add sidebar card enter animation keyframes"
```

---

### Task 2: Refine Sidebar Container

**Files:**
- Modify: `src/layout/ui-main-sidebar/index.tsx`

**Step 1: Add right border to sidebar and refine resize handle**

In `index.tsx`, update the `<aside>` className from:
```
'relative flex h-full shrink-0 flex-col bg-neutral-900'
```
to:
```
'relative flex h-full shrink-0 flex-col bg-neutral-900 border-r border-neutral-800'
```

Update the resize handle `<div>` className from:
```
'absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50'
```
to:
```
'absolute top-0 right-0 h-full w-0.5 cursor-col-resize transition-all duration-150 hover:w-1 hover:bg-blue-500/50'
```

And the dragging state from `'bg-blue-500/50'` to `'w-1 bg-blue-500/50'`.

**Step 2: Commit**

```bash
git add src/layout/ui-main-sidebar/index.tsx
git commit -m "style: add sidebar right border, refine resize handle"
```

---

### Task 3: Refine Task Summary Card

**Files:**
- Modify: `src/features/task/ui-task-summary-card/index.tsx`

This is the largest change. The card gets project color accent, updated spacing, typography, hover micro-interaction, and enter animation.

**Step 1: Add project color accent border**

The `task` prop is `TaskWithProject` which already has `projectColor: string`. Use it for a left border.

Update the outer `<div>` to add:
- `style={{ borderLeftColor: task.projectColor }}` for the accent color
- Change the base `border border-transparent` to `border-l-2 border-transparent` so the left border is thicker
- Add dynamic left-border opacity via a CSS variable: `style={{ borderLeftColor: task.projectColor, '--accent-opacity': isSelected ? '1' : undefined } as React.CSSProperties}`

Actually, simpler approach — use inline style for the left border color and control opacity via Tailwind classes:

Replace the card's outer `<div>` className logic. The current border classes in the non-animated states are:
- Selected: `'border border-blue-500 bg-neutral-700'`
- Default: `'border border-transparent hover:bg-neutral-800'`

Change the **entire className** of the outer div to:

```tsx
className={clsx(
  // Base card styles
  'flex cursor-pointer flex-col gap-1.5 rounded-lg px-3.5 py-2.5',
  'border-l-2 transition-all duration-200 ease-out',
  'sidebar-card-enter',
  isDeleting && 'opacity-50',
  // Border animation states (these override border styling)
  hasPendingPermission
    ? isSelected
      ? 'permission-border-selected'
      : 'permission-border'
    : hasPendingQuestion
      ? isSelected
        ? 'question-border-selected'
        : 'question-border'
      : task.status === 'running'
        ? isSelected
          ? 'running-border-selected'
          : 'running-border'
        : task.hasUnread && task.status === 'completed'
          ? isSelected
            ? 'completed-unread-border-selected'
            : 'completed-unread-border'
          : isSelected
            ? 'border border-blue-500 bg-neutral-800 shadow-sm'
            : 'border border-transparent hover:bg-neutral-800/70 hover:translate-x-0.5',
)}
```

Add inline style for the left border color (only on non-animated states):

```tsx
style={{
  borderLeftColor:
    !hasPendingPermission &&
    !hasPendingQuestion &&
    task.status !== 'running' &&
    !(task.hasUnread && task.status === 'completed')
      ? task.projectColor
      : undefined,
  borderLeftWidth:
    !hasPendingPermission &&
    !hasPendingQuestion &&
    task.status !== 'running' &&
    !(task.hasUnread && task.status === 'completed')
      ? '2px'
      : undefined,
  opacity: isDeleting ? 0.5 : undefined,
}}
```

Note: The animated border utilities (`running-border`, etc.) use `border: 1px solid transparent` which will override the inline left border, which is exactly what we want — animated states take full control.

**Step 2: Update typography**

Task name span — change from:
```tsx
<span className="min-w-0 flex-1 truncate text-sm font-medium">
```
to:
```tsx
<span className="min-w-0 flex-1 truncate text-sm font-semibold">
```

Metadata row — change from:
```tsx
<div className="flex items-center gap-2 text-xs text-neutral-400">
```
to:
```tsx
<div className="flex items-center gap-2 text-[11px] text-neutral-500">
```

Time span — add `tabular-nums`:
```tsx
<span className="ml-auto shrink-0 tabular-nums">
```

**Step 3: Commit**

```bash
git add src/features/task/ui-task-summary-card/index.tsx
git commit -m "style: refine task card with color accents, spacing, typography"
```

---

### Task 4: Refine Task List (Spacing, Sections, Footer, Empty State)

**Files:**
- Modify: `src/features/task/ui-task-list/index.tsx`

**Step 1: Add ListTodo import**

Add `ListTodo` to the lucide-react import:
```tsx
import { ChevronDown, ClipboardList, ListTodo, SlidersHorizontal } from 'lucide-react';
```

**Step 2: Update divider styling**

Change the tabs/content divider from:
```tsx
<div className="mx-2 border-b border-neutral-800" />
```
to:
```tsx
<div className="mx-2 border-b border-neutral-700/30" />
```

**Step 3: Update task list container spacing and scroll behavior**

Change the task cards container from:
```tsx
<div className="flex-1 space-y-1 overflow-y-auto p-2">
```
to:
```tsx
<div className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2 py-2.5" style={{ maskImage: 'linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)' }}>
```

**Step 4: Refine "Completed" section header**

Change from:
```tsx
<div className="flex items-center gap-2 px-1 pt-4 pb-1">
  <span className="text-xs font-medium text-neutral-500">
    Completed
  </span>
  <div className="h-px flex-1 bg-neutral-800" />
</div>
```
to:
```tsx
<div className="flex items-center gap-2 px-1 pt-4 pb-1">
  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
    Completed
  </span>
  <div className="h-px flex-1 bg-neutral-800" />
</div>
```

**Step 5: Refine empty state**

Change from:
```tsx
<div className="py-8 text-center text-sm text-neutral-500">
  No active tasks
</div>
```
to:
```tsx
<div className="flex flex-col items-center gap-2 py-12 text-center">
  <ListTodo className="h-6 w-6 text-neutral-700" />
  <span className="text-sm text-neutral-600">No active tasks</span>
  <span className="text-[11px] text-neutral-700">Press ⌘N to create a task</span>
</div>
```

**Step 6: Refine footer divider and buttons**

Replace the footer divider from:
```tsx
<div className="mx-2 border-t border-neutral-800" />
```
to:
```tsx
<div className="mx-2 h-2 bg-gradient-to-t from-neutral-900 to-transparent" />
```

Update Backlog button classes from:
```tsx
className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
```
to:
```tsx
className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-white"
```

Update Backlog badge from:
```tsx
<span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs leading-none text-neutral-300">
```
to:
```tsx
<span className="rounded-full bg-neutral-700/60 px-1.5 py-0.5 text-xs leading-none text-neutral-400">
```

Update Settings button classes from:
```tsx
className="flex grow items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
```
to:
```tsx
className="flex grow items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-white"
```

**Step 7: Commit**

```bash
git add src/features/task/ui-task-list/index.tsx
git commit -m "style: refine task list spacing, section headers, footer, empty state"
```

---

### Task 5: Update Tab Indicator Style

**Files:**
- Modify: `src/features/project/ui-sidebar-content-tabs/index.tsx`

**Step 1: Switch tabs from filled pills to bottom indicator**

Replace both button classNames. Active tab style from:
```
'bg-neutral-700 text-white'
```
to:
```
'border-b-2 border-blue-500/70 text-white font-semibold'
```

Inactive tab style from:
```
'text-neutral-400 hover:bg-neutral-800 hover:text-white'
```
to:
```
'border-b-2 border-transparent text-neutral-500 hover:text-neutral-300'
```

Update the shared base classes for both buttons from:
```
'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors'
```
to:
```
'flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs transition-colors duration-150'
```

(Remove `rounded` since we're using bottom border now, remove `font-medium` from base since active tab has `font-semibold`.)

**Step 2: Commit**

```bash
git add src/features/project/ui-sidebar-content-tabs/index.tsx
git commit -m "style: switch sidebar tabs to bottom indicator style"
```

---

### Task 6: Add Transition to Status Indicator

**Files:**
- Modify: `src/features/task/ui-status-indicator/index.tsx`

**Step 1: Add transition-colors to the status dot**

In the `StatusIndicator` component, change the base className from:
```tsx
`inline-block h-2 w-2 rounded-full`
```
to:
```tsx
`inline-block h-2 w-2 rounded-full transition-colors duration-300`
```

**Step 2: Commit**

```bash
git add src/features/task/ui-status-indicator/index.tsx
git commit -m "style: add smooth color transition to status indicators"
```

---

### Task 7: Soften Kbd Component

**Files:**
- Modify: `src/common/ui/kbd/index.tsx`

**Step 1: Reduce contrast of keyboard shortcut badges**

Change the `<kbd>` className from:
```
'rounded border border-neutral-600 bg-neutral-700/50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400'
```
to:
```
'rounded border border-neutral-700 bg-neutral-800/50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500'
```

Changes: `border-neutral-600` → `border-neutral-700` (darker border), `bg-neutral-700/50` → `bg-neutral-800/50` (darker fill), `text-neutral-400` → `text-neutral-500` (lower contrast text). This makes badges feel embedded rather than overlaid.

**Step 2: Commit**

```bash
git add src/common/ui/kbd/index.tsx
git commit -m "style: soften Kbd badges for more embedded feel"
```

---

### Task 8: Verify and Final Commit

**Step 1: Install dependencies**

```bash
pnpm install
```

**Step 2: Run lint with auto-fix**

```bash
pnpm lint --fix
```

Expected: auto-fixes applied, no remaining errors.

**Step 3: Run TypeScript check**

```bash
pnpm ts-check
```

Expected: no type errors (all changes are className/style, no type changes).

**Step 4: Run lint again**

```bash
pnpm lint
```

Expected: clean pass, no errors.

**Step 5: If any fixes were needed, commit**

```bash
git add -A
git commit -m "chore: fix lint issues from sidebar visual refresh"
```
