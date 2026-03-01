import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';

type DetectedProjectSource = 'claude-code' | 'opencode' | 'codex';

// ─── Concurrency helper ───────────────────────────────────────────────────────

// Max concurrent I/O operations per batch — balances parallelism against file
// descriptor consumption (well below the OS default of 256 on macOS / 1024 on Linux).
const IO_CHUNK_SIZE = 20;

// Runs fn over all items in parallel, but in chunks of IO_CHUNK_SIZE to avoid
// overwhelming the OS with too many concurrent file handles at once.
async function runInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
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
  } catch (err) {
    dbg.ipc('detectClaudeCodeProjects failed (ignored): %O', err);
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
    const dirs = hashDirs.filter((d) => d.isDirectory());

    // Read each hash dir in parallel chunks — all sessions in a hash share the same cwd
    const entries = await runInChunks(dirs, IO_CHUNK_SIZE, async (hashDir) => {
      const hashDirPath = path.join(sessionRootDir, hashDir.name);
      const sessionFiles = await fs.readdir(hashDirPath);

      // Read just the first session file — all sessions in a hash share the same directory
      const firstFile = sessionFiles.find((f: string) => f.endsWith('.json'));
      if (!firstFile) return null;

      try {
        const sessionContent = await fs.readFile(
          path.join(hashDirPath, firstFile),
          'utf-8',
        );
        const session = JSON.parse(sessionContent) as { directory?: string };
        if (typeof session.directory === 'string' && session.directory) {
          return { path: session.directory, source: 'opencode' as const };
        }
      } catch (err) {
        dbg.ipc(
          'detectOpenCodeProjects: skipping malformed session file %s: %O',
          firstFile,
          err,
        );
      }
      return null;
    });

    return entries.filter(
      (e): e is { path: string; source: 'opencode' } => e !== null,
    );
  } catch (err) {
    dbg.ipc('detectOpenCodeProjects failed (ignored): %O', err);
    return [];
  }
}

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
  } catch (err) {
    dbg.ipc('findJsonlFiles: skipping unreadable dir %s: %O', dir, err);
  }
  return results;
}

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

    // Collect all JSONL files from both dirs, then process in parallel chunks
    const allJsonlFiles: string[] = [];
    for (const dir of dirsToScan) {
      allJsonlFiles.push(...(await findJsonlFiles(dir)));
    }

    const cwds = await runInChunks(
      allJsonlFiles,
      IO_CHUNK_SIZE,
      async (filePath) => {
        try {
          const firstLine = await readFirstLine(filePath);
          if (!firstLine) return null;

          const entry = JSON.parse(firstLine) as {
            type?: string;
            payload?: { cwd?: string };
          };

          const cwd = entry.payload?.cwd;
          if (entry.type === 'session_meta' && typeof cwd === 'string' && cwd) {
            return cwd;
          }
        } catch (err) {
          dbg.ipc(
            'detectCodexProjects: skipping malformed file %s: %O',
            filePath,
            err,
          );
        }
        return null;
      },
    );

    // Deduplicate cwds (multiple session files can share the same working dir)
    const seenCwds = new Set<string>();
    const results: { path: string; source: 'codex' }[] = [];
    for (const cwd of cwds) {
      if (cwd && !seenCwds.has(cwd)) {
        seenCwds.add(cwd);
        results.push({ path: cwd, source: 'codex' });
      }
    }

    return results;
  } catch (err) {
    dbg.ipc('detectCodexProjects failed (ignored): %O', err);
    return [];
  }
}

// ─── Merge & Filter ──────────────────────────────────────────────────────────

export async function detectProjects(existingPaths: Set<string>): Promise<
  {
    path: string;
    name: string;
    displayPath: string;
    sources: DetectedProjectSource[];
  }[]
> {
  const jeanClaudeDir = path.join(os.homedir(), '.jean-claude');

  // Run all detectors in parallel; allSettled isolates failures so one broken
  // detector never prevents others from returning results
  const [claudeSettled, opencodeSettled, codexSettled] =
    await Promise.allSettled([
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

  // Merge all results by path, collecting sources per path
  const byPath = new Map<string, Set<DetectedProjectSource>>();

  for (const { path: p, source } of [
    ...claudeResults,
    ...opencodeResults,
    ...codexResults,
  ]) {
    if (!byPath.has(p)) byPath.set(p, new Set());
    byPath.get(p)!.add(source);
  }

  // Apply cheap synchronous filters first, then batch the async pathExists checks
  const homedir = os.homedir();

  const candidates = [...byPath].filter(([projectPath]) => {
    if (existingPaths.has(projectPath)) return false;
    if (
      projectPath.includes('.worktrees') ||
      projectPath.includes('.idling/worktrees') ||
      projectPath.includes('.claude-worktrees')
    )
      return false;
    if (projectPath.startsWith(jeanClaudeDir + path.sep)) return false;
    return true;
  });

  // Check existence in parallel chunks — stat is fast but sequential stat calls add up
  const existenceResults = await runInChunks(
    candidates,
    IO_CHUNK_SIZE,
    async ([projectPath, sources]) => {
      const exists = await pathExists(projectPath);
      return exists ? ([projectPath, sources] as const) : null;
    },
  );

  const detectedProjects: {
    path: string;
    name: string;
    displayPath: string;
    sources: DetectedProjectSource[];
  }[] = [];

  for (const result of existenceResults) {
    if (!result) continue;
    const [projectPath, sources] = result;
    const displayPath = projectPath.startsWith(homedir + path.sep)
      ? '~' + projectPath.slice(homedir.length)
      : projectPath;
    detectedProjects.push({
      path: projectPath,
      name: path.basename(projectPath),
      displayPath,
      sources: Array.from(sources),
    });
  }

  // Sort by name
  detectedProjects.sort((a, b) => a.name.localeCompare(b.name));

  return detectedProjects;
}
