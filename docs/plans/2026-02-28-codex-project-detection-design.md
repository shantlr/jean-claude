# Codex CLI Project Detection Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Extend the existing multi-CLI project detection service to include Codex CLI (OpenAI). Codex project paths are extracted from session JSONL files stored under `~/.codex/`. The architecture (multi-source detector pattern in `project-detection-service.ts`) is already in place from the OpenCode implementation.

## Session File Format

Codex stores sessions as JSONL files. The first line of each file is a `session_meta` object containing the working directory:

```json
{
  "timestamp": "2026-02-26T00:55:53.150Z",
  "type": "session_meta",
  "payload": {
    "id": "...",
    "cwd": "/Users/alice/projects/my-app",
    "cli_version": "0.104.0-alpha.1",
    ...
  }
}
```

The key field is `payload.cwd` — the working directory where the session was started.

## Directory Structure

```
{CODEX_HOME:-~/.codex}/
  sessions/
    {YYYY}/
      {MM}/
        {DD}/
          {name}.jsonl      ← session files (first line = session_meta)
  archived_sessions/
    {hash-or-id}/           ← older archived sessions (same JSONL format)
      ...
```

`CODEX_HOME` env var overrides the default `~/.codex` location.

Both `sessions/` and `archived_sessions/` are scanned to maximise project coverage.

## Changes

### `electron/services/project-detection-service.ts`

1. Add `'codex'` to the `DetectedProjectSource` union:
   ```typescript
   type DetectedProjectSource = 'claude-code' | 'opencode' | 'codex';
   ```

2. Add a private `detectCodexProjects()` function:
   - Resolve `codexHome` = `CODEX_HOME` env var ?? `~/.codex`
   - Recursively find all `*.jsonl` files under `{codexHome}/sessions/` and `{codexHome}/archived_sessions/`
   - For each file, read only the **first line**, parse JSON
   - If `type === 'session_meta'` and `payload.cwd` is a non-empty string, collect `payload.cwd`
   - Deduplicate paths within the detector (many session files share the same `cwd`)
   - Return `{ path: string; source: 'codex' }[]`
   - Fail silently on any error (missing directory, malformed JSON, etc.)

3. Add `detectCodexProjects()` to the `Promise.allSettled` call in `detectProjects()`.

### `src/lib/api.ts`

```typescript
sources: ('claude-code' | 'opencode' | 'codex')[];
```

### `src/routes/projects/new.tsx`

Add a **violet** badge for Codex:
```tsx
source === 'codex'
  ? 'rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-400'
```
Label: `"Codex"`

Update the badge renderer to handle three sources (currently a ternary `claude-code` vs else; must become a proper three-way lookup).

## Error Handling

- Missing `~/.codex/` → `detectCodexProjects` returns `[]` silently, logged via `dbg.ipc`
- Malformed first line → skip that file, continue, logged via `dbg.ipc`
- All shared filters (worktrees, `~/.jean-claude`, non-existent paths, already-in-DB) applied as before in `detectProjects()`

## Extensibility Note

After this change, adding a fourth CLI requires only: add source literal, implement detector, add to `Promise.allSettled`, add badge colour. No IPC or API surface changes needed.

## Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | Add `'codex'` to union + `detectCodexProjects()` + wire into `detectProjects()` |
| `src/lib/api.ts` | Add `'codex'` to `sources` union |
| `src/routes/projects/new.tsx` | Add violet Codex badge, fix ternary → three-way lookup |
