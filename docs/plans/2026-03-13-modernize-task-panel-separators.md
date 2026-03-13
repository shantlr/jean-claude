# Modernize Task Panel Separators — Raycast-Inspired

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hard `border-neutral-700` separators throughout the task panel with Raycast-style gradient fades, background elevation shifts, and subtle shadows for a modern, clean look.

**Architecture:** Create reusable CSS utilities and a `<Separator>` component, then systematically replace border-based separators across the task panel. Three separation techniques: (1) gradient-fade lines for horizontal/vertical dividers, (2) background color shifts for header/toolbar areas, (3) soft shadows for floating side panels. Keep semantic borders (purple user messages, status-colored step chips) untouched.

**Tech Stack:** Tailwind CSS v4 (`@utility` directives in `src/index.css`), React components

---

## Design Tokens

Before implementation, here are the exact values to use consistently:

| Token | Value | Usage |
|---|---|---|
| Gradient separator | `from-transparent via-white/[0.06] to-transparent` | Horizontal/vertical fade lines |
| Header bg | `bg-white/[0.02]` | Subtle elevation for header bar |
| Step flow bg | Keep existing `bg-neutral-900/60 backdrop-blur-sm` | Already good |
| Side panel shadow | `shadow-[inset_1px_0_0_0_rgba(255,255,255,0.04)]` | Replaces `border-l` on right panes |
| Nesting thread | `bg-white/[0.06] rounded-full` (absolute positioned, `w-px`, top/bottom inset `4px`) | Replaces `border-l` on expanded content |

---

### Task 1: Add CSS utilities and Separator component

**Files:**
- Modify: `src/index.css` (add utilities at the end, before closing)
- Create: `src/common/ui/separator/index.tsx`

**Step 1: Add gradient separator utilities to index.css**

Append these utilities at the end of `src/index.css`:

```css
@utility separator-h {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.06), transparent);
}

@utility separator-v {
  width: 1px;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.06), transparent);
}

@utility panel-edge-shadow {
  box-shadow: inset 1px 0 0 0 rgba(255, 255, 255, 0.04);
}
```

**Step 2: Create the Separator component**

Create `src/common/ui/separator/index.tsx`:

```tsx
export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return orientation === 'horizontal' ? (
    <div role="separator" className={`separator-h ${className ?? ''}`} />
  ) : (
    <div role="separator" className={`separator-v self-stretch ${className ?? ''}`} />
  );
}
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 2: Task panel header — replace border with bg shift + gradient separator

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (~line 791-794)

**Step 1: Replace the header border**

Find (line ~791-794):
```tsx
className={clsx(
  'flex items-center gap-3 border-b border-neutral-700 px-3',
  TASK_PANEL_HEADER_HEIGHT_CLS,
)}
```

Replace with:
```tsx
className={clsx(
  'flex items-center gap-3 bg-white/[0.02] px-3',
  TASK_PANEL_HEADER_HEIGHT_CLS,
)}
```

**Step 2: Add a Separator below the header div**

After the closing `</div>` of the header, insert:
```tsx
<Separator />
```

Add the import at the top:
```tsx
import { Separator } from '@/common/ui/separator';
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 3: Step flow bar — replace border-b with gradient separator

**Files:**
- Modify: `src/features/task/ui-step-flow-bar/index.tsx` (~line 203)

**Step 1: Remove border-b from step flow bar container**

Find (line ~203):
```tsx
<div className="border-b border-white/[0.06] bg-neutral-900/60 px-4 py-0.5 backdrop-blur-sm">
```

Replace with:
```tsx
<div className="bg-neutral-900/60 px-4 py-0.5 backdrop-blur-sm">
```

**Step 2: Add Separator after the closing div**

The parent component that renders `<StepFlowBar>` should add a `<Separator />` after it. However, since the step flow bar is a self-contained component, add the separator inside, after the scrollable content div.

Find (line ~237-238):
```tsx
      </div>
    </div>
```

Replace the outer closing with:
```tsx
      </div>
      <Separator className="absolute right-0 bottom-0 left-0" />
    </div>
```

Make the container `relative`:
```tsx
<div className="relative bg-neutral-900/60 px-4 py-0.5 backdrop-blur-sm">
```

Add import:
```tsx
import { Separator } from '@/common/ui/separator';
```

**Step 3: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 4: Right-side panes — replace border-l with panel-edge-shadow

These 5 panes all follow the same pattern: `border-l border-neutral-700` on the outer container, `border-b border-neutral-700` on the header.

**Files:**
- Modify: `src/features/task/ui-task-panel/file-explorer-pane/index.tsx`
- Modify: `src/features/task/ui-task-panel/command-logs-pane/index.tsx`
- Modify: `src/features/task/ui-task-panel/task-settings-pane.tsx`
- Modify: `src/features/task/ui-task-panel/tool-diff-preview-pane.tsx`
- Modify: `src/features/task/ui-task-panel/debug-messages-pane.tsx`

**Step 1: For each pane, replace the outer container border**

In each file, find:
```
border-l border-neutral-700
```

Replace with:
```
panel-edge-shadow
```

**Step 2: For each pane, replace header border-b with Separator**

In each file, find the header div with `border-b border-neutral-700` and:
1. Remove `border-b border-neutral-700` from the className
2. Add `<Separator />` after the header div's closing tag

