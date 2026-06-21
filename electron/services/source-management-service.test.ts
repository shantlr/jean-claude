import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceManifest } from '@shared/source-management-types';

import {
  addGitHubSource,
  buildGithubClonePath,
  getSourceProvenanceByInstalledPath,
  getSourceProvenanceByInstalledPathMap,
  installSourceItems,
  listSources,
  parseGitHubRepoUrl,
  readSourceManifest,
  refreshSource,
  removeSource,
  scanSourceDirectory,
  setGitRunnerForTests,
  setSourceManifestPathForTests,
  setSourcesBaseDirForTests,
  updateSourceInstall,
  writeSourceManifest,
} from './source-management-service';

let testDir: string;
let manifestPath: string;

beforeEach(async () => {
  await fs.mkdir(os.tmpdir(), { recursive: true });
  await cleanupInstallTestPaths();
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-source-manifest-'));
  manifestPath = path.join(testDir, 'sources', 'manifest.json');
  setSourceManifestPathForTests(manifestPath);
  setSourcesBaseDirForTests(path.join(testDir, 'sources'));
});

afterEach(async () => {
  setSourceManifestPathForTests();
  setSourcesBaseDirForTests();
  setGitRunnerForTests();
  await fs.rm(testDir, { force: true, recursive: true });
  await cleanupInstallTestPaths();
});

describe('source management GitHub URLs', () => {
  it('parses HTTPS GitHub URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
      url: 'https://github.com/owner/repo',
    });
  });

  it('parses .git GitHub URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
      url: 'https://github.com/owner/repo',
    });
  });

  it('rejects non-GitHub URLs', () => {
    expect(() => parseGitHubRepoUrl('https://example.com/a/b')).toThrow(
      'GitHub',
    );
  });

  it('rejects malformed owner and repo paths', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/-owner/repo')).toThrow(
      'Invalid GitHub owner or repository name',
    );
    expect(() => parseGitHubRepoUrl('https://github.com/owner/.git')).toThrow(
      'Invalid GitHub owner or repository name',
    );
    expect(() =>
      parseGitHubRepoUrl('https://github.com/owner/repo/extra'),
    ).toThrow('GitHub repository URL');
  });
});

describe('source manifest', () => {
  it('returns empty manifest when file is missing', async () => {
    await fs.rm(manifestPath, { force: true });

    await expect(readSourceManifest()).resolves.toEqual({
      version: 1,
      sources: [],
    });
  });

  it('round trips manifest JSON', async () => {
    const manifest: SourceManifest = { version: 1, sources: [] };

    await writeSourceManifest(manifest);

    await expect(readSourceManifest()).resolves.toEqual(manifest);
  });

  it('rejects invalid manifest shape', async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, '{"version":2,"sources":[]}', 'utf-8');

    await expect(readSourceManifest()).rejects.toThrow(
      'Invalid source manifest',
    );
  });

  it('loads install provenance by installed path', async () => {
    const installedPath = path.join(testDir, 'nested', '..', 'installed-skill');
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: 'https://github.com/owner/repo',
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
          clonePath: path.join(testDir, 'clone'),
          currentCommit: 'abcdef1234567890',
          lastFetchedAt: '2026-06-01T00:00:00.000Z',
          lastScanAt: '2026-06-01T00:00:00.000Z',
          items: [],
          installs: [
            {
              id: 'install-1',
              kind: 'skill',
              sourceItemId: 'skill:skills/reviewer',
              sourceRelativePath: 'skills/reviewer',
              sourceCommit: 'abcdef1234567890',
              sourceContentHash: 'source-hash',
              installedPath,
              installedName: 'Installed Skill',
              installedContentHash: 'installed-hash',
              installedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    await expect(
      getSourceProvenanceByInstalledPath({
        installedPath: path.join(testDir, 'installed-skill'),
      }),
    ).resolves.toEqual({
      sourceId: 'source-1',
      owner: 'owner',
      repo: 'repo',
      commit: 'abcdef1234567890',
    });

    const provenanceByPath = await getSourceProvenanceByInstalledPathMap();
    expect(provenanceByPath.get(path.join(testDir, 'installed-skill'))).toEqual(
      {
        sourceId: 'source-1',
        owner: 'owner',
        repo: 'repo',
        commit: 'abcdef1234567890',
      },
    );
  });

  it('does not throw when provenance manifest is invalid', async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, '{bad json', 'utf-8');

    await expect(
      getSourceProvenanceByInstalledPath({ installedPath: '/missing' }),
    ).resolves.toBeUndefined();
  });
});

