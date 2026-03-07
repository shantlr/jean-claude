# Sidebar Visual Refresh — Design Document

**Date:** 2026-03-05
**Approach:** Refined Spacing + Micro-interactions (Arc/Linear/Raycast-inspired)
**Goal:** Holistic visual polish of the main sidebar without structural changes. Improve feel through spacing, motion, color accents, and refined typography.

## Affected Files

- `src/layout/ui-main-sidebar/index.tsx` — container, resize handle
- `src/features/task/ui-task-summary-card/index.tsx` — card styling, accents, hover
- `src/features/task/ui-task-list/index.tsx` — list spacing, section headers, footer, empty state
- `src/features/project/ui-sidebar-content-tabs/index.tsx` — tab indicator style
- `src/features/task/ui-status-indicator/index.tsx` — transition colors
- `src/index.css` — new animation keyframes (card enter/exit)

## 1. Task Card Refinements

### Spacing
- Padding: `px-3 py-2` → `px-3.5 py-2.5`
- Gap between cards: `space-y-1` → `space-y-1.5`
- Inner row gap: `gap-1` → `gap-1.5`

### Project Color Accent
- 2px left border using the task's `project.color`
- Rest: `opacity-40`, hover: `opacity-60`, selected: `opacity-100`
- Applied via `style={{ borderLeftColor: projectColor }}` with Tailwind opacity classes
- Creates natural visual grouping in "All" view; reinforces project identity in single-project view

### Hover & Selection
- Hover: `duration-200 ease-out`, `bg-neutral-800/70`, `translate-x-0.5` (2px rightward nudge)
- Selected: `bg-neutral-800` + brighter left accent (full opacity) + `shadow-sm`
- All existing border animations (running, permission, question, completed-unread) remain unchanged

### Typography
- Task name: `font-medium` → `font-semibold`
- Project name: `text-xs text-neutral-400` → `text-[11px] text-neutral-500`
- Time: add `tabular-nums` for stable width as numbers change

### Keyboard Shortcut Badges
- Reduce contrast: `text-neutral-600` text on `bg-neutral-800/50` background
- Feel embedded rather than overlaid

## 2. Sidebar Container & Structure

### Background & Border
- Keep `bg-neutral-900`
- Add `border-r border-neutral-800` for defined edge

### Content Padding
- Task list: `p-2` → `px-2 py-2.5`

### Dividers
- Tabs/content divider: `border-neutral-800` → `border-neutral-700/30` (softer)

### "Completed" Section Header
- `text-[10px] uppercase tracking-wider font-semibold text-neutral-500`
- Divider line extends from label (same visual pattern, refined typography)

### Scroll Area
- Add CSS `mask-image` gradient fade at top and bottom edges (~8px) to indicate scrollability
- Add `overscroll-behavior: contain` to prevent scroll bleed

### Resize Handle
- Rest: `w-0.5` (thinner), hover: `w-1` with blue tint
- Add `transition-all duration-150` for smooth width transition

## 3. Tabs (Tasks / PRs)

### Style Change
- Remove filled pill background (`bg-neutral-700`)
- Active tab: `text-white font-semibold` + 2px bottom border in `bg-blue-500/70`
- Inactive tab: `text-neutral-500`, hover: `text-neutral-300` with `duration-150` transition
- Bottom indicator style (Linear-inspired) feels lighter than filled pills

## 4. Footer

### Divider
- Replace flat `border-t border-neutral-800` with gradient fade: `bg-gradient-to-t from-neutral-900 via-neutral-900 to-transparent` over last ~8px above footer

### Buttons
- `rounded-md` (slightly more rounded)
- Hover: `bg-neutral-800/60` (softer)
- Vertical padding: `py-1.5` → `py-2`

### Backlog Badge
- `bg-neutral-700` → `bg-neutral-700/60`, `text-neutral-400`

## 5. Empty State

### Current
Plain `text-sm text-neutral-500` "No active tasks" centered text.

### Refined
- Icon: `ListTodo` at 24px, `text-neutral-700` above the text
- Main text: `text-neutral-600`
- Subtext: "Press ⌘N to create a task" in `text-[11px] text-neutral-700`
- More top padding for better vertical centering

## 6. Motion & Transitions

### Card Enter/Exit
- New task appears: fade-in + slide-in-from-left (200ms)
- Task moves to completed: fade transition (150ms)
- Keep subtle — no bouncing or overshooting

### Status Indicators
- Add `transition-colors duration-300` so color changes between states animate smoothly

### Selection
- Background and border transitions: `duration-200 ease-out`
- Left accent opacity change transitions smoothly

### Hover Micro-interaction
- `translate-x-0.5` (2px right nudge) with `transition-transform duration-150 ease-out`
- Combined with background color change for satisfying hover response

### Scroll
- `overscroll-behavior: contain` on task list container

### What We're NOT Doing
- No hover scale effects
- No staggered list animations
- No parallax or 3D transforms

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| Card padding | `px-3 py-2` | `px-3.5 py-2.5` |
| Card gap | `space-y-1` | `space-y-1.5` |
| Card left border | none | 2px in project color |
| Card hover | `bg-neutral-800` | `bg-neutral-800/70` + `translate-x-0.5` |
| Task name weight | `font-medium` | `font-semibold` |
| Metadata size | `text-xs` | `text-[11px]` |
| Tabs | Filled pills | Bottom indicator |
| Section header | `text-xs` | `text-[10px] uppercase tracking-wider` |
| Sidebar border | none | `border-r border-neutral-800` |
| Resize handle | `w-1` | `w-0.5` → `w-1` on hover |
| Footer divider | flat border | gradient fade |
| Empty state | text only | icon + text + hint |
| Card enter | instant | fade + slide (200ms) |
| Hover transition | `transition-colors` | + `transition-transform` |
