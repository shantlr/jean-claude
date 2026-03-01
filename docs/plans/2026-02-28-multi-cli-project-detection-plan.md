# Multi-CLI Project Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect projects from OpenCode (in addition to Claude Code) on the Add Project page, showing source badges per CLI.

**Architecture:** A new `project-detection-service.ts` owns all detection logic. Each CLI has its own detector function that reads session/config files and returns `{ path, source }[]`. Results are merged by path, deduplicated, filtered, and returned. The IPC handler delegates entirely to the service.

**Tech Stack:** Node.js `fs/promises`, TypeScript strict mode, Electron IPC, React + TanStack Query

---

## Reference Files

Before starting, skim these:
- `electron/ipc/handlers.ts` lines 1080–1141 — current detection logic to be extracted
- `src/lib/api.ts` lines 89–92 — `DetectedProject` type to update
- `src/routes/projects/new.tsx` lines 34–38, 212–239 — UI to update
- `electron/lib/fs.ts` — `pathExists` utility used in detection

---

### Task 1: Create `project-detection-service.ts`

**Files:**
- Create: `electron/services/project-detection-service.ts`

This service owns all CLI project detection. It extracts existing Claude Code detection from the IPC handler and adds OpenCode detection.

**Step 1: Create the file with the Claude Code detector**

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { pathExists } from '../lib/fs';

export type DetectedProjectSource = 'claude-code' | 'opencode';

