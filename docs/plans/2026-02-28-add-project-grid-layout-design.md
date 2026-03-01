# Add Project Page — Grid Layout Design

**Date:** 2026-02-28
**Status:** Approved

## Goal

Improve the Add Project page by switching detected projects from a single-column list to a 3-column grid, making only the grid scrollable (not the whole page), and moving the Local Folder / Clone Azure DevOps action buttons to the right side of the page header.

---

## Layout Structure

The page becomes a **fixed-height flex column** (`flex flex-col h-full overflow-hidden p-6`) — no page-level scroll. Three visual rows:

1. **Header row** — `flex items-center justify-between`, fixed height
2. **Search box** — fixed below the header, visible only when `hasDetected`
3. **Grid area** — `flex-1 min-h-0 overflow-y-auto`, fills remaining height and scrolls independently

```
┌──────────────────────────────────────────────────────────────────┐
│  Add Project         [📁 Local Folder]  [⬡ Clone Azure DevOps]  │  ← flex justify-between
├──────────────────────────────────────────────────────────────────┤
│  [🔍 Filter projects…]                          (hasDetected)    │  ← fixed, mb-3
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │📂 proj-a │  │📂 proj-b │  │📂 proj-c │                       │
│  │[Claude]  │  │[OpenCode]│  │[Codex]   │     ↕ only this       │
│  │~/proj/…  │  │~/proj/…  │  │~/proj/…  │       scrolls         │
│  └──────────┘  └──────────┘  └──────────┘                       │
│  ┌──────────┐  ...                                               │
└──────────────────────────────────────────────────────────────────┘
```

The "or add manually" divider is **removed** — no longer needed since the buttons live in the header.

---

## Header Row

```tsx
<div className="mb-4 flex items-center justify-between">
  <h1 className="text-2xl font-bold">Add Project</h1>
  <div className="flex gap-2">
    {/* Local Folder button */}
    {/* Clone Azure DevOps button */}
  </div>
</div>
```

Buttons use the same compact style as the previous grid buttons:
- `flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800`
- `Folder` icon for Local Folder
- Azure DevOps SVG icon for Clone

---

## Grid Area

```tsx
<div className="min-h-0 flex-1 overflow-y-auto">
  <div className="grid grid-cols-3 gap-3">
    {/* skeletons or cards */}
  </div>
</div>
```

`min-h-0` is required so the flex child can shrink below its content height and scroll properly.

### Card Layout

Fixed height `h-[88px]` for visual consistency across all cards:

```
┌─────────────────────────┐
│ 📂 my-project-name      │  ← FolderOpen icon + name (truncate), sm font-medium
│ [Claude Code] [Codex]   │  ← badges row (flex-wrap gap-1), mt-1
│ ~/projects/my-app       │  ← displayPath (truncate), xs text-neutral-500, mt-auto
└─────────────────────────┘
```

Full card class:
```
flex h-[88px] w-full cursor-pointer flex-col rounded-lg border border-neutral-700
bg-neutral-800/50 p-3 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-800
```

Inner structure:
- Row 1: `flex items-center gap-1.5` — `FolderOpen` icon (h-3.5 w-3.5, text-neutral-500) + name (text-sm font-medium truncate)
- Row 2: `flex flex-wrap gap-1 mt-1` — source badges (same badge classes as before)
- Row 3: `mt-auto truncate text-xs text-neutral-500` — displayPath

### Loading Skeletons

6 skeleton placeholders (fills 2 full rows at 3 columns) while `isLoadingDetected`:
```tsx
{[0,1,2,3,4,5].map((i) => (
  <div key={i} className="h-[88px] animate-pulse rounded-lg bg-neutral-800/50" />
))}
```

### Empty Filter State

Shown when `!isLoadingDetected && hasDetected && filteredProjects.length === 0`:
```tsx
<p className="col-span-3 py-8 text-center text-sm text-neutral-500">
  No projects match &ldquo;{searchQuery}&rdquo;
</p>
```

Uses `col-span-3` so it spans the full grid width.

---

## Zero Detected Projects State

When `!showDetectedSection` (detection complete, zero results):
- Grid area hidden entirely
- Page shows just the header (title + buttons) — the buttons are the primary call to action

---

## Files Changed

Only one file changes: `src/routes/projects/new.tsx`

- Header restructured to `flex justify-between` with buttons inline
- Removed divider block
- `space-y-1.5` list → `grid grid-cols-3 gap-3` grid
- Card inner structure updated (vertical stack with `mt-auto` path)
- Skeleton count: 3 → 6
- Outer scroll wrapper changed: page `overflow-y-auto` → grid area `min-h-0 flex-1 overflow-y-auto`