Add import to each file:
```tsx
import { Separator } from '@/common/ui/separator';
```

**Step 3: File explorer inner border**

In `file-explorer-pane/index.tsx`, find the inner `border-l border-neutral-700` (divider between tree and content viewer, ~line 161). Replace with `panel-edge-shadow`.

**Step 4: Command logs tab bar border**

In `command-logs-pane/index.tsx`, find the tab bar `border-b border-neutral-700` (~line 136). Replace with a `<Separator />` after the tab bar div.

**Step 5: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 5: Nesting thread lines — replace border-l with subtle positioned thread

The timeline uses `border-l border-neutral-700 pl-3` for expanded content nesting. Replace with a more refined "thread indicator" — a short, rounded, subtle line.

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` (~line 275)
- Modify: `src/features/agent/ui-message-stream/ui-subagent-entry/index.tsx` (~lines 197, 224)
- Modify: `src/features/agent/ui-message-stream/ui-skill-entry/index.tsx` (~line 63)

**Step 1: Timeline entry expanded content**

Find (~line 275):
```tsx
<div className="mt-2 ml-5 border-l border-neutral-700 pl-3">
```

Replace with:
```tsx
<div className="relative mt-2 ml-5 pl-4">
  <div className="absolute top-1 bottom-1 left-1.5 w-px rounded-full bg-white/[0.06]" />
```

And keep the rest of the content + closing `</div>`, adding one extra `</div>` to close the new wrapper.

**Step 2: Subagent entry expanded timeline**

Find (~line 197):
```tsx
<div className="mb-2 ml-5 border-l border-neutral-700 pl-0">
```

Replace with:
```tsx
<div className="relative mb-2 ml-5 pl-1">
  <div className="absolute top-1 bottom-1 left-0 w-px rounded-full bg-white/[0.06]" />
```

**Step 3: Subagent empty state**

Find (~line 224):
```tsx
<div className="mb-2 ml-5 border-l border-neutral-700 pl-3 text-xs text-neutral-500">
```

Replace with:
```tsx
<div className="relative mb-2 ml-5 pl-4 text-xs text-neutral-500">
  <div className="absolute top-1 bottom-1 left-1.5 w-px rounded-full bg-white/[0.06]" />
```

**Step 4: Skill entry expanded content**

Find (~line 63):
```tsx
<div className="mb-2 ml-5 border-l border-neutral-700 pr-3 pl-3">
```

Replace with:
```tsx
<div className="relative mb-2 ml-5 pr-3 pl-4">
  <div className="absolute top-1 bottom-1 left-1.5 w-px rounded-full bg-white/[0.06]" />
```

**Step 5: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 6: Debug messages pane — internal separators

**Files:**
- Modify: `src/features/task/ui-task-panel/debug-messages-pane.tsx`

**Step 1: Search section and legend section borders**

Find all remaining `border-b border-neutral-700` instances in the debug pane (search section ~line 497, legend ~line 508). Replace each with a `<Separator className="my-1" />` element.

**Step 2: Card expanded header border**

Find the conditional `border-b border-neutral-700` on expanded card headers (~line 248). Replace with a `<Separator />` placed after the header content.

**Step 3: JSON tree nesting borders**

Find `border-l border-neutral-700` used for JSON tree indentation (~lines 161, 216). Replace with the thread-line pattern from Task 5:
```tsx
<div className="relative pl-4">
  <div className="absolute top-1 bottom-1 left-1.5 w-px rounded-full bg-white/[0.06]" />
```

**Step 4: Detail row borders**

Find `border-b border-neutral-700/50` on detail rows (~lines 305, 323) and `border-r border-neutral-700` side dividers (~line 304). For rows, replace with `<Separator />`. For the side divider, replace `border-r border-neutral-700` with an inline `<Separator orientation="vertical" />` between the two columns.

**Step 5: Run lint and ts-check**

```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 7: Final pass and visual verification

**Step 1: Search for remaining border-neutral-700 in task panel area**

```bash
rg "border-neutral-700" src/features/task/ src/features/agent/ui-message-stream/
```

Review each remaining instance. Some may be intentional (e.g., hover states on buttons like `hover:bg-neutral-700`). Only replace separator-style borders.

**Step 2: Run full lint + ts-check**

```bash
pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 3: Visual checklist**

Open the app and verify each area:
- [ ] Task header: subtle bg tint + gradient fade below
- [ ] Step flow bar: gradient fade at bottom, no hard line
- [ ] Right-side panes: soft inset shadow edge, gradient fade below headers
- [ ] Expanded tool entries: rounded thread lines, not hard borders
- [ ] Debug pane: gradient separators between sections
- [ ] User messages: purple left border still intact (semantic, do NOT change)
- [ ] Step chips: status-colored borders still intact (semantic, do NOT change)

---

## Summary of what NOT to change

These borders are **semantic** (they carry meaning, not just structure):

| Element | Border | Why keep |
|---|---|---|
| User message | `border-l-2 border-purple-500` | Identifies user messages |
| Step chips | `border border-emerald-800/50` etc. | Status indication |
| Add step button | `border border-dashed border-neutral-700/60` | Affordance (dashed = "add") |
| Running/permission/question borders | Various animated borders | Task status states |
| Inline code styling | `border border-cyan-700/50` etc. | Syntax highlighting |