export interface DetectedProject {
  path: string;
  name: string;
  sources: DetectedProjectSource[];
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

async function detectClaudeCodeProjects(): Promise<
  { path: string; source: 'claude-code' }[]
> {
  try {
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    const content = await fs.readFile(claudeJsonPath, 'utf-8');
    const claudeJson = JSON.parse(content) as {
      projects?: Record<string, unknown>;
    };

    if (!claudeJson.projects) return [];

    return Object.keys(claudeJson.projects).map((p) => ({
      path: p,
      source: 'claude-code' as const,
    }));
  } catch {
    return [];
  }
}

// ─── OpenCode ─────────────────────────────────────────────────────────────────

async function detectOpenCodeProjects(): Promise<
  { path: string; source: 'opencode' }[]
> {
  try {
    const dataDir =
      process.env.OPENCODE_DATA_DIR ??
      path.join(os.homedir(), '.local', 'share', 'opencode');
    const sessionRootDir = path.join(dataDir, 'storage', 'session');

    const hashDirs = await fs.readdir(sessionRootDir, { withFileTypes: true });
    const results: { path: string; source: 'opencode' }[] = [];

    for (const hashDir of hashDirs) {
      if (!hashDir.isDirectory()) continue;

      const hashDirPath = path.join(sessionRootDir, hashDir.name);
      const sessionFiles = await fs.readdir(hashDirPath);

      // Read just the first session file — all sessions in a hash share the same directory
      const firstFile = sessionFiles.find((f) => f.endsWith('.json'));
      if (!firstFile) continue;

      try {
        const sessionContent = await fs.readFile(
          path.join(hashDirPath, firstFile),
          'utf-8',
        );
        const session = JSON.parse(sessionContent) as { directory?: string };
        if (typeof session.directory === 'string' && session.directory) {
          results.push({ path: session.directory, source: 'opencode' });
        }
      } catch {
        // Skip malformed session files
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Merge & Filter ──────────────────────────────────────────────────────────

export async function detectProjects(
  existingPaths: Set<string>,
): Promise<DetectedProject[]> {
  const jeanClaudeDir = path.join(os.homedir(), '.jean-claude');

  // Run all detectors in parallel
  const [claudeResults, opencodeResults] = await Promise.all([
    detectClaudeCodeProjects(),
    detectOpenCodeProjects(),
  ]);

  // Merge all results by path, collecting sources per path
  const byPath = new Map<string, Set<DetectedProjectSource>>();

  for (const { path: p, source } of [...claudeResults, ...opencodeResults]) {
    if (!byPath.has(p)) byPath.set(p, new Set());
    byPath.get(p)!.add(source);
  }

  // Apply shared filters and build final list
  const detectedProjects: DetectedProject[] = [];

  for (const [projectPath, sources] of byPath) {
    // Skip if already in database
    if (existingPaths.has(projectPath)) continue;

    // Skip worktree paths
    if (
      projectPath.includes('.worktrees') ||
      projectPath.includes('.idling/worktrees') ||
      projectPath.includes('.claude-worktrees')
    ) {
      continue;
    }

    // Skip paths inside ~/.jean-claude
    if (projectPath.startsWith(jeanClaudeDir)) continue;

    // Skip paths that no longer exist on disk
    const exists = await pathExists(projectPath);
    if (!exists) continue;

    detectedProjects.push({
      path: projectPath,
      name: path.basename(projectPath),
      sources: Array.from(sources),
    });
  }

  // Sort by name
  detectedProjects.sort((a, b) => a.name.localeCompare(b.name));

  return detectedProjects;
}
```

**Step 2: Run type check to verify it compiles**

```bash
pnpm ts-check
```

Expected: No errors in `electron/services/project-detection-service.ts`.

**Step 3: Commit**

```bash
git add electron/services/project-detection-service.ts
git commit -m "feat: add project-detection-service with claude-code and opencode detectors"
```

---

### Task 2: Update `DetectedProject` type in `src/lib/api.ts`

**Files:**
- Modify: `src/lib/api.ts` lines 89–92

**Step 1: Add `sources` field to `DetectedProject`**

Find this block:

```typescript
export interface DetectedProject {
  path: string;
  name: string;
}
```

Replace with:

```typescript
export interface DetectedProject {
  path: string;
  name: string;
  sources: ('claude-code' | 'opencode')[];
}
```

**Step 2: Run type check**

```bash
pnpm ts-check
```

Expected: Only new type errors appear in files that consume `DetectedProject` (they will be fixed in later tasks). Do not fix them yet.

**Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add sources field to DetectedProject type"
```

---

### Task 3: Update IPC handler to use the service

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add the import**

Near the top of the file, alongside other service imports, add:

```typescript
import { detectProjects } from '../services/project-detection-service';
```

**Step 2: Replace the handler body**

Find the entire `ipcMain.handle('projects:getDetected', ...)` block (currently lines 1080–1141). Replace it with:

```typescript
ipcMain.handle('projects:getDetected', async () => {
  const existingProjects = await ProjectRepository.findAll();
  const existingPaths = new Set(existingProjects.map((p) => p.path));
  return detectProjects(existingPaths);
});
```

The old inline detection code (reading `~/.claude.json`, filtering, sorting) is entirely deleted — that logic now lives in the service.

**Step 3: Run type check and lint**

```bash
pnpm ts-check
pnpm lint --fix
```

Expected: No errors in `electron/ipc/handlers.ts`.

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "refactor: delegate project detection to project-detection-service"
```

---

### Task 4: Update the UI

**Files:**
- Modify: `src/routes/projects/new.tsx`

**Step 1: Update the section heading**

Find:
```tsx
<h2 className="mb-3 text-sm font-medium text-neutral-400">
  Detected from Claude Code
</h2>
```

Replace with:
```tsx
<h2 className="mb-3 text-sm font-medium text-neutral-400">
  Detected from AI coding agents
</h2>
```

**Step 2: Add source badges inside the project card**

The source badge config lives locally in the component. Find the project card's inner `<div className="min-w-0 flex-1">` block:

```tsx
<div className="min-w-0 flex-1">
  <div className="text-sm font-medium">
    {decodeURIComponent(project.name)}
  </div>
  <div className="truncate text-xs text-neutral-500">
    {project.path}
  </div>
</div>
```

Replace with:

```tsx
<div className="min-w-0 flex-1">
  <div className="text-sm font-medium">
    {decodeURIComponent(project.name)}
  </div>
  <div className="truncate text-xs text-neutral-500">
    {project.path}
  </div>
  {project.sources.length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      {project.sources.map((source) => (
        <span
          key={source}
          className={
            source === 'claude-code'
              ? 'rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400'
              : 'rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/15 text-teal-400'
          }
        >
          {source === 'claude-code' ? 'Claude Code' : 'OpenCode'}
        </span>
      ))}
    </div>
  )}
</div>
```

**Step 3: Run type check and lint**

```bash
pnpm ts-check
pnpm lint --fix
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/routes/projects/new.tsx
git commit -m "feat: show source badges on detected projects, update heading"
```

---

### Task 5: Final verification

**Step 1: Full type check and lint**

```bash
pnpm ts-check && pnpm lint
```

Expected: Clean output — no errors or warnings.

**Step 2: Manual smoke test (if dev server available)**

If the dev server can be started:
```bash
pnpm dev
```

Navigate to **Add Project**. Verify:
- Section heading reads "Detected from AI coding agents"
- Projects detected from Claude Code show an amber `[Claude Code]` badge
- If OpenCode has been used locally, those projects show a teal `[OpenCode]` badge
- Projects detected by both show both badges
- No duplicate entries for the same path

**Step 3: Verify OpenCode detection without OpenCode installed**

If `~/.local/share/opencode/` does not exist, the detected list should still render correctly (OpenCode detector returns `[]` silently).

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | **New** |
| `electron/ipc/handlers.ts` | Handler body replaced with service call |
| `src/lib/api.ts` | `sources` field added to `DetectedProject` |
| `src/routes/projects/new.tsx` | Heading updated + source badges added |
