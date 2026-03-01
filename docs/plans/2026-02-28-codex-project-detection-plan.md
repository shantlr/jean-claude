# Codex CLI Project Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex CLI (`~/.codex/sessions/`) as a third project detection source alongside Claude Code and OpenCode.

**Architecture:** Extend the existing `project-detection-service.ts` with a `detectCodexProjects()` function. Two private helpers (`findJsonlFiles`, `readFirstLine`) support efficient recursive file scanning. The `DetectedProjectSource` union gains `'codex'`. The UI badge renderer is upgraded from a ternary to a lookup map to cleanly handle three sources.

**Tech Stack:** Node.js `fs/promises`, TypeScript strict mode, Tailwind CSS (violet badge)

---

## Reference Files

Skim before starting:
- `electron/services/project-detection-service.ts` — add detector + helpers here (lines 1–141)
- `src/lib/api.ts` lines 89–93 — `DetectedProject` type to update
- `src/routes/projects/new.tsx` lines 234–249 — badge renderer to refactor

## Codex Session Format (critical context)

Sessions live at `{CODEX_HOME:-~/.codex}/sessions/{YYYY}/{MM}/{DD}/{name}.jsonl`
and also at `{CODEX_HOME:-~/.codex}/archived_sessions/**/*.jsonl`.

The **first line** of each `.jsonl` file is the session metadata:
```json
{
  "type": "session_meta",
  "payload": {
    "cwd": "/Users/alice/projects/my-app",
    ...
  }
}
```

