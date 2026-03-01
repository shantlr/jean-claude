# Add Project Page Redesign Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Redesign the Add Project page (`/projects/new`) to make detected projects the primary focus. The current layout has an awkward conditional two-column structure that shifts depending on whether projects are detected. The new layout is a single centered column where detected projects are always the top section and manual add options are a compact secondary row at the bottom.

## Problems with the Current Page

1. **Layout shift**: The page looks completely different with 0 vs N detected projects (centered single column vs side-by-side)
2. **Wrong hierarchy**: The big "Local Folder / Clone" cards dominate even though detected projects are the fastest path
3. **Full paths are ugly**: `/Users/alice/projects/my-app` is hard to scan; `~/projects/my-app` is much cleaner
4. **No search**: With many detected projects, there's no way to filter
5. **Inline IIFE badge rendering**: The `(() => { ... })()` pattern in JSX is noisy

## Layout

Single centered column, `max-w-lg` (32rem), vertically centered with flex. No conditional structure — the page always has the same shape.

```
┌─────────────────────────────────────────┐
│  Add Project                            │
│                                         │
│  [🔍 Filter projects...]                │  ← search (hidden if 0 projects)
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  my-app         [Claude] [Codex]│    │
│  │  ~/work/my-app                  │    │
│  ├─────────────────────────────────┤    │
│  │  api-service          [OpenCode]│    │
│  │  ~/projects/api-service         │    │
│  ├─────────────────────────────────┤    │
│  │  skeleton...                    │    │  ← shown while loading
│  └─────────────────────────────────┘    │
│                                         │
│  ──────── or add manually ────────      │  ← divider (hidden if 0 projects)
│                                         │
│  [📁 Local Folder] [☁ Clone Azure]     │
└─────────────────────────────────────────┘
```

## Data: `displayPath` field

The `project-detection-service.ts` `detectProjects()` function adds a `displayPath` field that replaces the home directory prefix with `~`:

```typescript
// In detectProjects(), when building detectedProjects:
const homedir = os.homedir();
const displayPath = projectPath.startsWith(homedir + path.sep)
  ? '~' + projectPath.slice(homedir.length)
  : projectPath;

detectedProjects.push({
  path: projectPath,
  name: path.basename(projectPath),
  displayPath,
  sources: Array.from(sources),
});
```

`DetectedProject` in `src/lib/api.ts` gains:
```typescript
displayPath: string;
```

## Detected Projects Section

Shown whenever `!isLoadingDetected || detectedProjects.length > 0`.

**Search box**: Renders above the list when `detectedProjects.length > 0`. Client-side filter on `project.name` and `project.path` (case-insensitive). Controlled by a `searchQuery` state string. Placeholder: `"Filter projects…"`.

**Loading state**: While `isLoadingDetected` is true, show 3 skeleton placeholder cards:
```tsx
<div className="h-14 rounded-lg bg-neutral-800/50 animate-pulse" />
```

**Filtered list**: `detectedProjects.filter(p => matchesSearch(p, searchQuery))`.

**Empty filtered state**: When search has text but no matches:
```
No projects match "foo"
```

**Each project card**:
- Full-width button, `rounded-lg border border-neutral-700 bg-neutral-800/50`, hover `border-neutral-600 bg-neutral-800`
- Two lines:
  - Line 1: project name (left, `text-sm font-medium`) + source badges (right, `flex gap-1`)
  - Line 2: `displayPath` (left, `text-xs text-neutral-500 truncate`)
- Source badges are the existing amber/teal/violet pills, moved to the right side of line 1

```
┌──────────────────────────────────────────┐
│  my-app                  [Claude] [Codex] │
│  ~/work/my-app                            │
└──────────────────────────────────────────┘
```

## Manual Add Section

Two compact equal-width buttons in a row:
- `[📁 Local Folder]` — triggers directory picker, same behaviour as today
- `[☁ Clone from Azure DevOps]` — opens clone pane, same behaviour as today

Button style: `border border-neutral-700 bg-neutral-800/50 py-2.5 rounded-lg` with hover `border-neutral-600 bg-neutral-800`. Small icon + label, left-aligned.

**Divider** (`──── or add manually ────`) only renders when `detectedProjects.length > 0`. When 0 detected projects, the manual buttons are shown without a divider and become the natural focus.

## Badge Rendering Cleanup

Extract the `badgeProps` lookup map outside the component render as a module-level constant to avoid recreating it on every render:

```typescript
const SOURCE_BADGE_CONFIG: Record<string, { className: string; label: string }> = {
  'claude-code': { className: '...amber...', label: 'Claude Code' },
  opencode: { className: '...teal...', label: 'OpenCode' },
  codex: { className: '...violet...', label: 'Codex' },
};
```

## Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | Add `displayPath` field to returned objects |
| `src/lib/api.ts` | Add `displayPath: string` to `DetectedProject` |
| `src/routes/projects/new.tsx` | Full UI rewrite: search state, skeleton loading, new card layout, compact manual buttons, divider |
