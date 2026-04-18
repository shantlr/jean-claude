# Aurora Glass UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Retheme the entire jean-claude UI from the current "Kinetic Nocturne" design system (charcoal + blue/purple Tailwind utilities) to the "Aurora Glass" design language — translucent surfaces, ambient radial glows, oklch color palette rooted in electric violet (295°), Geist / Geist Mono typography, and a glassmorphism aesthetic.

**Architecture:** This is a pure visual/CSS redesign — no layout changes, no logic changes, no new components. We replace the existing design tokens (CSS custom properties + Tailwind theme), swap fonts from Manrope+Inter to Geist+Geist Mono, and update component-level Tailwind classes to use the new token system. The animated gradient borders (running, permission, question) are kept but re-tuned to the Aurora violet palette. The key visual signature is translucent `oklch(1 0 0 / 0.03–0.05)` surfaces with `backdrop-filter: blur()`, hairline `oklch(1 0 0 / 0.04–0.08)` borders, and ambient radial gradient glows on the app background.

**Tech Stack:** Tailwind CSS 4 (`@theme extend`), CSS custom properties (oklch color space), existing React component tree (unchanged).

---

## Design Reference Summary

Source: Claude Design handoff bundle — "Aurora Glass" variant (Option A layout, Glass styling, Aurora sub-variant).

### Color System (oklch)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-0` | `oklch(0.14 0.012 275)` | Deepest background |
| `--bg-1` | `oklch(0.17 0.013 275)` | Panel background |
| `--bg-2` | `oklch(0.205 0.014 275)` | Raised surface |
| `--bg-3` | `oklch(0.245 0.015 275)` | Hover / selection |
| `--bg-4` | `oklch(0.29 0.016 275)` | Strong emphasis |
| `--line` | `oklch(0.27 0.015 275)` | Border default |
| `--line-soft` | `oklch(0.22 0.013 275)` | Subtle border |
| `--ink-0` | `oklch(0.985 0.003 275)` | Brightest text |
| `--ink-1` | `oklch(0.88 0.008 275)` | Primary text |
| `--ink-2` | `oklch(0.68 0.012 275)` | Secondary text |
| `--ink-3` | `oklch(0.52 0.014 275)` | Muted text |
| `--ink-4` | `oklch(0.40 0.014 275)` | Faint text |
| `--acc` | `oklch(0.72 0.20 295)` | Accent (electric violet) |
| `--acc-soft` | `oklch(0.72 0.20 295 / 0.16)` | Accent background |
| `--acc-line` | `oklch(0.72 0.20 295 / 0.40)` | Accent border |
| `--acc-ink` | `oklch(0.82 0.17 295)` | Accent text |

### Status Colors (same L+C, hue rotation only)

| Status | Value | Hue |
|--------|-------|-----|
| `--run` | `oklch(0.78 0.16 75)` | amber |
| `--done` | `oklch(0.78 0.16 155)` | green |
| `--review` | `oklch(0.78 0.16 235)` | cyan-blue |
| `--pr` | `oklch(0.78 0.16 260)` | indigo |
| `--fail` | `oklch(0.72 0.18 25)` | rose |
| `--azure` | `oklch(0.78 0.16 205)` | sky |

Each has a `-soft` variant at `/ 0.14` opacity.

### Aurora Glass Surfaces

| Surface | Background | Border | Backdrop |
|---------|------------|--------|----------|
| App shell | Multi-layer radial gradient (see below) | `1px solid oklch(1 0 0 / 0.08)` | — |
| Sidebar | `oklch(1 0 0 / 0.025)` | `1px solid oklch(1 0 0 / 0.05)` | `blur(24px) saturate(130%)` |
| Chrome (header, step rail) | `oklch(1 0 0 / 0.015)` | `1px solid oklch(1 0 0 / 0.04)` | — |
| Active feed row | `linear-gradient(135deg, oklch(0.78 0.18 295 / 0.22), oklch(0.78 0.18 295 / 0.04) 70%)` | — | — |
| Active feed shadow | `inset 0 0 0 1px oklch(0.78 0.18 295 / 0.45), 0 0 24px oklch(0.78 0.18 295 / 0.18)` | — | — |
| User message (glass) | `oklch(1 0 0 / 0.04)` | `1px solid oklch(1 0 0 / 0.08)` | `blur(10px)` |
| Composer | `oklch(1 0 0 / 0.04)` | `1px solid oklch(1 0 0 / 0.12)` | `blur(20px)` |

