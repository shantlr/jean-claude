# Timeline Style & User Emphasis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the messages timeline to feel more polished and make user messages visually distinct from agent/tool activity.

**Architecture:** Pure CSS/Tailwind styling changes across 3 files. No new components, no logic changes, no database changes. The `UserEntry` component gets a left accent bar replacing its dot, the timeline container gets a gradient-faded vertical line, and pending dots get a subtle glow.

**Tech Stack:** Tailwind CSS v4 utilities, React (unchanged logic)

---

### Task 1: Add timeline gradient line utility to index.css

**Files:**
- Modify: `src/index.css` (append after existing utilities, around line 433)

**Step 1: Add the `timeline-gradient-line` utility**

Add this CSS utility at the end of `src/index.css`:

```css
/* ── Timeline: gradient vertical line that fades at top and bottom ── */
@utility timeline-gradient-line {
  border-left: none;
  position: relative;
}

@utility timeline-gradient-line::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent 0px,
    var(--color-neutral-700) 24px,
    var(--color-neutral-700) calc(100% - 24px),
    transparent 100%
  );
}
```

NOTE: Tailwind v4 `@utility` only supports single class selectors — it cannot define pseudo-element utilities inline. Instead, we will use a standard CSS rule scoped to a class name. Replace the above with:

```css
/* ── Timeline: gradient vertical line that fades at top and bottom ── */
.timeline-gradient-line {
  border-left: none;
  position: relative;
}

.timeline-gradient-line::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent 0px,
    var(--color-neutral-700) 24px,
    var(--color-neutral-700) calc(100% - 24px),
    transparent 100%
  );
}
```

**Step 2: Verify no syntax errors**

Run: `pnpm ts-check`

---

### Task 2: Apply gradient line to the timeline container

**Files:**
- Modify: `src/features/agent/ui-message-stream/index.tsx:108`

**Step 1: Replace the border-l class with the gradient utility**

In `index.tsx` line 108, change:

```tsx
<div className="relative ml-3 border-l border-neutral-700">
```

to:

```tsx
<div className="timeline-gradient-line relative ml-3">
```

**Step 2: Verify it compiles**

Run: `pnpm ts-check`

---

### Task 3: Restyle UserEntry with accent bar

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` — the `UserEntry` function (lines 554–629)

**Step 1: Update the UserEntry component styling**

Replace the current `UserEntry` component's outer div and dot with an accent bar treatment. Change the return JSX from:

```tsx
<div className="group/user relative bg-purple-500/5 pl-6">
  {/* Dot - purple for user */}
  <div className="absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-purple-500" />
  <div className="py-1.5 pr-3 text-xs text-neutral-300">
```

to:

```tsx
<div className="group/user relative border-l-2 border-purple-500 bg-purple-500/8 pl-6">
  <div className="py-2.5 pr-3 text-[13px] leading-relaxed text-neutral-200">
```

Key changes:
- Remove the dot div entirely
- Add `border-l-2 border-purple-500` (accent bar)
- Strengthen bg from `bg-purple-500/5` to `bg-purple-500/8`
- Increase padding from `py-1.5` to `py-2.5`
- Increase text from `text-xs text-neutral-300` to `text-[13px] leading-relaxed text-neutral-200`

**Step 2: Verify it compiles**

Run: `pnpm ts-check`

---

### Task 4: Dim tool summary text and add glow to pending dots

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` — the `DotEntry` function (lines 182–255)

**Step 1: Dim tool summary text color**

In the `DotEntry` component, change the summary text span (line 241):

```tsx
<span className="text-xs text-neutral-300">
```

to:

```tsx
<span className={`text-xs ${type === 'tool' ? 'text-neutral-400' : type === 'result' ? 'text-neutral-500' : 'text-neutral-300'}`}>
```

**Step 2: Add glow to pending dots**

In the `DotEntry` component, update the dot div (line 218-219) to add glow when pending. Change:

```tsx
<div
  className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full ${dotColor} ${isPending ? 'animate-pulse' : ''}`}
/>
```

to:

```tsx
<div
  className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full ${dotColor} ${isPending ? 'animate-pulse shadow-[0_0_6px_currentColor]' : ''}`}
/>
```

The `shadow-[0_0_6px_currentColor]` trick uses the dot's own background color (via `currentColor` fallback) to create a matching glow. However, since `currentColor` uses text color not bg color, we need to use explicit colors instead. Update to:

```tsx
<div
  className={clsx(
    'absolute top-2.5 -left-1 h-2 w-2 rounded-full',
    dotColor,
    isPending && 'animate-pulse',
    isPending && type === 'tool' && 'shadow-[0_0_6px_theme(colors.blue.500/40)]',
    isPending && type === 'system' && 'shadow-[0_0_6px_theme(colors.amber.500/40)]',
  )}
/>
```

Note: `clsx` is already imported at the top of this file.

**Step 3: Verify it compiles**

Run: `pnpm ts-check`

---

### Task 5: Update CompactingEntry pending dot glow

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-timeline-entry/index.tsx` — the `CompactingEntry` function (lines 668–696)

**Step 1: Add glow to the amber dot when pending**

Change line 675:

```tsx
className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-amber-500 ${!isComplete ? 'animate-pulse' : ''}`}
```

to:

```tsx
className={`absolute top-2.5 -left-1 h-2 w-2 rounded-full bg-amber-500 ${!isComplete ? 'animate-pulse shadow-[0_0_6px_theme(colors.amber.500/40)]' : ''}`}
```

**Step 2: Verify it compiles**

Run: `pnpm ts-check`

---

### Task 6: Update SubagentEntry pending dot glow

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-subagent-entry/index.tsx:84`

**Step 1: Add glow to the cyan dot when pending**

Change line 84:

```tsx
const dotColor = isPending ? 'bg-cyan-500 animate-pulse' : 'bg-cyan-500';
```

to:

```tsx
const dotColor = isPending
  ? 'bg-cyan-500 animate-pulse shadow-[0_0_6px_theme(colors.cyan.500/40)]'
  : 'bg-cyan-500';
```

**Step 2: Verify it compiles**

Run: `pnpm ts-check`

---

### Task 7: Final lint and type-check

**Files:** All modified files

**Step 1: Install dependencies**

Run: `pnpm install`

**Step 2: Auto-fix lint**

Run: `pnpm lint --fix`

**Step 3: Type-check**

Run: `pnpm ts-check`

**Step 4: Final lint check**

Run: `pnpm lint`

Expected: All pass with no errors.