describe('source directory scanning', () => {
  it('detects skill directories with companion files', async () => {
    const root = path.join(testDir, 'repo');
    const skillDir = path.join(root, 'skills', 'reviewer');
    await fs.mkdir(path.join(skillDir, 'resources'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: reviewer\ndescription: Review code\n---\n\nUse review.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(skillDir, 'resources', 'a.md'),
      'A\n',
      'utf-8',
    );

    const items = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    const skill = items.find((item) => item.id === 'skill:skills/reviewer');
    expect(skill).toEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        kind: 'skill',
        sourceRelativePath: 'skills/reviewer',
        sourceCommit: 'abc123',
        detectedName: 'reviewer',
        detectedDescription: 'Review code',
      }),
    );
    expect(skill?.sourceContentHash).toMatch(/^[a-f0-9]{64}$/);

    await fs.writeFile(
      path.join(skillDir, 'resources', 'a.md'),
      'Changed\n',
      'utf-8',
    );
    const changedItems = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(
      changedItems.find((item) => item.id === 'skill:skills/reviewer')
        ?.sourceContentHash,
    ).not.toBe(skill?.sourceContentHash);
  });

  it('includes skill companion relative file names in directory hashes', async () => {
    const root = path.join(testDir, 'repo');
    const skillDir = path.join(root, 'skills', 'reviewer');
    await fs.mkdir(path.join(skillDir, 'resources'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: reviewer\n---\n\nUse review.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(skillDir, 'resources', 'a.md'),
      'Same\n',
      'utf-8',
    );

    const before = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });
    await fs.rename(
      path.join(skillDir, 'resources', 'a.md'),
      path.join(skillDir, 'resources', 'b.md'),
    );
    const after = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(after[0].sourceContentHash).not.toBe(before[0].sourceContentHash);
  });

  it('includes skipped discovery directories inside skill directory hashes', async () => {
    const root = path.join(testDir, 'repo');
    const skillDir = path.join(root, 'skills', 'reviewer');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: reviewer\n---\n\nUse review.\n',
      'utf-8',
    );

    const before = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    for (const copiedDir of [
      'node_modules',
      '.venv',
      'dist',
      'build',
      '.cache',
    ]) {
      await fs.mkdir(path.join(skillDir, copiedDir), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, copiedDir, 'copied.md'),
        copiedDir,
        'utf-8',
      );
    }

    const after = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(after[0].sourceContentHash).not.toBe(before[0].sourceContentHash);
  });

  it('excludes .git directories from skill directory hashes', async () => {
    const root = path.join(testDir, 'repo');
    const skillDir = path.join(root, 'skills', 'reviewer');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: reviewer\n---\n\nUse review.\n',
      'utf-8',
    );

    const before = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    await fs.mkdir(path.join(skillDir, '.git', 'objects'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, '.git', 'objects', 'metadata'),
      'ignored metadata\n',
      'utf-8',
    );

    const after = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(after[0].sourceContentHash).toBe(before[0].sourceContentHash);
  });

  it('rejects source scans that exceed max depth', async () => {
    const root = path.join(testDir, 'repo');
    let currentPath = root;
    for (let i = 0; i < 26; i += 1) {
      currentPath = path.join(currentPath, `level-${i}`);
      await fs.mkdir(currentPath, { recursive: true });
    }

    await expect(
      scanSourceDirectory({ rootPath: root, commit: 'abc123' }),
    ).rejects.toThrow('Source scan exceeded max depth');
  });

  it('does not recurse further inside detected skill directories', async () => {
    const root = path.join(testDir, 'repo');
    const nestedSkillDir = path.join(root, 'skills', 'outer', 'inner');
    await fs.mkdir(nestedSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(root, 'skills', 'outer', 'SKILL.md'),
      '---\nname: outer\n---\n\nOuter.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(nestedSkillDir, 'SKILL.md'),
      '---\nname: inner\n---\n\nInner.\n',
      'utf-8',
    );

    const items = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(items.map((item) => item.id)).toEqual(['skill:skills/outer']);
  });

  it('detects agents only in known agent directories', async () => {
    const root = path.join(testDir, 'repo');
    await fs.mkdir(path.join(root, 'agents'), { recursive: true });
    await fs.mkdir(path.join(root, '.claude', 'agents'), { recursive: true });
    await fs.mkdir(path.join(root, '.opencode', 'agents'), { recursive: true });
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'agents', 'reviewer.md'),
      '---\nname: reviewer-agent\ndescription: Review agent\n---\n\nReview.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(root, '.claude', 'agents', 'planner.md'),
      '---\nname: planner\ndescription: Plan agent\n---\n\nPlan.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(root, '.opencode', 'agents', 'builder.md'),
      '---\nname: builder\n---\n\nBuild.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(root, 'docs', 'not-agent.md'),
      '# docs\n',
      'utf-8',
    );

    const items = await scanSourceDirectory({
      rootPath: root,
      commit: 'abc123',
    });

    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'agent:agents/reviewer.md',
        kind: 'agent',
        sourceRelativePath: 'agents/reviewer.md',
        detectedName: 'reviewer-agent',
        detectedDescription: 'Review agent',
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'agent:.claude/agents/planner.md',
        kind: 'agent',
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'agent:.opencode/agents/builder.md',
        kind: 'agent',
      }),
    );
    expect(
      items.some((item) => item.sourceRelativePath === 'docs/not-agent.md'),
    ).toBe(false);
  });
});

