# Background Jobs Glass Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the background jobs header button and overlay with a premium glassmorphism aesthetic and animated gradient border.

**Architecture:** Pure CSS/Tailwind styling changes across 3 files. The codebase already has `@property --gradient-angle`, `gradient-rotate` keyframes, and `running-border` utility patterns in `src/index.css` — we reuse these for the button's active-state gradient border. No new dependencies or structural changes.

**Tech Stack:** Tailwind CSS v4 (with `@utility` directive), React, Lucide icons

---

### Task 1: Add CSS utility for the jobs button gradient border

**Files:**
- Modify: `src/index.css` (after the existing `jobs-pulse` block, around line 163)

**Step 1: Add the `jobs-running-border` utility**

Add a new `@utility` block after the `.jobs-pulse` class (line 163). This reuses the existing `--gradient-angle` property and `gradient-rotate` keyframes already defined in the file.

```css
@utility jobs-running-border {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(
        color-mix(in srgb, var(--color-blue-950) 30%, transparent),
        color-mix(in srgb, var(--color-blue-950) 30%, transparent)
      )
      padding-box,
    conic-gradient(
        from var(--gradient-angle),
        var(--color-blue-500),
        var(--color-purple-500),
        var(--color-blue-400),
        var(--color-blue-500)
      )
      border-box;
  border: 1px solid transparent;
  animation: gradient-rotate 3s linear infinite;
  box-shadow: 0 0 12px 0px
    color-mix(in srgb, var(--color-blue-500) 15%, transparent);
}
```

**Step 2: Verify no syntax errors**

Run: `pnpm ts-check`
Expected: PASS (CSS-only change, no TS impact)

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add jobs-running-border CSS utility for animated gradient border"
```

---

### Task 2: Restyle the header Jobs button

**Files:**
- Modify: `src/layout/ui-header/index.tsx` (lines 88-111)

**Step 1: Update the button markup and classes**

Replace the current button block (lines 88-111) with the restyled version. Key changes:
- Idle: glass background (`bg-white/5`), subtle border (`border border-white/[0.08]`), `rounded-lg`
- Hover: `hover:bg-white/10 hover:border-white/[0.15] hover:text-white`
- Active (running): apply `jobs-running-border` utility, badge gets glow shadow
- Smooth transition between states: `transition-all duration-500`

```tsx
{/* Background jobs */}
<div
  className="pr-2"
  style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
>
  <button
    type="button"
    data-animation-target="jobs-button"
    onClick={() => openOverlay('background-jobs')}
    className={clsx(
      'relative flex h-6 items-center gap-1 rounded-lg px-2 text-xs transition-all duration-500',
      runningJobsCount > 0
        ? 'jobs-running-border text-white'
        : 'border border-white/[0.08] bg-white/5 text-neutral-400 hover:border-white/[0.15] hover:bg-white/10 hover:text-white',
    )}
  >
    {runningJobsCount > 0 ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : (
      <Loader2 className="h-3.5 w-3.5" />
    )}
    <span>Jobs</span>
    {runningJobsCount > 0 && (
      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white shadow-[0_0_6px_rgba(59,130,246,0.4)]">
        {runningJobsCount}
      </span>
    )}
  </button>
</div>
```

Note: Add `clsx` import at the top of the file (it's already a project dependency).

**Step 2: Add the clsx import**

Add to the imports at the top of the file:

```tsx
import clsx from 'clsx';
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 4: Run lint**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/layout/ui-header/index.tsx
git commit -m "feat: restyle Jobs button with glass background and animated gradient border"
```

---

### Task 3: Restyle the overlay panel with glass treatment

**Files:**
- Modify: `src/features/background-jobs/ui-background-jobs-overlay/index.tsx`

**Step 1: Update the overlay panel container**

Change the outer panel `<div>` classes (line 45) from:
```
flex max-h-[70svh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl
```
to:
```
flex max-h-[70svh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900/85 shadow-2xl shadow-black/50 backdrop-blur-xl
```

**Step 2: Update the overlay header**

Change the header `<div>` classes (line 48) from:
```
flex items-center justify-between border-b border-neutral-700 px-4 py-3
```
to:
```
flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent px-4 py-3
```

**Step 3: Update the "Clear Finished" button**

Change the Clear Finished button classes (lines 58-61) from:
```
rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-700
```
to:
```
rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10
```

**Step 4: Update job row status classes**

Change the `JobRow` component's `clsx` classes (lines 174-179) from:
```tsx
job.status === 'running' && 'border-blue-900/60 bg-blue-950/20',
job.status === 'succeeded' && 'border-emerald-900/50 bg-emerald-950/20',
job.status === 'failed' && 'border-red-900/60 bg-red-950/20',
```
to:
```tsx
job.status === 'running' && 'border-blue-400/20 bg-blue-500/[0.08] backdrop-blur-sm',
job.status === 'succeeded' && 'border-emerald-400/20 bg-emerald-500/[0.08]',
job.status === 'failed' && 'border-red-400/20 bg-red-500/[0.08]',
```

Also update the base classes on the same element (line 175) from `'rounded border px-3 py-2'` to `'rounded-lg border px-3 py-2'`.

**Step 5: Update action buttons (Retry and Open Task)**

Change the Retry button classes (lines 203, 213) from:
```
rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-700
```
to:
```
rounded border border-white/[0.15] bg-white/5 px-2 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/10
```

Change the Open Task button classes (line 226) from:
```
rounded border border-blue-700 px-2 py-1 text-xs text-blue-200 transition-colors hover:bg-blue-900/40
```
to:
```
rounded border border-blue-400/25 bg-blue-500/10 px-2 py-1 text-xs text-blue-200 transition-colors hover:bg-blue-500/20
```

**Step 6: Update empty state**

Change the empty state div classes (line 76) from:
```
rounded border border-dashed border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500
```
to:
```
rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-neutral-500
```

**Step 7: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: PASS

**Step 8: Run lint**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 9: Commit**

```bash
git add src/features/background-jobs/ui-background-jobs-overlay/index.tsx
git commit -m "feat: restyle background jobs overlay with glass and translucent treatment"
```

---

### Task 4: Final verification

**Step 1: Full lint check**

Run: `pnpm lint --fix && pnpm lint`
Expected: PASS

**Step 2: Full TypeScript check**

Run: `pnpm ts-check`
Expected: PASS

**Step 3: Commit any remaining fixes**

If lint or ts-check required changes, commit them:

```bash
git add -A
git commit -m "fix: address lint and type-check issues"
```
