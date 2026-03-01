# Skills Card Grid with Backend Badge

## Problem

The skills settings UI uses a list layout with a backend selector dropdown. Users must switch between backends to see their skills, and the list view doesn't provide a good visual overview. We want a more scannable, card-based grid that merges skills from all backends with badge differentiation.

## Design

### Layout

Keep the existing two-pane structure:

```
┌─────────────────────────────────┬────────────────┐
│  Skills                  [+Add] │  Detail Panel   │
│  ┌────────┐ ┌────────┐         │  (appears on    │
│  │ Card 1 │ │ Card 2 │         │   card click    │
│  │ name   │ │ name   │         │   or +Add)      │
│  │ desc.. │ │ desc.. │         │                 │
│  │ [CC]   │ │ [OC]   │         │  Name: ...      │
│  └────────┘ └────────┘         │  Desc: ...      │
│  ┌────────┐ ┌────────┐         │  Content: ...   │
│  │ Card 3 │ │ Card 4 │         │                 │
│  └────────┘ └────────┘         │  [Edit] [Del]   │
└─────────────────────────────────┴────────────────┘
```

**Left pane:** Card grid (replaces list + backend selector)
**Right pane:** Detail/edit panel (reuses existing SkillDetails and SkillForm components)

### What Changes

1. **Remove backend selector dropdown** — no longer needed
2. **Replace skill-list.tsx with skill-card-grid.tsx** — card-based grid component
3. **Merge skills from all backends** — new `useAllManagedSkills()` hook
4. **Add backend badge to each card** — colored pill showing "Claude Code" or "OpenCode"
5. **Flat layout** — no section headers for User/Plugin grouping; use badges only

### Card Design

Each card displays:
- **Wand icon** — purple if enabled, gray if disabled
- **Skill name** — bold, truncated to 1 line
- **Description** — 1-2 lines, truncated with ellipsis
- **Backend badge** — small colored pill: "Claude Code" (orange) / "OpenCode" (blue)
- **Source badge** — "Plugin" pill (if plugin source), "User" pill (if user source)
- **Enabled state** — visual distinction (opacity/border) for disabled skills

Clicking a card selects it and shows the detail panel on the right.
Selected card gets a highlight border (blue-500, matching current selected state).

### Grid Layout

CSS Grid with responsive columns:
```css
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
```

This gives 2-3 columns depending on the available width of the left pane.

### Data Fetching

New composite hook `useAllManagedSkills()`:
- Internally calls `useManagedSkills('claude-code')` and `useManagedSkills('opencode')`
- Merges results into a single array
- Deduplicates by `skillPath` (skills may appear in both backends)
- Returns combined loading/error states

### Mutations

All mutations (enable, disable, delete, create, update) already accept `backendType` as a parameter. Each skill carries its `backendType`, so mutations work unchanged — just pass the skill's own `backendType`.

### Component Changes

| File | Change |
|------|--------|
| `ui-skills-settings/index.tsx` | Remove backend selector state, use `useAllManagedSkills()`, remove source grouping |
| `ui-skills-settings/skill-list.tsx` | Replace entirely with `skill-card-grid.tsx` |
| `ui-skills-settings/skill-details.tsx` | Add backend badge display, keep rest as-is |
| `ui-skills-settings/skill-form.tsx` | Add backend selector to create form (need to know which backend to create for) |
| `src/hooks/use-managed-skills.ts` | Add `useAllManagedSkills()` hook |

### Create Flow

When creating a new skill, the form needs to know which backend to create it for. Add a backend selector **inside the create form only** (not in the main grid view). Default to 'claude-code'.

### Edge Cases

- **Empty state**: Show a centered empty state message in the grid area
- **Loading state**: Show skeleton cards (or simple loading text)
- **Both backends empty**: Single empty state for the whole grid
- **One backend errors**: Show skills from the successful backend, display error toast for the failed one