describe('source GitHub management', () => {
  it('builds deterministic GitHub clone paths', () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo.git');
    const first = buildGithubClonePath(parsed);
    const second = buildGithubClonePath(parsed);

    expect(first).toBe(second);
    expect(first).toMatch(
      new RegExp(
        `${escapeRegExp(path.join(testDir, 'sources', 'github', 'owner'))}${escapeRegExp(path.sep)}repo-[a-f0-9]{12}$`,
      ),
    );
  });

  it('rejects duplicate GitHub source URLs before cloning', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath: buildGithubClonePath(parsed),
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: [],
          installs: [],
        },
      ],
    });
    setGitRunnerForTests(async () => {
      throw new Error('git should not run');
    });

    await expect(
      addGitHubSource({ url: 'https://github.com/owner/repo.git' }),
    ).rejects.toThrow('Source already exists');
  });

  it('serializes concurrent duplicate GitHub source adds', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    let cloneCalls = 0;
    setGitRunnerForTests(async (args, cwd) => {
      if (args[0] === 'clone') {
        cloneCalls += 1;
        await writeSkillFixture(clonePath, 'reviewer', 'Review code');
        return '';
      }
      if (
        cwd === clonePath &&
        args.join(' ') === 'rev-parse --abbrev-ref HEAD'
      ) {
        return 'main';
      }
      if (cwd === clonePath && args.join(' ') === 'rev-parse HEAD') {
        return 'abc123';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });

    const results = await Promise.allSettled([
      addGitHubSource({ url: parsed.url }),
      addGitHubSource({ url: `${parsed.url}.git` }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(cloneCalls).toBe(1);
    const manifest = await readSourceManifest();
    expect(manifest.sources).toHaveLength(1);
  });

  it('rejects clone paths with symlinked parents before cloning', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const ownerParent = path.join(testDir, 'sources', 'github', parsed.owner);
    const outsideParent = path.join(testDir, 'outside-owner');
    await fs.mkdir(path.dirname(ownerParent), { recursive: true });
    await fs.mkdir(outsideParent, { recursive: true });
    await fs.symlink(outsideParent, ownerParent);

    const gitRunner = vi.fn(async () => 'ok');
    setGitRunnerForTests(gitRunner);

    await expect(addGitHubSource({ url: parsed.url })).rejects.toThrow(
      'Source clone parent path resolves outside managed sources directory',
    );
    expect(gitRunner).not.toHaveBeenCalled();
  });

  it('adds a GitHub source from a mocked clone', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    setGitRunnerForTests(async (args, cwd) => {
      if (args[0] === 'clone') {
        expect(args).toEqual(['clone', '--depth', '1', parsed.url, clonePath]);
        await writeSkillFixture(clonePath, 'reviewer', 'Review code');
        return '';
      }
      if (
        cwd === clonePath &&
        args.join(' ') === 'rev-parse --abbrev-ref HEAD'
      ) {
        return 'main';
      }
      if (cwd === clonePath && args.join(' ') === 'rev-parse HEAD') {
        return 'abc123';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });

    const source = await addGitHubSource({ url: parsed.url });

    expect(source).toEqual(
      expect.objectContaining({
        type: 'github',
        url: parsed.url,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: 'main',
        currentCommit: 'abc123',
        clonePath,
      }),
    );
    expect(source.items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        status: 'available',
        sourceCommit: 'abc123',
      }),
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]).toEqual(
      expect.objectContaining({
        id: source.id,
        items: [expect.objectContaining({ id: 'skill:skills/reviewer' })],
      }),
    );
  });

  it('removes a source manifest entry and managed clone', async () => {
    const { clonePath, sourceId } = await writeInstallSourceFixture();

    await removeSource(sourceId);

    await expect(readSourceManifest()).resolves.toEqual({
      version: 1,
      sources: [],
    });
    await expect(fs.stat(clonePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects source removal when clone path is not managed', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath: path.join(testDir, 'outside-managed-sources'),
          currentCommit: 'abc123',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: [],
          installs: [],
        },
      ],
    });

    await expect(removeSource('source-1')).rejects.toThrow(
      'Source clone path is outside managed sources directory',
    );
    expect((await readSourceManifest()).sources).toHaveLength(1);
  });

  it('keeps manifest entry when source clone move fails', async () => {
    const { clonePath, sourceId } = await writeInstallSourceFixture();
    const renameOriginal = fs.rename;
    const rename = vi.spyOn(fs, 'rename');
    rename.mockImplementation(async (oldPath, newPath) => {
      if (oldPath === clonePath) {
        throw new Error('move failed');
      }
      return renameOriginal(oldPath, newPath);
    });

    try {
      await expect(removeSource(sourceId)).rejects.toThrow('move failed');
      expect((await readSourceManifest()).sources).toHaveLength(1);
      await expect(fs.stat(clonePath)).resolves.toBeDefined();
    } finally {
      rename.mockRestore();
    }
  });

  it('restores source clone when manifest write fails during removal', async () => {
    const { clonePath, sourceId } = await writeInstallSourceFixture();
    const renameOriginal = fs.rename;
    const rename = vi.spyOn(fs, 'rename');
    rename.mockImplementation(async (oldPath, newPath) => {
      if (newPath === manifestPath) {
        throw new Error('manifest write failed');
      }
      return renameOriginal(oldPath, newPath);
    });

    try {
      await expect(removeSource(sourceId)).rejects.toThrow(
        'manifest write failed',
      );
      expect((await readSourceManifest()).sources).toHaveLength(1);
      await expect(fs.stat(clonePath)).resolves.toBeDefined();
    } finally {
      rename.mockRestore();
    }
  });

  it('refreshes existing source items with fast-forward pull', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    await writeSkillFixture(clonePath, 'old-reviewer', 'Old review');
    const beforeItems = await scanSourceDirectory({
      rootPath: clonePath,
      commit: 'old-commit',
    });
    const sourceId = 'source-1';
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: sourceId,
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath,
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: beforeItems,
          installs: [],
        },
      ],
    });
    setGitRunnerForTests(async (args, cwd) => {
      if (cwd === clonePath && args.join(' ') === 'pull --ff-only') {
        await fs.rm(path.join(clonePath, 'skills'), {
          force: true,
          recursive: true,
        });
        await writeSkillFixture(clonePath, 'new-reviewer', 'New review');
        return 'updated';
      }
      if (
        cwd === clonePath &&
        args.join(' ') === 'rev-parse --abbrev-ref HEAD'
      ) {
        return 'main';
      }
      if (cwd === clonePath && args.join(' ') === 'rev-parse HEAD') {
        return 'new-commit';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });

    const source = await refreshSource({ sourceId });

    expect(source).toEqual(
      expect.objectContaining({
        id: sourceId,
        currentCommit: 'new-commit',
      }),
    );
    expect(source.items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/new-reviewer',
        sourceCommit: 'new-commit',
      }),
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]).toEqual(
      expect.objectContaining({ currentCommit: 'new-commit' }),
    );
  });

  it('shows installed items as source-missing after refresh removes them', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    setGitRunnerForTests(async (args, cwd) => {
      if (cwd === clonePath && args.join(' ') === 'pull --ff-only') {
        await fs.rm(path.join(clonePath, 'skills', 'reviewer'), {
          force: true,
          recursive: true,
        });
        return 'updated';
      }
      if (
        cwd === clonePath &&
        args.join(' ') === 'rev-parse --abbrev-ref HEAD'
      ) {
        return 'main';
      }
      if (cwd === clonePath && args.join(' ') === 'rev-parse HEAD') {
        return 'new-commit';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });

    const source = await refreshSource({ sourceId });

    expect(source.items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        status: 'source-missing',
      }),
    );
  });

  it('persists refresh errors without replacing existing source data', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    await writeSkillFixture(clonePath, 'reviewer', 'Review code');
    const items = await scanSourceDirectory({
      rootPath: clonePath,
      commit: 'old-commit',
    });
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath,
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items,
          installs: [],
        },
      ],
    });
    setGitRunnerForTests(async () => {
      throw new Error('pull failed');
    });

    const source = await refreshSource({ sourceId: 'source-1' });

    expect(source).toEqual(
      expect.objectContaining({
        id: 'source-1',
        currentCommit: 'old-commit',
        error: 'pull failed',
      }),
    );
    expect(source.items).toEqual(
      items.map((item) => ({
        ...item,
        install: undefined,
        status: 'available',
      })),
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]).toEqual(
      expect.objectContaining({
        id: 'source-1',
        currentCommit: 'old-commit',
        error: 'pull failed',
      }),
    );
  });

  it('persists refresh error and skips git for invalid clone paths', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath: path.join(testDir, '..', 'outside-repo'),
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: [],
          installs: [],
        },
      ],
    });
    setGitRunnerForTests(async () => {
      throw new Error('git should not run');
    });

    const source = await refreshSource({ sourceId: 'source-1' });

    expect(source).toEqual(
      expect.objectContaining({
        id: 'source-1',
        currentCommit: 'old-commit',
        error: 'Source clone path is outside managed sources directory',
      }),
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]?.error).toBe(
      'Source clone path is outside managed sources directory',
    );
  });

  it('persists refresh error and skips git when clone path is missing', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath,
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: [],
          installs: [],
        },
      ],
    });
    const gitRunner = vi.fn(async () => {
      throw new Error('git should not run');
    });
    setGitRunnerForTests(gitRunner);

    const source = await refreshSource({ sourceId: 'source-1' });

    expect(gitRunner).not.toHaveBeenCalled();
    expect(source.error).toBe(`Source clone path does not exist: ${clonePath}`);
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]?.error).toBe(
      `Source clone path does not exist: ${clonePath}`,
    );
  });

  it('persists refresh error and skips git for clone symlink escaping sources', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/repo');
    const clonePath = buildGithubClonePath(parsed);
    const outsidePath = path.join(testDir, 'outside-clone');
    await fs.mkdir(path.dirname(clonePath), { recursive: true });
    await fs.mkdir(outsidePath, { recursive: true });
    await fs.symlink(outsidePath, clonePath);
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: 'source-1',
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath,
          currentCommit: 'old-commit',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items: [],
          installs: [],
        },
      ],
    });
    const gitRunner = vi.fn(async () => {
      throw new Error('git should not run');
    });
    setGitRunnerForTests(gitRunner);

    const source = await refreshSource({ sourceId: 'source-1' });

    expect(gitRunner).not.toHaveBeenCalled();
    expect(source.error).toBe(
      'Source clone path resolves outside managed sources directory',
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0]?.error).toBe(
      'Source clone path resolves outside managed sources directory',
    );
  });
});

