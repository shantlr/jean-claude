# Multi-CLI Project Detection Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Extend project detection on the Add Project page to surface directories from multiple AI coding agent CLIs, not just Claude Code. The first iteration adds OpenCode support. The architecture is designed to make adding future CLIs (Codex, Copilot, etc.) trivial.

## Background

Currently Jean-Claude detects projects by reading `~/.claude.json`, where Claude Code stores all projects it has worked in as keys of a `projects` object. The UI shows these under a "Detected from Claude Code" heading.

Other CLIs (OpenCode, Codex, Copilot) do not maintain an explicit project registry. They store session history files that implicitly record the working directory used for each session.

## Scope

- **In scope:** Claude Code (existing) + OpenCode (new)
- **Out of scope (future):** Codex CLI, GitHub Copilot CLI

## Data Model

`DetectedProject` in `src/lib/api.ts` gains a `sources` field:

```typescript
export interface DetectedProject {
  path: string;
  name: string;
  sources: ('claude-code' | 'opencode')[];
}
```

If the same path is detected by both CLIs, it produces one entry with both sources listed (e.g. `['claude-code', 'opencode']`).

## Service Architecture

A new `electron/services/project-detection-service.ts` owns all detection logic. It exposes three functions:

```typescript
// Reads ~/.claude.json
async function detectClaudeCodeProjects(): Promise<{ path: string; source: 'claude-code' }[]>

// Reads OpenCode session files from OPENCODE_DATA_DIR or ~/.local/share/opencode
async function detectOpenCodeProjects(): Promise<{ path: string; source: 'opencode' }[]>

// Runs both detectors in parallel, merges by path, applies shared filtering
export async function detectProjects(existingPaths: Set<string>): Promise<DetectedProject[]>
```

### OpenCode Detection

OpenCode stores session data at:
```
{OPENCODE_DATA_DIR:-~/.local/share/opencode}/storage/session/{projectHash}/{sessionId}.json
```

Each session JSON file contains a `directory` field with the absolute working directory path. To get the project directory for each `projectHash` folder, we read one session file from that folder (any file will do, as all sessions within a hash share the same directory).

The data directory is resolved as:
1. `process.env.OPENCODE_DATA_DIR` if set
2. `~/.local/share/opencode` otherwise

### Shared Filtering (in `detectProjects`)

All paths from all detectors pass through the same shared filters before being returned:

- Skip paths already in the Jean-Claude database (`existingPaths`)
- Skip worktree paths (containing `.worktrees`, `.idling/worktrees`, `.claude-worktrees`)
- Skip paths inside `~/.jean-claude`
- Skip paths that no longer exist on disk (`fs.access` check)

Each individual detector fails silently (returns `[]`) if its config file or session directory does not exist.

## IPC Handler Changes

The `projects:getDetected` handler in `electron/ipc/handlers.ts` becomes a thin delegation to the new service:

```typescript
ipcMain.handle('projects:getDetected', async () => {
  const existingProjects = await ProjectRepository.findAll();
  const existingPaths = new Set(existingProjects.map((p) => p.path));
  return detectProjects(existingPaths);
});
```

The existing detection logic inside the handler is removed and replaced by the service.

## UI Changes

Two changes in `src/routes/projects/new.tsx`:

1. **Section heading** changes from `"Detected from Claude Code"` to `"Detected from AI coding agents"`

2. **Source badges** are added to each project card, displayed below the path. Each source renders as a small pill label:
   - Claude Code → amber/orange pill
   - OpenCode → teal pill

```
┌─────────────────────────────────────────────┐
│ 📂 my-project                               │
│    ~/projects/my-project                    │
│    [Claude Code] [OpenCode]                 │
└─────────────────────────────────────────────┘
```

Badge colours match the existing status badge patterns in the app.

## Error Handling

- If `~/.claude.json` is missing or malformed → `detectClaudeCodeProjects` returns `[]`
- If OpenCode session directory doesn't exist → `detectOpenCodeProjects` returns `[]`
- If an individual session JSON file is malformed → skip that file, continue
- All errors are logged via `dbg.ipc` and suppressed from the caller

## Extensibility

Adding a new CLI in the future requires:
1. Adding a new source literal to the `sources` union type in `DetectedProject`
2. Implementing a new `detectXxxProjects()` function in the service
3. Adding it to the `Promise.allSettled` call in `detectProjects()`
4. Adding a new badge colour in the UI

No changes to the IPC handler or API surface are needed.

## Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | **New** — all detection logic |
| `electron/ipc/handlers.ts` | Replace inline detection with service call |
| `src/lib/api.ts` | Add `sources` field to `DetectedProject` |
| `src/routes/projects/new.tsx` | Update heading + add source badges |
