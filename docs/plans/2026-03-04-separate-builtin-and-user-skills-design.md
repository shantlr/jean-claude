# Separate Built-in and User Skills in Global Settings

## Problem

The global skills settings page displays all skills (JC-managed, legacy, plugin) in a single flat grid. Users can only distinguish skill origins via small source badges on cards. This makes it hard to see at a glance which skills you created vs which came from elsewhere.

## Design

Split the single grid into two labeled sections:

### Sections

1. **"My Skills"** — JC-managed user skills (`editable === true`)
   - Created through Jean-Claude's UI, stored in canonical location
   - Can be toggled, edited, deleted
   - Green-tinted section header (matches project-level "Project Skills" pattern)

2. **"Installed Skills"** — Legacy user + plugin skills (`editable === false`)
   - Manually placed in backend directories or installed via plugins
   - Read-only (details view, no edit form)
   - Neutral section header (matches project-level "Inherited" pattern)

### Filtering Logic

```ts
const mySkills = skills.filter(s => s.editable);
const installedSkills = skills.filter(s => !s.editable);
```

### Unchanged Elements

- Toolbar buttons ("Migrate Legacy Skills" + "Add") stay in top-right
- Right pane behavior unchanged (SkillForm for editable, SkillDetails for non-editable)
- SkillCardGrid component reused as-is for each section
- Empty sections hidden (no empty header shown)

## Approach

**UI-only change** — filter the existing `useAllManagedSkills()` result in the component. No hook, service, or IPC changes needed.

## Files Changed

- `src/features/settings/ui-skills-settings/index.tsx` — split grid into two sections with headers