describe('source item installs', () => {
  it('copies skill companions, agent content, selected backend symlinks, and manifest records', async () => {
    const { sourceId } = await writeInstallSourceFixture();

    const sources = await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: ['opencode'],
        },
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: ['claude-code'],
        },
      ],
    });

    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    const agentTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    );
    await expect(
      fs.readFile(path.join(skillTarget, 'SKILL.md'), 'utf-8'),
    ).resolves.toBe(
      '---\nname: reviewer\ndescription: Review code\n---\n\nUse reviewer.\n',
    );
    await expect(
      fs.readFile(path.join(skillTarget, 'resources', 'prompt.md'), 'utf-8'),
    ).resolves.toBe('Companion prompt\n');
    await expect(fs.readFile(agentTarget, 'utf-8')).resolves.toBe(
      '---\nname: reviewer-agent\ndescription: Review agent\n---\n\nReview agent exactly.\n',
    );
    await expect(
      fs.realpath(
        path.join(os.homedir(), '.config/opencode/skills/installed-skill'),
      ),
    ).resolves.toBe(skillTarget);
    await expect(
      fs.realpath(path.join(os.homedir(), '.claude/agents/installed-agent.md')),
    ).resolves.toBe(agentTarget);

    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toHaveLength(2);
    expect(manifest.sources[0].installs[0]).toEqual(
      expect.objectContaining({
        kind: 'skill',
        sourceItemId: 'skill:skills/reviewer',
        sourceRelativePath: 'skills/reviewer',
        installedPath: skillTarget,
        installedName: 'Installed Skill',
      }),
    );
    expect(
      (manifest.sources[0].installs[0] as { enabledBackends?: unknown })
        .enabledBackends,
    ).toBeUndefined();
    expect(sources[0].items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        status: 'up-to-date',
        install: expect.objectContaining({ installedPath: skillTarget }),
      }),
    );
  });

  it('installs root skill without .git and ignores .git changes for status', async () => {
    const parsed = parseGitHubRepoUrl('https://github.com/owner/root-skill');
    const clonePath = buildGithubClonePath(parsed);
    await fs.mkdir(path.join(clonePath, '.git'), { recursive: true });
    await fs.mkdir(path.join(clonePath, 'resources'), { recursive: true });
    await fs.writeFile(
      path.join(clonePath, 'SKILL.md'),
      '---\nname: root-skill\ndescription: Root skill\n---\n\nUse root skill.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(clonePath, 'resources', 'prompt.md'),
      'Root prompt\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(clonePath, '.git', 'HEAD'),
      'ref: refs/heads/main\n',
      'utf-8',
    );
    const items = await scanSourceDirectory({
      rootPath: clonePath,
      commit: 'abc123',
    });
    const sourceId = 'root-skill-source';
    await writeSourceManifest({
      version: 1,
      sources: [
        {
          id: sourceId,
          type: 'github',
          url: parsed.url,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: 'main',
          clonePath,
          currentCommit: 'abc123',
          lastFetchedAt: '2026-01-01T00:00:00.000Z',
          lastScanAt: '2026-01-01T00:00:00.000Z',
          items,
          installs: [],
        },
      ],
    });

    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:',
          targetName: 'Installed Root Skill',
          enabledBackends: [],
        },
      ],
    });

    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-root-skill',
    );
    await expect(
      fs.readFile(path.join(skillTarget, 'SKILL.md'), 'utf-8'),
    ).resolves.toBe(
      '---\nname: root-skill\ndescription: Root skill\n---\n\nUse root skill.\n',
    );
    await expect(
      fs.lstat(path.join(skillTarget, '.git')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const manifest = await readSourceManifest();
    const installedHash = manifest.sources[0].installs[0].installedContentHash;
    await fs.writeFile(
      path.join(clonePath, '.git', 'HEAD'),
      'ref: refs/heads/changed\n',
      'utf-8',
    );

    await expect(sourceItemStatus('skill:')).resolves.toBe('up-to-date');
    const rescannedItems = await scanSourceDirectory({
      rootPath: clonePath,
      commit: 'def456',
    });
    expect(rescannedItems[0].sourceContentHash).toBe(
      manifest.sources[0].items[0].sourceContentHash,
    );
    expect((await readSourceManifest()).sources[0].installs[0]).toEqual(
      expect.objectContaining({ installedContentHash: installedHash }),
    );
  });

  it('derives install statuses from source and installed hashes', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });

    await expect(sourceItemStatus('skill:skills/reviewer')).resolves.toBe(
      'up-to-date',
    );
    await fs.writeFile(
      path.join(clonePath, 'skills', 'reviewer', 'resources', 'prompt.md'),
      'Updated source prompt\n',
      'utf-8',
    );
    await expect(sourceItemStatus('skill:skills/reviewer')).resolves.toBe(
      'update-available',
    );
    await fs.writeFile(
      path.join(
        os.homedir(),
        '.config/jean-claude/agents/user/installed-agent.md',
      ),
      'local agent edit\n',
      'utf-8',
    );
    await expect(sourceItemStatus('agent:agents/reviewer.md')).resolves.toBe(
      'local-changes',
    );
    await fs.rm(path.join(clonePath, 'skills', 'reviewer'), {
      force: true,
      recursive: true,
    });
    await expect(sourceItemStatus('skill:skills/reviewer')).resolves.toBe(
      'source-missing',
    );
    await fs.rm(
      path.join(
        os.homedir(),
        '.config/jean-claude/agents/user/installed-agent.md',
      ),
      { force: true },
    );
    await expect(sourceItemStatus('agent:agents/reviewer.md')).resolves.toBe(
      'installed-missing',
    );
  });

  it('returns conflict for invalid manifest paths without reading escaped paths', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });
    const escapedInstalledPath = path.join(testDir, 'escaped-agent.md');
    await fs.writeFile(escapedInstalledPath, 'escaped content\n', 'utf-8');
    const manifest = await readSourceManifest();
    const install = manifest.sources[0].installs[0];
    await writeSourceManifest({
      ...manifest,
      sources: [
        {
          ...manifest.sources[0],
          installs: [
            {
              ...install,
              installedPath: escapedInstalledPath,
            },
          ],
        },
      ],
    });

    await expect(sourceItemStatus('agent:agents/reviewer.md')).resolves.toBe(
      'conflict',
    );
    await expect(fs.readFile(escapedInstalledPath, 'utf-8')).resolves.toBe(
      'escaped content\n',
    );

    const installedPathManifest = await readSourceManifest();
    const sourceItem = installedPathManifest.sources[0].items.find(
      (item) => item.id === 'agent:agents/reviewer.md',
    );
    if (!sourceItem) throw new Error('expected reviewer source item');
    await writeSourceManifest({
      ...installedPathManifest,
      sources: [
        {
          ...installedPathManifest.sources[0],
          items: [
            {
              ...sourceItem,
              sourceRelativePath: '../../escaped-source.md',
            },
          ],
        },
      ],
    });

    await expect(sourceItemStatus('agent:agents/reviewer.md')).resolves.toBe(
      'conflict',
    );
  });

  it('returns conflict instead of rejecting when installed skill has nested symlink', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    const symlinkTarget = path.join(testDir, 'nested-symlink-target.md');
    await fs.writeFile(symlinkTarget, 'nested target\n', 'utf-8');
    await fs.symlink(
      symlinkTarget,
      path.join(skillTarget, 'resources', 'linked.md'),
    );

    const sources = await listSources();

    expect(sources[0].items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        status: 'conflict',
      }),
    );
  });

  it('updates skill installs by replacing the entire directory', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    await fs.writeFile(
      path.join(skillTarget, 'old-local.md'),
      'old\n',
      'utf-8',
    );
    await fs.rm(path.join(clonePath, 'skills', 'reviewer'), {
      force: true,
      recursive: true,
    });
    await fs.mkdir(path.join(clonePath, 'skills', 'reviewer', 'new'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(clonePath, 'skills', 'reviewer', 'SKILL.md'),
      '---\nname: reviewer\ndescription: Updated review\n---\n\nUse updated reviewer.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(clonePath, 'skills', 'reviewer', 'new', 'prompt.md'),
      'New prompt\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];

    const sources = await updateSourceInstall({
      sourceId,
      installId: install.id,
      overwriteLocalChanges: true,
    });

    await expect(
      fs.lstat(path.join(skillTarget, 'old-local.md')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      fs.readFile(path.join(skillTarget, 'new', 'prompt.md'), 'utf-8'),
    ).resolves.toBe('New prompt\n');
    expect(sources[0].items).toContainEqual(
      expect.objectContaining({
        id: 'skill:skills/reviewer',
        status: 'up-to-date',
      }),
    );
    const updatedInstall = (await readSourceManifest()).sources[0].installs[0];
    expect(updatedInstall).toEqual(
      expect.objectContaining({
        id: install.id,
        sourceCommit: 'def456',
        updatedAt: expect.any(String),
      }),
    );
    expect(updatedInstall.sourceContentHash).not.toBe(
      install.sourceContentHash,
    );
    expect(updatedInstall.installedContentHash).not.toBe(
      install.installedContentHash,
    );
  });

  it('rejects local drift unless overwrite is requested', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });
    const agentTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    );
    await fs.writeFile(agentTarget, 'local drift\n', 'utf-8');
    await fs.writeFile(
      path.join(clonePath, 'agents', 'reviewer.md'),
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];

    await expect(
      updateSourceInstall({ sourceId, installId: install.id }),
    ).rejects.toThrow('local changes');
    await expect(fs.readFile(agentTarget, 'utf-8')).resolves.toBe(
      'local drift\n',
    );

    await updateSourceInstall({
      sourceId,
      installId: install.id,
      overwriteLocalChanges: true,
    });

    await expect(fs.readFile(agentTarget, 'utf-8')).resolves.toBe(
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
    );
  });

  it('updates agent installs by replacing the markdown file', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });
    await fs.writeFile(
      path.join(clonePath, 'agents', 'reviewer.md'),
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];

    const sources = await updateSourceInstall({
      sourceId,
      installId: install.id,
    });

    await expect(
      fs.readFile(
        path.join(
          os.homedir(),
          '.config/jean-claude/agents/user/installed-agent.md',
        ),
        'utf-8',
      ),
    ).resolves.toBe(
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
    );
    expect(sources[0].items).toContainEqual(
      expect.objectContaining({
        id: 'agent:agents/reviewer.md',
        status: 'up-to-date',
      }),
    );
  });

  it('rejects installed symlinks before updating', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });
    const agentTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    );
    const symlinkTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent-copy.md',
    );
    await fs.writeFile(symlinkTarget, 'symlink target\n', 'utf-8');
    await fs.rm(agentTarget, { force: true });
    await fs.symlink(symlinkTarget, agentTarget);
    await fs.writeFile(
      path.join(clonePath, 'agents', 'reviewer.md'),
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];

    await expect(
      updateSourceInstall({
        sourceId,
        installId: install.id,
        overwriteLocalChanges: true,
      }),
    ).rejects.toThrow('Installed agent path is a symlink');

    const agentStat = await fs.lstat(agentTarget);
    expect(agentStat.isSymbolicLink()).toBe(true);
    await expect(fs.readFile(symlinkTarget, 'utf-8')).resolves.toBe(
      'symlink target\n',
    );
  });

  it('preserves the old skill directory when update replacement fails', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    await fs.writeFile(
      path.join(clonePath, 'skills', 'reviewer', 'SKILL.md'),
      '---\nname: reviewer\ndescription: Updated review\n---\n\nUse updated reviewer.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];
    const realRename = fs.rename;
    const renameSpy = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (from, to) => {
        if (
          String(from).includes('.installed-skill.update-') &&
          String(to) === skillTarget
        ) {
          throw new Error('simulated rename failure');
        }
        return realRename(from, to);
      });

    try {
      await expect(
        updateSourceInstall({
          sourceId,
          installId: install.id,
          overwriteLocalChanges: true,
        }),
      ).rejects.toThrow('simulated rename failure');
    } finally {
      renameSpy.mockRestore();
    }

    await expect(
      fs.readFile(path.join(skillTarget, 'SKILL.md'), 'utf-8'),
    ).resolves.toBe(
      '---\nname: reviewer\ndescription: Review code\n---\n\nUse reviewer.\n',
    );
  });

  it('rolls back skill update replacement when manifest write fails', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    await fs.writeFile(
      path.join(clonePath, 'skills', 'reviewer', 'SKILL.md'),
      '---\nname: reviewer\ndescription: Updated review\n---\n\nUse updated reviewer.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];
    const realRename = fs.rename;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation((from, to) => {
      if (String(to) === manifestPath && String(from).endsWith('.tmp')) {
        return Promise.reject(new Error('manifest write failed'));
      }
      return realRename(from, to);
    });

    try {
      await expect(
        updateSourceInstall({
          sourceId,
          installId: install.id,
          overwriteLocalChanges: true,
        }),
      ).rejects.toThrow('manifest write failed');
    } finally {
      renameSpy.mockRestore();
    }

    await expect(
      fs.readFile(path.join(skillTarget, 'SKILL.md'), 'utf-8'),
    ).resolves.toBe(
      '---\nname: reviewer\ndescription: Review code\n---\n\nUse reviewer.\n',
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs[0]).toEqual(install);
  });

  it('rolls back agent update replacement when manifest write fails', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });
    const agentTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    );
    await fs.writeFile(
      path.join(clonePath, 'agents', 'reviewer.md'),
      '---\nname: reviewer-agent\ndescription: Updated agent\n---\n\nUpdated agent.\n',
      'utf-8',
    );
    await rescanSource(sourceId, clonePath, 'def456');
    const install = (await readSourceManifest()).sources[0].installs[0];
    const realRename = fs.rename;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation((from, to) => {
      if (String(to) === manifestPath && String(from).endsWith('.tmp')) {
        return Promise.reject(new Error('manifest write failed'));
      }
      return realRename(from, to);
    });

    try {
      await expect(
        updateSourceInstall({ sourceId, installId: install.id }),
      ).rejects.toThrow('manifest write failed');
    } finally {
      renameSpy.mockRestore();
    }

    await expect(fs.readFile(agentTarget, 'utf-8')).resolves.toBe(
      '---\nname: reviewer-agent\ndescription: Review agent\n---\n\nReview agent exactly.\n',
    );
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs[0]).toEqual(install);
  });

  it('rejects update install paths outside managed directories without modifying them', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'skill:skills/reviewer',
          targetName: 'Installed Skill',
          enabledBackends: [],
        },
      ],
    });
    const outsideDir = path.join(testDir, 'outside-installed-skill');
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'marker.txt'), 'do not touch\n');

    const manifest = await readSourceManifest();
    const install = manifest.sources[0].installs[0];
    await writeSourceManifest({
      ...manifest,
      sources: [
        {
          ...manifest.sources[0],
          installs: [
            {
              ...install,
              installedPath: outsideDir,
            },
          ],
        },
      ],
    });

    await expect(
      updateSourceInstall({
        sourceId,
        installId: install.id,
        overwriteLocalChanges: true,
      }),
    ).rejects.toThrow('outside managed skill directory');

    await expect(
      fs.readFile(path.join(outsideDir, 'marker.txt'), 'utf-8'),
    ).resolves.toBe('do not touch\n');
    await expect(
      fs.lstat(path.join(outsideDir, 'SKILL.md')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects target conflicts without overwriting or partially installing batch items', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    const agentTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    );
    await fs.mkdir(skillTarget, { recursive: true });
    await fs.writeFile(
      path.join(skillTarget, 'SKILL.md'),
      'existing skill\n',
      'utf-8',
    );

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'skill:skills/reviewer',
            targetName: 'Installed Skill',
            enabledBackends: ['opencode'],
          },
          {
            sourceId,
            sourceItemId: 'agent:agents/reviewer.md',
            targetName: 'Installed Agent',
            enabledBackends: ['claude-code'],
          },
        ],
      }),
    ).rejects.toThrow('Install target already exists');

    await expect(
      fs.readFile(path.join(skillTarget, 'SKILL.md'), 'utf-8'),
    ).resolves.toBe('existing skill\n');
    await expect(fs.lstat(agentTarget)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toEqual([]);
  });

  it('rolls back copied targets without removing foreign backend skill paths', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    const skillTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/installed-skill',
    );
    const foreignTarget = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/foreign-skill',
    );
    const backendSkillPath = path.join(
      os.homedir(),
      '.config/opencode/skills/installed-skill',
    );
    await fs.mkdir(foreignTarget, { recursive: true });
    await fs.writeFile(path.join(foreignTarget, 'SKILL.md'), 'foreign\n');
    await fs.mkdir(path.dirname(backendSkillPath), { recursive: true });
    await fs.symlink(foreignTarget, backendSkillPath);

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'skill:skills/reviewer',
            targetName: 'Installed Skill',
            enabledBackends: ['opencode'],
          },
        ],
      }),
    ).rejects.toThrow('Skill already exists for opencode');

    await expect(fs.lstat(skillTarget)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.realpath(backendSkillPath)).resolves.toBe(foreignTarget);
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toEqual([]);
  });

  it('rejects already-installed source items when installed path still exists', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'agent:agents/reviewer.md',
            targetName: 'Installed Agent Copy',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Source item already installed');
  });

  it('rejects skill installs whose target name normalizes without letters or numbers', async () => {
    const { sourceId } = await writeInstallSourceFixture();

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'skill:skills/reviewer',
            targetName: '!!!',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Invalid skill target name');

    await expect(
      fs.lstat(
        path.join(os.homedir(), '.config/jean-claude/skills/user/SKILL.md'),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toEqual([]);
  });

  it('rejects agent installs whose target name normalizes without letters or numbers', async () => {
    const { sourceId } = await writeInstallSourceFixture();

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'agent:agents/reviewer.md',
            targetName: '!!!',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Invalid agent target name');

    await expect(
      fs.lstat(path.join(os.homedir(), '.config/jean-claude/agents/user/.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toEqual([]);
  });

  it('replaces stale install records when installed path is missing', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    const sourceManifest = await readSourceManifest();
    await writeSourceManifest({
      ...sourceManifest,
      sources: [
        {
          ...sourceManifest.sources[0],
          installs: [
            {
              id: 'stale-install',
              kind: 'agent',
              sourceItemId: 'agent:agents/reviewer.md',
              sourceRelativePath: 'agents/reviewer.md',
              sourceCommit: 'abc123',
              sourceContentHash: 'old-hash',
              installedPath: path.join(
                os.homedir(),
                '.config/jean-claude/agents/user/missing-agent.md',
              ),
              installedName: 'Missing Agent',
              installedContentHash: 'old-installed-hash',
              installedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    await installSourceItems({
      items: [
        {
          sourceId,
          sourceItemId: 'agent:agents/reviewer.md',
          targetName: 'Installed Agent',
          enabledBackends: [],
        },
      ],
    });

    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toHaveLength(1);
    expect(manifest.sources[0].installs[0]).toEqual(
      expect.objectContaining({
        sourceItemId: 'agent:agents/reviewer.md',
        installedName: 'Installed Agent',
      }),
    );
  });

  it('rejects reinstall when any duplicate old install record still exists', async () => {
    const { sourceId } = await writeInstallSourceFixture();
    const sourceManifest = await readSourceManifest();
    const existingTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/existing-agent.md',
    );
    await fs.mkdir(path.dirname(existingTarget), { recursive: true });
    await fs.writeFile(existingTarget, 'existing agent\n', 'utf-8');
    await writeSourceManifest({
      ...sourceManifest,
      sources: [
        {
          ...sourceManifest.sources[0],
          installs: [
            buildInstallRecord({
              id: 'stale-install',
              installedPath: path.join(
                os.homedir(),
                '.config/jean-claude/agents/user/missing-agent.md',
              ),
            }),
            buildInstallRecord({
              id: 'existing-install',
              installedPath: existingTarget,
            }),
          ],
        },
      ],
    });

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'agent:agents/reviewer.md',
            targetName: 'Installed Agent',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Source item already installed');

    const manifest = await readSourceManifest();
    expect(manifest.sources[0].installs).toHaveLength(2);
    await expect(fs.readFile(existingTarget, 'utf-8')).resolves.toBe(
      'existing agent\n',
    );
  });

  it('rejects source skill directories containing symlinks', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    await fs.symlink(
      path.join(clonePath, 'agents', 'reviewer.md'),
      path.join(clonePath, 'skills', 'reviewer', 'linked-agent.md'),
    );

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'skill:skills/reviewer',
            targetName: 'Installed Skill',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Source item contains symlink');
  });

  it('rejects source agent files that are symlinks', async () => {
    const { sourceId, clonePath } = await writeInstallSourceFixture();
    const agentPath = path.join(clonePath, 'agents', 'reviewer.md');
    const realAgentPath = path.join(clonePath, 'agents', 'real-reviewer.md');
    await fs.rename(agentPath, realAgentPath);
    await fs.symlink(realAgentPath, agentPath);

    await expect(
      installSourceItems({
        items: [
          {
            sourceId,
            sourceItemId: 'agent:agents/reviewer.md',
            targetName: 'Installed Agent',
            enabledBackends: [],
          },
        ],
      }),
    ).rejects.toThrow('Source item contains symlink');
  });
});

async function writeSkillFixture(
  rootPath: string,
  name: string,
  description: string,
): Promise<void> {
  const skillDir = path.join(rootPath, 'skills', name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nUse ${name}.\n`,
    'utf-8',
  );
}

async function writeInstallSourceFixture(): Promise<{
  clonePath: string;
  sourceId: string;
}> {
  const parsed = parseGitHubRepoUrl('https://github.com/owner/install-repo');
  const clonePath = buildGithubClonePath(parsed);
  const skillDir = path.join(clonePath, 'skills', 'reviewer');
  await fs.mkdir(path.join(skillDir, 'resources'), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: reviewer\ndescription: Review code\n---\n\nUse reviewer.\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(skillDir, 'resources', 'prompt.md'),
    'Companion prompt\n',
    'utf-8',
  );
  await fs.mkdir(path.join(clonePath, 'agents'), { recursive: true });
  await fs.writeFile(
    path.join(clonePath, 'agents', 'reviewer.md'),
    '---\nname: reviewer-agent\ndescription: Review agent\n---\n\nReview agent exactly.\n',
    'utf-8',
  );
  const sourceId = 'source-install';
  const items = await scanSourceDirectory({
    rootPath: clonePath,
    commit: 'abc123',
  });
  await writeSourceManifest({
    version: 1,
    sources: [
      {
        id: sourceId,
        type: 'github',
        url: parsed.url,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: 'main',
        clonePath,
        currentCommit: 'abc123',
        lastFetchedAt: '2026-01-01T00:00:00.000Z',
        lastScanAt: '2026-01-01T00:00:00.000Z',
        items,
        installs: [],
      },
    ],
  });
  return { clonePath, sourceId };
}

async function sourceItemStatus(sourceItemId: string) {
  const sources = await listSources();
  return sources[0].items.find((item) => item.id === sourceItemId)?.status;
}

async function rescanSource(
  sourceId: string,
  clonePath: string,
  commit: string,
): Promise<void> {
  const manifest = await readSourceManifest();
  const items = await scanSourceDirectory({ rootPath: clonePath, commit });
  await writeSourceManifest({
    ...manifest,
    sources: manifest.sources.map((source) =>
      source.id === sourceId
        ? {
            ...source,
            currentCommit: commit,
            items,
          }
        : source,
    ),
  });
}

async function cleanupInstallTestPaths(): Promise<void> {
  const exactPaths = [
    path.join(os.homedir(), '.config/jean-claude/skills/user/installed-skill'),
    path.join(os.homedir(), '.config/jean-claude/skills/user/foreign-skill'),
    path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/existing-agent.md',
    ),
    path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent.md',
    ),
    path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/installed-agent-copy.md',
    ),
    path.join(os.homedir(), '.config/opencode/skills/installed-skill'),
    path.join(os.homedir(), '.claude/agents/installed-agent.md'),
  ];

  await Promise.all(
    exactPaths.map((exactPath) =>
      fs.rm(exactPath, { force: true, recursive: true }),
    ),
  );
}

function buildInstallRecord({
  id,
  installedPath,
}: {
  id: string;
  installedPath: string;
}) {
  return {
    id,
    kind: 'agent' as const,
    sourceItemId: 'agent:agents/reviewer.md',
    sourceRelativePath: 'agents/reviewer.md',
    sourceCommit: 'abc123',
    sourceContentHash: 'old-hash',
    installedPath,
    installedName: 'Old Agent',
    installedContentHash: 'old-installed-hash',
    installedAt: '2026-01-01T00:00:00.000Z',
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
