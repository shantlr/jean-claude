import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../database/repositories/projects', () => ({
  ProjectRepository: vi.fn(),
}));

vi.mock('./mcp-template-service', () => ({
  installMcpForWorktree: vi.fn(),
}));

vi.mock('../lib/fs', () => ({
  isEnoent: (error: unknown) =>
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT',
  pathExists: vi.fn(async () => true),
}));

const execFileAsync = promisify(execFile);
const fs =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const { getWorktreeDiff } = await import('./worktree-service');

let testDir: string;

async function git(args: string[], cwd = testDir) {
  return execFileAsync('git', args, { cwd, encoding: 'utf-8' });
}

async function writeFile(relativePath: string, content: string) {
  const filePath = path.join(testDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function commit(message: string) {
  await git(['add', '.']);
  await git(['commit', '-m', message]);
  const { stdout } = await git(['rev-parse', 'HEAD']);
  return stdout.trim();
}

describe('getWorktreeDiff', () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-worktree-diff-'));
    await git(['init', '-b', 'main']);
    await git(['config', 'user.email', 'test@example.com']);
    await git(['config', 'user.name', 'Test User']);
  });

  afterEach(async () => {
    if (testDir) await fs.rm(testDir, { force: true, recursive: true });
  });

  it('uses local source branch before origin when calculating task diff', async () => {
    await writeFile('base.txt', 'base\n');
    await commit('base');
    await git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);

    await writeFile('source-only.txt', 'local source commit\n');
    await writeFile('task.txt', 'before\n');
    const startCommitHash = await commit('local source commit');

    await git(['switch', '-c', 'task']);
    await writeFile('task.txt', 'after\n');

    const diff = await getWorktreeDiff(testDir, startCommitHash, 'main');

    expect(diff.files).toEqual([
      {
        path: 'task.txt',
        status: 'modified',
        additions: 1,
        deletions: 1,
      },
    ]);
  });

  it('hides changes merged from the source branch', async () => {
    await writeFile('base.txt', 'base\n');
    await writeFile('task.txt', 'before\n');
    const startCommitHash = await commit('base');

    await git(['switch', '-c', 'task']);
    await writeFile('task.txt', 'after\n');
    await commit('task change');

    await git(['switch', 'main']);
    await writeFile('source-only.txt', 'source branch change\n');
    await commit('source change');

    await git(['switch', 'task']);
    await git(['merge', '--no-edit', 'main']);

    const diff = await getWorktreeDiff(testDir, startCommitHash, 'main');

    expect(diff.files).toEqual([
      {
        path: 'task.txt',
        status: 'modified',
        additions: 1,
        deletions: 1,
      },
    ]);
  });
});