### App Background (Aurora Glow)

```css
background:
  radial-gradient(ellipse 1200px 700px at 15% -10%, oklch(0.35 0.15 295 / 0.35), transparent 55%),
  radial-gradient(ellipse 900px 600px at 110% 110%, oklch(0.35 0.12 205 / 0.3), transparent 50%),
  radial-gradient(ellipse 600px 500px at 60% 50%, oklch(0.3 0.1 330 / 0.12), transparent 60%),
  oklch(0.11 0.015 275);
```

### Typography

| Property | Value |
|----------|-------|
| Font sans | `'Geist', ui-sans-serif, system-ui, sans-serif` |
| Font mono | `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace` |
| Base size | `13px` |
| Line height | `1.45` |
| Letter spacing | `-0.005em` |
| Font features | `'ss01', 'ss02', 'cv11'` |
| Antialiasing | `-webkit-font-smoothing: antialiased` |

### Border Radii

| Token | Value |
|-------|-------|
| `--r-xs` | `3px` |
| `--r-sm` | `5px` |
| `--r-md` | `7px` |
| `--r-lg` | `10px` |

---

## Implementation Tasks

### Task 1: Replace Design Tokens in `src/index.css`

**Files:**
- Modify: `src/index.css`

**What to do:**

Replace the entire `@theme extend` block and base layer. The key changes:

1. **Fonts**: Replace `Manrope + Inter` Google Fonts import with `Geist + Geist Mono`
2. **Color tokens**: Replace hex-based `--color-*` tokens with oklch-based Aurora tokens
3. **Surface tokens**: Map the old surface tier (`surface`, `surface-bright`, `surface-container-*`) to the new `--bg-0` through `--bg-4` oklch values
4. **Text tokens**: Map `--color-on-surface` / `--color-on-surface-variant` to `--ink-0` through `--ink-4`
5. **Accent tokens**: Replace `--color-primary` (#a3a6ff) with `--acc` oklch violet family
6. **Status tokens**: Add `--run`, `--done`, `--review`, `--pr`, `--fail`, `--azure` and their `-soft` variants
7. **Border tokens**: Add `--line` and `--line-soft`
8. **Font family tokens**: Replace `--font-display` / `--font-body` with `--font-sans` / `--font-mono`
9. **Border radius tokens**: Replace the numeric scale with `--r-xs` through `--r-lg`
10. **Base layer**: Update `html` to use new font, bg, color, and add `font-feature-settings`, `letter-spacing`
11. **Aurora background**: Add a `.aurora-app-bg` utility for the multi-layer radial gradient background
12. **Glass surface utilities**: Add utilities for the translucent glass surfaces (sidebar, chrome, card)

**Token mapping (old → new):**

```
--color-surface (#0e0e11)              → --bg-0 oklch(0.14 0.012 275)
--color-surface-bright (#1c1c21)       → --bg-1 oklch(0.17 0.013 275)
--color-surface-container-high (#1e1e23) → --bg-2 oklch(0.205 0.014 275)
--color-surface-container-highest (#25252a) → --bg-3 oklch(0.245 0.015 275)
--color-on-surface (#fcf8fc)           → --ink-0 oklch(0.985 0.003 275)
--color-on-surface-variant (#c4c0c4)   → --ink-2 oklch(0.68 0.012 275)
--color-outline-variant (#48474b)      → --line oklch(0.27 0.015 275)
--color-primary (#a3a6ff)              → --acc oklch(0.72 0.20 295)
--font-display (Manrope)               → --font-sans (Geist)
--font-body (Inter)                    → --font-sans (Geist)
```

**Animated gradient borders**: Re-tune all existing gradient border utilities (`running-border`, `permission-border`, `question-border`, etc.) to use oklch colors that harmonize with the Aurora palette. Keep the animation mechanics unchanged.

**Do NOT remove**: Any `@utility` or `@keyframes` blocks — just re-color them. Keep all cat-bongo animations, sidebar-card-enter, etc.

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 2: Update `src/common/ui/styles.ts` — Shared Style Constants

**Files:**
- Modify: `src/common/ui/styles.ts`

**What to do:**

Update all Tailwind class references to use the new color tokens. The main changes:

1. **Button variants**: Replace `bg-blue-600` → accent-derived classes, `bg-neutral-800` → glass surface classes, `text-neutral-400` → ink token classes
2. **Input base**: Replace `bg-neutral-800`, `border-neutral-600`, `text-neutral-200` with new token classes
3. **Tab variant**: Replace neutral-700/neutral-400 with new token classes

Since we're moving from Tailwind's `neutral-*` scale to oklch custom properties, we'll use Tailwind's arbitrary value syntax: `bg-[oklch(0.17_0.013_275)]` or reference CSS variables: `bg-[var(--bg-1)]`.

**Approach decision**: To minimize blast radius, define Tailwind theme colors in `@theme extend` that map to the oklch tokens, so components can use clean class names like `bg-bg-1` or `text-ink-2` instead of arbitrary values everywhere.

This means in Task 1, we should also add these Tailwind theme mappings:

```css
@theme extend {
  --color-bg-0: oklch(0.14 0.012 275);
  --color-bg-1: oklch(0.17 0.013 275);
  --color-bg-2: oklch(0.205 0.014 275);
  --color-bg-3: oklch(0.245 0.015 275);
  --color-bg-4: oklch(0.29 0.016 275);
  --color-ink-0: oklch(0.985 0.003 275);
  --color-ink-1: oklch(0.88 0.008 275);
  --color-ink-2: oklch(0.68 0.012 275);
  --color-ink-3: oklch(0.52 0.014 275);
  --color-ink-4: oklch(0.40 0.014 275);
  --color-line: oklch(0.27 0.015 275);
  --color-line-soft: oklch(0.22 0.013 275);
  --color-acc: oklch(0.72 0.20 295);
  --color-acc-soft: oklch(0.72 0.20 295 / 0.16);
  --color-acc-line: oklch(0.72 0.20 295 / 0.40);
  --color-acc-ink: oklch(0.82 0.17 295);
  --color-status-run: oklch(0.78 0.16 75);
  --color-status-done: oklch(0.78 0.16 155);
  --color-status-review: oklch(0.78 0.16 235);
  --color-status-pr: oklch(0.78 0.16 260);
  --color-status-fail: oklch(0.72 0.18 25);
  --color-status-azure: oklch(0.78 0.16 205);
  /* Glass surfaces */
  --color-glass-subtle: oklch(1 0 0 / 0.025);
  --color-glass-light: oklch(1 0 0 / 0.04);
  --color-glass-medium: oklch(1 0 0 / 0.06);
  --color-glass-strong: oklch(1 0 0 / 0.10);
  --color-glass-border: oklch(1 0 0 / 0.08);
  --color-glass-border-strong: oklch(1 0 0 / 0.12);
}
```

Then `styles.ts` button variants become:
- Primary: `bg-acc text-bg-0 border border-transparent hover:brightness-110`
- Secondary: `bg-glass-medium text-ink-1 border border-glass-border hover:bg-glass-strong`
- Ghost: `bg-transparent text-ink-2 border border-transparent hover:bg-glass-light hover:text-ink-1`
- Danger: keep `bg-red-600` (maps well to `--fail` hue)
- Tab selected: `bg-glass-strong text-ink-0`
- Tab unselected: `text-ink-2 hover:bg-glass-light hover:text-ink-1`
- Input: `bg-glass-light text-ink-1 placeholder-ink-3 border-glass-border focus:border-acc-line`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 3: Update Header — `src/layout/ui-header/index.tsx`

**Files:**
- Modify: `src/layout/ui-header/index.tsx`

**What to do:**

The header maps to the "chrome top strip" in the design:
- Background: `bg-glass-light` (translucent) instead of implicit inherited bg
- Border bottom: `border-b border-glass-border`
- Button text: `text-ink-2` (was `text-neutral-400`)
- Button hover: `hover:bg-glass-medium hover:text-ink-1` (was `hover:bg-neutral-700 hover:text-neutral-200`)
- Stats text (right side): `text-ink-3 font-mono text-[11px]` (was `text-neutral-500`)
- Jobs badge: re-tune glow to accent violet
- Height stays `h-10`

**Replace classes systematically:**
- `text-neutral-400` → `text-ink-2`
- `text-neutral-500` → `text-ink-3`
- `text-neutral-200` → `text-ink-1`
- `bg-neutral-700` → `bg-glass-medium`
- `bg-neutral-800` → `bg-glass-light`
- `bg-blue-600` → `bg-acc`
- `text-white` → `text-bg-0`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 4: Update Main Sidebar — `src/layout/ui-main-sidebar/index.tsx`

**Files:**
- Modify: `src/layout/ui-main-sidebar/index.tsx`

**What to do:**

The sidebar maps to the "feed sidebar" in the design:
- Background: `bg-glass-subtle` with `backdrop-blur-xl backdrop-saturate-[130%]`
- Border right: `border-r border-glass-border` (was using neutral tones)
- Resize handle: `hover:bg-acc/50` (was `hover:bg-primary/50`)
- Section headers ("Pinned"): `text-[10.5px] uppercase tracking-wider text-ink-3 font-semibold`
- Footer stats bar: `text-ink-3 font-mono text-[10.5px] border-t border-glass-border`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 5: Update Task List Items — `src/features/task/ui-task-summary-card/index.tsx`

**Files:**
- Modify: `src/features/task/ui-task-summary-card/index.tsx`

**What to do:**

Feed rows in the Aurora design use glassmorphism with glowing active states:

- **Default (unselected)**: `bg-transparent rounded-lg` with `hover:bg-glass-light`
- **Selected/active**: Instead of `border border-neutral-500/60 bg-neutral-700/80`, use the Aurora glow: apply via a style object with the gradient background and inset box-shadow (since these are too complex for Tailwind classes)
- **Status dot colors**: Map to the new oklch status tokens. Replace:
  - `bg-blue-500 animate-pulse` (running) → `bg-status-run` with `box-shadow: 0 0 8px var(--color-status-run)` and `animate-pulse`
  - `bg-yellow-500` (waiting) → `bg-status-run` (amber)
  - `bg-neutral-500` (completed) → `bg-status-done`
  - `bg-red-500` (errored) → `bg-status-fail`
  - `bg-orange-500` (interrupted) → `bg-status-run`
- **Task name text**: `text-sm` → keep size, use `text-ink-1` default, `text-ink-0 font-medium` when active
- **Metadata text**: `text-[11px] text-neutral-500` → `text-[11px] text-ink-3`
- **Animated borders** (running-border, permission-border, etc.): Already handled by Task 1 retune

**Key class replacements:**
- `bg-neutral-700/80` → glass active gradient (inline style)
- `border-neutral-500/60` → `border-glass-border`
- `bg-neutral-800/70` → `bg-glass-light`
- `text-neutral-500` → `text-ink-3`
- `text-neutral-200` → `text-ink-1`
- `text-green-500` → `text-status-done`
- `text-amber-500` → `text-status-run`
- `text-amber-400` → `text-status-run`
- `bg-violet-500/10` → `bg-acc-soft`
- `text-violet-300` → `text-acc-ink`
- `ring-violet-500/20` → `ring-acc-line`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 6: Update Task List Container — `src/features/task/ui-task-list/index.tsx`

**Files:**
- Modify: `src/features/task/ui-task-list/index.tsx`

**What to do:**

- Section divider: `bg-neutral-800` → `bg-line-soft`
- Section label: `text-neutral-500` → `text-ink-3`
- Container padding: keep existing
- Feed row margin: `4px 8px` per the design's `rowMargin`
- Feed row gap: keep `space-y-1.5`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 7: Update Feed List (All-Projects View) — `src/features/project/ui-feed-list/` or similar

**Files:**
- Find and modify the feed list component used in the "All Projects" view

**What to do:**

Apply the same color token swaps as Task 5/6 — the feed list in "all" view renders the same card components but may have its own wrapper styling.

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 8: Update Prompt Textarea / Composer — `src/features/common/ui-prompt-textarea/index.tsx`

**Files:**
- Modify: `src/features/common/ui-prompt-textarea/index.tsx`

**What to do:**

The composer in Aurora design is a glass card:
- Container: `bg-glass-light backdrop-blur-xl border border-glass-border-strong rounded-[10px]`
- Textarea: `text-ink-1 placeholder-ink-3`
- Mode selector chips: `bg-acc-soft text-acc-ink rounded-[5px]`
- Send button: `bg-acc text-bg-0 rounded-md font-semibold`
- Dropdown menu: `bg-bg-1 border border-glass-border rounded-md`
- Dropdown items: `hover:bg-glass-medium`
- Skill badges: `bg-glass-medium text-ink-2`

**Replace classes:**
- `bg-neutral-900/50` → `bg-glass-light`
- `border-neutral-700/50` → `border-glass-border`
- `text-neutral-200` → `text-ink-1`
- `placeholder-neutral-500` → `placeholder-ink-3`
- `bg-neutral-800` → `bg-bg-1`
- `border-neutral-600` → `border-glass-border`
- `bg-neutral-700` → `bg-glass-medium`
- `text-neutral-400` → `text-ink-2`
- `text-neutral-500` → `text-ink-3`
- `text-neutral-300` → `text-ink-1`
- `bg-blue-500/10` → `bg-acc-soft`
- `text-blue-400` → `text-acc-ink`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 9: Update Message Stream / Timeline — `src/features/agent/ui-message-stream/index.tsx`

**Files:**
- Modify: `src/features/agent/ui-message-stream/index.tsx`
- Modify: `src/index.css` (timeline gradient line color)

**What to do:**

- Timeline vertical line in CSS: replace `var(--color-neutral-700)` → `var(--color-line-soft)` in `.timeline-gradient-line::before`
- Working indicator dots: `bg-sky-400` → `bg-acc-ink`, shadow uses accent
- Working ping: `bg-sky-400/20` → `bg-acc/20`
- Permission/question banners: color updates follow from Task 1

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 10: Update Step Flow Bar — `src/features/task/ui-step-flow-bar/index.tsx`

**Files:**
- Modify: `src/features/task/ui-step-flow-bar/index.tsx`

**What to do:**

Map step chip colors to new Aurora tokens:
- Running chip: keep `step-chip-running` utility (already retuned in Task 1)
- Completed chip: `border-emerald-800/50 bg-emerald-950/40 text-emerald-300` → use `--status-done` family: `border-[oklch(0.78_0.16_155_/_0.3)] bg-[oklch(0.78_0.16_155_/_0.08)] text-status-done`
- Errored chip: `border-red-800/50 bg-red-950/40 text-red-300` → `border-[oklch(0.72_0.18_25_/_0.3)] bg-[oklch(0.72_0.18_25_/_0.08)] text-status-fail`
- Default/neutral: `border-neutral-800 bg-neutral-900` → `border-line-soft bg-bg-0`
- Edge stroke colors: `stroke-blue-400` → `stroke-acc`, `stroke-emerald-500` → `stroke-status-done`, etc.
- Active highlight: `ring-blue-400/70 ring-offset-neutral-900` → `ring-acc/70 ring-offset-bg-0`
- Add step button: `border-neutral-700/60 text-neutral-600` → `border-line/60 text-ink-4`

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 11: Update Message Input Wrapper — `src/features/agent/ui-message-input/` (parent of prompt textarea)

**Files:**
- Find and modify the message input container that wraps the prompt textarea (likely `src/features/agent/ui-message-input/index.tsx`)

**What to do:**

The parent container often applies the `prompt-input-border` utility and additional chrome. Update:
- Border container: colors already retuned in Task 1
- Mode/model selector chips: `bg-acc-soft text-acc-ink`
- Any remaining neutral-* classes → Aurora tokens

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 12: Update Remaining Layout Components

**Files:**
- Modify: `src/layout/` — any remaining layout files (app shell wrapper)
- Modify: `src/app.tsx` — if it has styling

**What to do:**

- App root background: Apply the Aurora multi-layer radial gradient background. This is the signature visual — the ambient glow behind everything. Add this to the outermost shell div or to the `html`/`body` in CSS.
- Main content area: `bg-transparent` (glass surfaces are translucent, the aurora glow shows through)

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check
```

---

### Task 13: Sweep Remaining Components

**Files:**
- Grep across `src/` for remaining `neutral-` color references
- Grep for remaining `blue-500`, `blue-600`, `blue-400` references
- Grep for `Inter` and `Manrope` font references

**What to do:**

Systematic search-and-replace of any remaining old color tokens across all components:

```bash
# Find all files still using old neutral colors
rg 'neutral-[0-9]' src/ --files-with-matches

# Find all files still using old blue accent
rg 'blue-[0-9]' src/ --files-with-matches

# Find leftover font references
rg 'Manrope|Inter' src/ --files-with-matches
```

For each file found, apply the same mapping:
- `neutral-900` → `bg-0`
- `neutral-800` → `bg-1` or `glass-light`
- `neutral-700` → `bg-2` or `glass-medium`
- `neutral-600` → `line`
- `neutral-500` → `ink-3`
- `neutral-400` → `ink-2`
- `neutral-300` → `ink-1`
- `neutral-200` → `ink-1`
- `neutral-100` → `ink-0`
- `blue-600` → `acc`
- `blue-500` → `acc`
- `blue-400` → `acc-ink`
- `emerald-*` / `green-*` → `status-done`
- `yellow-*` / `amber-*` → `status-run`
- `red-*` → `status-fail`
- `sky-*` / `cyan-*` → `status-review`
- `violet-*` / `purple-*` → `acc` family

**Important exceptions — do NOT change:**
- Colors inside `@keyframes` or `@utility` blocks in `index.css` (handled in Task 1)
- Colors that are semantically correct (e.g., `bg-red-600` for destructive actions can map to `status-fail`)

**Verification:**
```bash
pnpm lint --fix && pnpm ts-check && pnpm lint
```

---

### Task 14: Final Visual QA Checklist

**What to do:**

Run the full build and lint pipeline:

```bash
pnpm install
pnpm lint --fix
pnpm ts-check
pnpm lint
```

Verify no TypeScript errors, no lint errors, no broken imports.

Verify that no hex color values remain in component files (only in `index.css` tokens if needed), and that the entire UI uses the new oklch-based Aurora token system.

---

## Execution Notes

### Key Principles

1. **Token-first**: Change `index.css` tokens first, then components. Many components will automatically pick up changes via CSS variables.
2. **No layout changes**: This is purely visual. Don't change flex directions, widths, heights, gaps, or component structure.
3. **Glass = translucent white**: The Aurora Glass look comes from `oklch(1 0 0 / 0.02–0.10)` backgrounds (white at very low opacity) + `backdrop-filter: blur()`. This lets the Aurora gradient glow bleed through.
4. **oklch color space**: All colors use `oklch()` function. Tailwind 4 supports this natively. For Tailwind classes with arbitrary values, use underscore for spaces: `bg-[oklch(0.14_0.012_275)]`.
5. **Keep animated borders**: The running/permission/question animated gradient borders are a signature feature — retune colors but keep animation mechanics.
6. **Geist fonts**: Available from Google Fonts. The design uses Geist for all UI text and Geist Mono for monospace.