Only `type === "session_meta"` lines contain `payload.cwd`. We read **only the first line** of each file (the rest can be megabytes of message history — don't read it all).

---

### Task 1: Add Codex detector to `project-detection-service.ts`

**Files:**
- Modify: `electron/services/project-detection-service.ts`

This is the only substantive code change. Three things happen in this file:
1. `'codex'` added to `DetectedProjectSource`
2. Two private helpers added (`readFirstLine`, `findJsonlFiles`)
3. `detectCodexProjects()` added and wired into `detectProjects()`

**Step 1: Extend `DetectedProjectSource`**

Find line 8:
```typescript
type DetectedProjectSource = 'claude-code' | 'opencode';
```
Replace with:
```typescript
type DetectedProjectSource = 'claude-code' | 'opencode' | 'codex';
```

**Step 2: Add the two helpers after the OpenCode detector (after the closing `}` of `detectOpenCodeProjects`, before the `// ─── Merge & Filter` comment)**

```typescript
// ─── Codex helpers ────────────────────────────────────────────────────────────

// Reads the first line of a file without loading the whole file into memory.
// Codex JSONL session files can be large; we only need the session_meta line.
async function readFirstLine(filePath: string): Promise<string | null> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, 8192, 0);
    const chunk = buffer.slice(0, bytesRead).toString('utf-8');
    const newlineIdx = chunk.indexOf('\n');
    return newlineIdx === -1 ? chunk.trim() : chunk.slice(0, newlineIdx).trim();
  } finally {
    await handle.close();
  }
}

// Recursively collects all *.jsonl file paths under a directory.
async function findJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findJsonlFiles(fullPath)));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable — skip silently
  }
  return results;
}
```

**Step 3: Add `detectCodexProjects()` after the helpers, before `// ─── Merge & Filter`**

```typescript
// ─── Codex ───────────────────────────────────────────────────────────────────

async function detectCodexProjects(): Promise<
  { path: string; source: 'codex' }[]
> {
  try {
    const codexHome =
      process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');

    // Scan both active sessions and archived sessions
    const dirsToScan = [
      path.join(codexHome, 'sessions'),
      path.join(codexHome, 'archived_sessions'),
    ];

    const seenCwds = new Set<string>();
    const results: { path: string; source: 'codex' }[] = [];

    for (const dir of dirsToScan) {
      const jsonlFiles = await findJsonlFiles(dir);

      for (const filePath of jsonlFiles) {
        try {
          const firstLine = await readFirstLine(filePath);
          if (!firstLine) continue;

          const entry = JSON.parse(firstLine) as {
            type?: string;
            payload?: { cwd?: string };
          };

          const cwd = entry.payload?.cwd;
          if (
            entry.type === 'session_meta' &&
            typeof cwd === 'string' &&
            cwd &&
            !seenCwds.has(cwd)
          ) {
            seenCwds.add(cwd);
            results.push({ path: cwd, source: 'codex' });
          }
        } catch (err) {
          dbg.ipc(
            'detectCodexProjects: skipping malformed file %s: %O',
            filePath,
            err,
          );
        }
      }
    }

    return results;
  } catch (err) {
    dbg.ipc('detectCodexProjects failed (ignored): %O', err);
    return [];
  }
}
```

**Step 4: Wire into `detectProjects()`**

Find the `Promise.allSettled` call in `detectProjects`:
```typescript
  const [claudeSettled, opencodeSettled] = await Promise.allSettled([
    detectClaudeCodeProjects(),
    detectOpenCodeProjects(),
  ]);
  const claudeResults =
    claudeSettled.status === 'fulfilled' ? claudeSettled.value : [];
  const opencodeResults =
    opencodeSettled.status === 'fulfilled' ? opencodeSettled.value : [];
```

Replace with:
```typescript
  const [claudeSettled, opencodeSettled, codexSettled] = await Promise.allSettled([
    detectClaudeCodeProjects(),
    detectOpenCodeProjects(),
    detectCodexProjects(),
  ]);
  const claudeResults =
    claudeSettled.status === 'fulfilled' ? claudeSettled.value : [];
  const opencodeResults =
    opencodeSettled.status === 'fulfilled' ? opencodeSettled.value : [];
  const codexResults =
    codexSettled.status === 'fulfilled' ? codexSettled.value : [];
```

Also update the spread that builds `byPath` — find:
```typescript
  for (const { path: p, source } of [...claudeResults, ...opencodeResults]) {
```
Replace with:
```typescript
  for (const { path: p, source } of [...claudeResults, ...opencodeResults, ...codexResults]) {
```

**Step 5: Run type check**

```bash
pnpm ts-check
```

Expected: No errors in `electron/services/project-detection-service.ts`.

---

### Task 2: Update `DetectedProject` type in `src/lib/api.ts`

**Files:**
- Modify: `src/lib/api.ts` lines 89–93

**Step 1: Add `'codex'` to the sources union**

Find:
```typescript
export interface DetectedProject {
  path: string;
  name: string;
  sources: ('claude-code' | 'opencode')[];
}
```

Replace with:
```typescript
export interface DetectedProject {
  path: string;
  name: string;
  sources: ('claude-code' | 'opencode' | 'codex')[];
}
```

**Step 2: Run type check**

```bash
pnpm ts-check
```

Expected: No new errors related to `DetectedProject`.

---

### Task 3: Update badge renderer in `src/routes/projects/new.tsx`

**Files:**
- Modify: `src/routes/projects/new.tsx`

The current ternary `source === 'claude-code' ? amber : teal` breaks with a third source. Replace with a lookup map defined inside the component.

**Step 1: Replace the badge renderer block**

Find the entire badge rendering block (lines 234–249):
```tsx
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
```

Replace with:
```tsx
                      {project.sources.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {project.sources.map((source) => {
                            const badgeProps: Record<
                              string,
                              { className: string; label: string }
                            > = {
                              'claude-code': {
                                className:
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400',
                                label: 'Claude Code',
                              },
                              opencode: {
                                className:
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/15 text-teal-400',
                                label: 'OpenCode',
                              },
                              codex: {
                                className:
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-400',
                                label: 'Codex',
                              },
                            };
                            const badge = badgeProps[source];
                            if (!badge) return null;
                            return (
                              <span key={source} className={badge.className}>
                                {badge.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
```

**Step 2: Run type check and lint**

```bash
pnpm ts-check
pnpm lint --fix
```

Expected: No errors.

---

### Task 4: Final verification

**Step 1: Full type check and lint**

```bash
pnpm ts-check && pnpm lint
```

Expected: Clean output (pre-existing `node_modules` errors are irrelevant; no errors should appear for the four changed files).

**Step 2: Confirm Codex detection works on this machine**

Real Codex sessions exist at `~/.codex/sessions/`. After running the app (`pnpm dev`), navigate to **Add Project** and verify:
- Projects from Codex sessions appear with a **violet** `[Codex]` badge
- If the same path also appears in Claude Code history, both `[Claude Code]` and `[Codex]` badges show on one card
- No duplicate entries for the same path

**Step 3: Confirm graceful failure without Codex**

`CODEX_HOME=/nonexistent pnpm dev` — the Add Project page should still show Claude Code and OpenCode results normally; the Codex detector returns `[]` silently.

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `electron/services/project-detection-service.ts` | Add `'codex'` to union, add `readFirstLine` + `findJsonlFiles` helpers, add `detectCodexProjects()`, wire into `detectProjects()` |
| `src/lib/api.ts` | Add `'codex'` to `sources` union |
| `src/routes/projects/new.tsx` | Replace ternary with lookup map, add violet Codex badge |
