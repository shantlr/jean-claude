# New Task Overlay Visual Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the new-task overlay to match the aurora-glass design prototype (from Claude Design handoff), bringing the shell, project grid, toolbar, and all 3 steps up to the new visual standard.

**Architecture:** Pure visual/CSS restyling — no business logic changes. The existing component structure (NewTaskOverlay, ProjectGrid, SearchModeContent, PromptComposer) stays intact; we update Tailwind classes and add targeted inline styles for oklch color-mix effects that Tailwind can't express. The design prototype uses inline styles extensively — we translate to Tailwind where possible and fall back to style props for oklch gradients, color-mix, and per-project dynamic colors.

**Tech Stack:** React, Tailwind CSS v4 (oklch tokens in `@theme extend`), clsx

---

## Design Reference

Source files extracted to `/tmp/design-extract/jean-claude/project/`:
- `new-task overlay.html` — main orchestrator
- `newtask-views.jsx` — NTShell, NTStep1Compose, NTStep2Search, NTStep3Template
- `newtask-atoms.jsx` — ProjectTile, NTToolbar, ToolPill, ToolCheckbox, ToolSelect, ModeToggle, WICard, ColHeader, etc.
- `newtask-data.jsx` — mock data + constants
- `atoms.jsx` — shared Icon, Kbd
- `tokens.css` — design token reference

Key design constants:
```
NT_ACCENT = oklch(0.78 0.18 295)      — brighter violet accent for the overlay
NT_LINE   = oklch(1 0 0 / 0.06)       — subtle white line
NT_LINE_2 = oklch(1 0 0 / 0.04)       — softer line
NT_BG_TINT = oklch(0 0 0 / 0.18)      — dark tint for panels
```

---

### Task 1: Shell Container — Aurora Glass

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (outer container div + panelRef div)

**What to change:**

The overlay backdrop (`fixed inset-0`) stays the same. The panel container gets the aurora-glass treatment from the design's `NTShell`:

Current:
```
className="border-glass-border bg-bg-1 flex max-h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border shadow-[...]"
```

New — add aurora radial gradients as background, increase border-radius to 14px, add backdrop-filter, enhanced box-shadow:

```tsx
className="flex max-h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-[14px] border border-white/10 shadow-[0_30px_80px_oklch(0_0_0/0.55),inset_0_0_0_1px_oklch(1_0_0/0.04)]"
style={{
  background: `
    radial-gradient(ellipse 700px 500px at 10% -10%, oklch(0.55 0.22 295 / 0.32), transparent 55%),
    radial-gradient(ellipse 600px 420px at 110% 110%, oklch(0.55 0.18 205 / 0.25), transparent 55%),
    oklch(0.14 0.015 280 / 0.94)
  `,
  backdropFilter: 'blur(40px) saturate(140%)',
}}
```

---

### Task 2: Project Grid — Colored Tiles with Dynamic Tinting

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (ProjectGrid component)

**What to change:**

Current: flat buttons in a grid with bg-glass on active.
Design: Project tiles with colored dot, tinted background using project's color on active, wrapping flex layout.

Update the grid container:
- Change from `grid grid-cols-7` to `flex flex-wrap gap-1`
- Add dark background band: `bg-black/20` with top/bottom borders using `border-white/[0.04]`
- Add `compact` mode support (for search step where project grid is smaller — `max-h-16 overflow-auto`)

Update each project button:
- Show colored dot (7px circle with project.color)
- Active state: tinted background using `color-mix(in oklch, ${project.color} 18%, transparent)`, border using `color-mix(in oklch, ${project.color} 45%, transparent)`, dot gets glow `boxShadow: 0 0 6px ${project.color}`
- Inactive: transparent bg, `text-ink-2` color
- Font: 12.5px, -0.005em tracking

The Note tab becomes styled identically but with a neutral gray dot.

---

### Task 3: Bottom Toolbar — Glass Pills and Keyboard Hints

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (footer div)

**What to change:**

Current: a flat div with selectors and Kbd shortcuts in `text-ink-3`.
Design: `NTToolbar` — dark glass bar with `bg-black/28`, `border-top: 1px solid oklch(1 0 0 / 0.06)`, styled ToolPill controls, keyboard hints at far right.

Structure the toolbar as:
```
[left controls] [spacer flex-1] [keyboard hints]
```

Left controls become pill-styled buttons with:
- `bg-white/[0.03]` base, `border border-white/[0.07]`
- Active/checked variants get tinted with accent color
- Group separators: 1px-wide, 18px-tall dividers

Keyboard hints become small mono text with Kbd badges, right-aligned.

The existing ModeSelector/ModelSelector/BackendSelector keep their current popover behavior but get wrapped in pill-styled containers to match the visual.

---

### Task 4: Compose Step (Step 1) Styling

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (prompt input area)

**What to change:**

Update the textarea/PromptTextarea container:
- Padding: `20px 22px 12px` (matching `px-5 pt-5 pb-3`)
- Textarea styles: fontSize 15px, lineHeight 1.55, transparent background, caretColor accent
- The PromptTextarea component's className override adjusts to match

The flex-1 spacer between prompt and project grid is removed — prompt directly above the project grid, which is directly above the toolbar. The entire overlay is a simple vertical stack: `[prompt area] [project grid] [toolbar]`.

---

### Task 5: Search Step (Step 2) — Board Toolbar + Kanban Polish

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx` (SearchModeContent)
- Modify: `src/features/new-task/ui-work-item-board/index.tsx` (column headers, card styling)

**What to change:**

**Search input area:** Replace the current textarea with a cleaner search input row:
- Search icon (14px, ink-3) + input (flex-1, transparent bg, 14px font)
- Padding: `14px 18px`

**Board toolbar** (above the kanban): The existing header with "WORK ITEMS (N)" and controls gets restyled:
- Mono uppercase label `WORK ITEMS (N)` + accent-colored `N SELECTED` + "Clear selected" link
- Right side: iteration dropdown + view toggle (board/list icons in a segmented control)
- Bottom border: `border-white/[0.04]`

**Detail panel:** When active, right panel gets:
- Width: 360px fixed
- Left border: `border-white/[0.04]`
- Dark background: `bg-black/22`
- Header section with `#{id}` and "open" shortcut
- Scrollable content area

**Kanban columns:**
- Column header: colored dot + label + count, bottom border separator
- Cards: glass background, accent-tinted borders when selected/active

---

### Task 6: Template Step (Step 3) — Breadcrumb + Split Editor

**Files:**
- Modify: `src/features/new-task/ui-prompt-composer/index.tsx`

**What to change:**

**Breadcrumb header:**
- Back button (pill-styled, ghost variant) with arrow icon + "Back to selection" + Kbd
- Right side: `N work items` label + inline chips showing `#{id}` for each selected item (up to 4)
- Bottom border separator

**Template editor (left):**
- Header: `PROMPT TEMPLATE` in mono uppercase
- Textarea: mono font, 13px, lineHeight 1.6, transparent bg, full height
- Footer hint: `Use {#id} placeholders…` in dark tinted area

**Preview (right):**
- Header: `PREVIEW` + char/token count
- Dark tinted background (`bg-black/18`)
- Pre-formatted content, scrollable

---

### Task 7: Lint, Type-Check, Verify

**Step 1:** Run `pnpm install`
**Step 2:** Run `pnpm lint --fix`
**Step 3:** Run `pnpm ts-check`
**Step 4:** Run `pnpm lint`
**Step 5:** Fix any remaining issues
