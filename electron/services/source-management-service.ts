import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';


import type {
  AddGitHubSourceParams,
  DetectedSourceItem,
  InstallSourceItemsParams,
  ManagedSource,
  SourceInstallRecord,
  SourceItemView,
  SourceManifest,
  SourceView,
  UpdateSourceInstallParams,
} from '@shared/source-management-types';
import type { AgentBackendType } from '@shared/agent-backend-types';


import { parseFrontmatter } from '../lib/skill-frontmatter';

import {
  assertValidAgentTargetName,
  enableAgent,
  getAgentPathConfig,
  getUserAgentCanonicalPath,
  getUserAgentCanonicalRoot,
} from './agent-management-service';
import {
  assertValidSkillTargetName,
  enableSkill,
  getSkillPathConfig,
  getUserSkillCanonicalPath,
  getUserSkillCanonicalRoot,
} from './skill-management-service';
import {
  readSourceManifest,
  setSourceManifestPathForTests as setSourceManifestPathForTestsInStore,
  SOURCE_MANIFEST_DIR,
  writeSourceManifest,
} from './source-manifest-store';

export {
  getSourceProvenanceByInstalledPath,
  getSourceProvenanceByInstalledPathMap,
  readSourceManifest,
  writeSourceManifest,
} from './source-manifest-store';

const SOURCES_DIR = SOURCE_MANIFEST_DIR;
const SKIPPED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'dist',
  'build',
]);
const ALLOWED_HIDDEN_DIRS = new Set(['.claude', '.opencode']);
const AGENT_DIRS = new Set(['agents', '.claude/agents', '.opencode/agents']);
const MAX_SCAN_FILES = 5_000;
const MAX_SCAN_BYTES = 50 * 1024 * 1024;
const MAX_SCAN_DEPTH = 24;
const execFileAsync = promisify(execFile);

let sourcesBaseDir = SOURCES_DIR;
let gitRunner: (args: string[], cwd?: string) => Promise<string> =
  runGitCommand;
let manifestMutationQueue = Promise.resolve();

export function setSourceManifestPathForTests(manifestPath?: string): void {
  setSourceManifestPathForTestsInStore(manifestPath);
  manifestMutationQueue = Promise.resolve();
}

export function setSourcesBaseDirForTests(baseDir?: string): void {
  sourcesBaseDir = baseDir ?? SOURCES_DIR;
}

export function setGitRunnerForTests(
  runner?: (args: string[], cwd?: string) => Promise<string>,
): void {
  gitRunner = runner ?? runGitCommand;
}

export function parseGitHubRepoUrl(input: string): {
  owner: string;
  repo: string;
  url: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error('Expected a GitHub HTTPS repository URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error('Expected a GitHub HTTPS repository URL');
  }

  const [owner, rawRepo, ...rest] = parsed.pathname.split('/').filter(Boolean);
  if (!owner || !rawRepo || rest.length > 0) {
    throw new Error(
      'Expected a GitHub repository URL like https://github.com/owner/repo',
    );
  }

  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  if (!isValidGitHubOwner(owner) || !isValidGitHubRepo(repo)) {
    throw new Error('Invalid GitHub owner or repository name');
  }

  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

export async function scanSourceDirectory({
  rootPath,
  commit,
}: {
  rootPath: string;
  commit: string;
}): Promise<DetectedSourceItem[]> {
  const items: DetectedSourceItem[] = [];
  const budget: ScanBudget = {
    files: 0,
    bytes: 0,
    rootPath,
  };

  await walkSourceDirectory({
    rootPath,
    currentPath: rootPath,
    commit,
    items,
    budget,
    depth: 0,
  });

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildGithubClonePath({
  owner,
  repo,
  url,
}: {
  owner: string;
  repo: string;
  url: string;
}): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return path.join(sourcesBaseDir, 'github', owner, `${repo}-${hash}`);
}

export async function listSources(): Promise<SourceView[]> {
  const manifest = await readSourceManifest();
  return Promise.all(manifest.sources.map(toSourceView));
}

export async function addGitHubSource(
  params: AddGitHubSourceParams,
): Promise<SourceView> {
  return withManifestMutation(async () => addGitHubSourceMutation(params));
}

async function addGitHubSourceMutation(
  params: AddGitHubSourceParams,
): Promise<SourceView> {
  const parsed = parseGitHubRepoUrl(params.url);
  const manifest = await readSourceManifest();

  if (manifest.sources.some((source) => source.url === parsed.url)) {
    throw new Error(`Source already exists for URL: ${parsed.url}`);
  }

  const clonePath = buildGithubClonePath(parsed);
  assertManagedSourcePath(clonePath);
  await assertManagedSourceParentPath(clonePath);
  try {
    await fs.rm(clonePath, { force: true, recursive: true });
    await gitRunner(['clone', '--depth', '1', parsed.url, clonePath]);
    const source = await buildSourceFromClone({
      ...parsed,
      clonePath,
      existingInstalls: [],
    });
    const nextManifest = {
      ...manifest,
      sources: [...manifest.sources, source],
    };
    await writeSourceManifest(nextManifest);
    return toSourceView(source);
  } catch (error) {
    await fs
      .rm(clonePath, { force: true, recursive: true })
      .catch(() => undefined);
    throw error;
  }
}

export async function refreshSource({
  sourceId,
}: {
  sourceId: string;
}): Promise<SourceView> {
  return withManifestMutation(async () => refreshSourceMutation({ sourceId }));
}

export async function installSourceItems(
  params: InstallSourceItemsParams,
): Promise<SourceView[]> {
  return withManifestMutation(async () => installSourceItemsMutation(params));
}

export async function updateSourceInstall(
  params: UpdateSourceInstallParams,
): Promise<SourceView[]> {
  return withManifestMutation(async () => updateSourceInstallMutation(params));
}

export async function removeSource(sourceId: string): Promise<void> {
  return withManifestMutation(async () => {
    const manifest = await readSourceManifest();
    const source = manifest.sources.find(
      (existingSource) => existingSource.id === sourceId,
    );
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    assertManagedSourcePath(source.clonePath);
    const nextManifest = {
      ...manifest,
      sources: manifest.sources.filter(
        (existingSource) => existingSource.id !== sourceId,
      ),
    };

    if (!(await pathExists(source.clonePath))) {
      await writeSourceManifest(nextManifest);
      return;
    }

    const tempPath = path.join(
      path.dirname(source.clonePath),
      `${path.basename(source.clonePath)}.removing-${randomUUID()}`,
    );
    assertManagedSourcePath(tempPath);
    await assertManagedSourceParentPath(tempPath);
    await fs.rename(source.clonePath, tempPath);
    try {
      await writeSourceManifest(nextManifest);
    } catch (error) {
      await fs.rename(tempPath, source.clonePath).catch(() => undefined);
      throw error;
    }
    await fs
      .rm(tempPath, { force: true, recursive: true })
      .catch(() => undefined);
  });
}

async function refreshSourceMutation({
  sourceId,
}: {
  sourceId: string;
}): Promise<SourceView> {
  const manifest = await readSourceManifest();
  const sourceIndex = manifest.sources.findIndex(
    (source) => source.id === sourceId,
  );
  if (sourceIndex === -1) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const existingSource = manifest.sources[sourceIndex];
  try {
    await assertExistingManagedSourcePath(existingSource.clonePath);
    await gitRunner(['pull', '--ff-only'], existingSource.clonePath);
    const refreshedSource = await buildSourceFromClone({
      id: existingSource.id,
      owner: existingSource.owner,
      repo: existingSource.repo,
      url: existingSource.url,
      clonePath: existingSource.clonePath,
      existingInstalls: existingSource.installs,
    });
    const nextManifest = replaceSource(manifest, sourceIndex, refreshedSource);
    await writeSourceManifest(nextManifest);
    return toSourceView(refreshedSource);
  } catch (error) {
    const failedSource = {
      ...existingSource,
      error: error instanceof Error ? error.message : String(error),
    };
    const nextManifest = replaceSource(manifest, sourceIndex, failedSource);
    await writeSourceManifest(nextManifest);
    return toSourceView(failedSource);
  }
}

async function installSourceItemsMutation({
  items,
}: InstallSourceItemsParams): Promise<SourceView[]> {
  const manifest = await readSourceManifest();
  const plannedInstalls = await Promise.all(
    items.map((item) => planSourceInstall({ manifest, item })),
  );
  const seenTargets = new Set<string>();
  const seenSourceItems = new Set<string>();

  for (const install of plannedInstalls) {
    const sourceItemKey = `${install.source.id}:${install.item.id}`;
    if (seenSourceItems.has(sourceItemKey)) {
      throw new Error(`Duplicate source item install: ${install.item.id}`);
    }
    seenSourceItems.add(sourceItemKey);

    const resolvedTarget = path.resolve(install.targetPath);
    if (seenTargets.has(resolvedTarget)) {
      throw new Error(`Install target conflict: ${install.targetPath}`);
    }
    seenTargets.add(resolvedTarget);
    if (await pathExists(install.targetPath)) {
      throw new Error(`Install target already exists: ${install.targetPath}`);
    }
  }

  const installRecordsBySourceId = new Map<string, SourceInstallRecord[]>();
  const copiedInstalls: PlannedSourceInstall[] = [];
  try {
    for (const install of plannedInstalls) {
      copiedInstalls.push(install);
      if (install.item.kind === 'skill') {
        await copySkillDirectory({
          sourcePath: install.sourcePath,
          targetPath: install.targetPath,
        });
        for (const backendType of install.enabledBackends) {
          await enableSkill({ skillPath: install.targetPath, backendType });
        }
      } else {
        await fs.mkdir(path.dirname(install.targetPath), { recursive: true });
        await fs.copyFile(install.sourcePath, install.targetPath);
        for (const backendType of install.enabledBackends) {
          await enableAgent({ agentPath: install.targetPath, backendType });
        }
      }

      const installedContentHash =
        install.item.kind === 'skill'
          ? await hashDirectory(install.targetPath)
          : hashFileContent(await fs.readFile(install.targetPath, 'utf-8'));
      const record: SourceInstallRecord = {
        id: randomUUID(),
        kind: install.item.kind,
        sourceItemId: install.item.id,
        sourceRelativePath: install.item.sourceRelativePath,
        sourceCommit: install.item.sourceCommit,
        sourceContentHash: install.item.sourceContentHash,
        installedPath: install.targetPath,
        installedName: install.targetName,
        installedContentHash,
        installedAt: new Date().toISOString(),
      };
      installRecordsBySourceId.set(install.source.id, [
        ...(installRecordsBySourceId.get(install.source.id) ?? []),
        record,
      ]);
    }

    const installedSourceItemIdsBySourceId = new Map<string, Set<string>>();
    for (const install of plannedInstalls) {
      installedSourceItemIdsBySourceId.set(
        install.source.id,
        new Set([
          ...(installedSourceItemIdsBySourceId.get(install.source.id) ?? []),
          install.item.id,
        ]),
      );
    }
    const nextManifest: SourceManifest = {
      ...manifest,
      sources: manifest.sources.map((source) => {
        const installedSourceItemIds = installedSourceItemIdsBySourceId.get(
          source.id,
        );
        return {
          ...source,
          installs: [
            ...source.installs.filter(
              (install) => !installedSourceItemIds?.has(install.sourceItemId),
            ),
            ...(installRecordsBySourceId.get(source.id) ?? []),
          ],
        };
      }),
    };
    await writeSourceManifest(nextManifest);
    return Promise.all(nextManifest.sources.map(toSourceView));
  } catch (error) {
    await rollbackCreatedInstalls(copiedInstalls);
    throw error;
  }
}

async function updateSourceInstallMutation({
  sourceId,
  installId,
  overwriteLocalChanges,
}: UpdateSourceInstallParams): Promise<SourceView[]> {
  const manifest = await readSourceManifest();
  const sourceIndex = manifest.sources.findIndex(
    (source) => source.id === sourceId,
  );
  if (sourceIndex === -1) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const source = manifest.sources[sourceIndex];
  const installIndex = source.installs.findIndex(
    (install) => install.id === installId,
  );
  if (installIndex === -1) {
    throw new Error(`Source install not found: ${installId}`);
  }

  const install = source.installs[installIndex];
  const sourceItem = source.items.find(
    (item) => item.id === install.sourceItemId,
  );
  if (!sourceItem) {
    throw new Error(`Source item not found: ${install.sourceItemId}`);
  }

  const sourcePath = await getSafeSourceItemPath({ source, item: sourceItem });
  const installedPresent = await pathExists(install.installedPath);
  if (!installedPresent) {
    throw new Error(`Installed path does not exist: ${install.installedPath}`);
  }
  await assertValidInstalledPath(install);
  await assertInstalledPathIsNotSymlink(install);

  const currentInstalledContentHash = await hashInstalledContent(install);
  if (
    currentInstalledContentHash !== install.installedContentHash &&
    !overwriteLocalChanges
  ) {
    throw new Error('Installed item has local changes');
  }

  const sourceContentHash = await hashSourceItemPath({
    kind: sourceItem.kind,
    sourcePath,
  });
  let replacement: InstalledReplacement | undefined;
  if (sourceItem.kind === 'skill') {
    replacement = await replaceSkillInstallDirectory({
      sourcePath,
      installedPath: install.installedPath,
    });
  } else {
    replacement = await replaceAgentInstallFile({
      sourcePath,
      installedPath: install.installedPath,
    });
  }

  const installedContentHash = await hashInstalledContent(install);
  const nextInstall: SourceInstallRecord = {
    ...install,
    sourceCommit: sourceItem.sourceCommit,
    sourceContentHash,
    installedContentHash,
    updatedAt: new Date().toISOString(),
  };
  const nextSource: ManagedSource = {
    ...source,
    installs: source.installs.map((existingInstall, index) =>
      index === installIndex ? nextInstall : existingInstall,
    ),
  };
  const nextManifest = replaceSource(manifest, sourceIndex, nextSource);
  try {
    await writeSourceManifest(nextManifest);
    await replacement.cleanup();
    return Promise.all(nextManifest.sources.map(toSourceView));
  } catch (error) {
    await replacement.rollback();
    await replacement.cleanup();
    throw error;
  }
}

async function rollbackCreatedInstalls(
  installs: PlannedSourceInstall[],
): Promise<void> {
  for (const install of installs.reverse()) {
    for (const backendType of install.enabledBackends) {
      await removeSymlinkIfPointsTo({
        symlinkPath: getBackendSymlinkPath({
          kind: install.item.kind,
          backendType,
          targetPath: install.targetPath,
        }),
        targetPath: install.targetPath,
      });
    }
    await fs
      .rm(install.targetPath, {
        force: true,
        recursive: install.item.kind === 'skill',
      })
      .catch(() => undefined);
  }
}

function getBackendSymlinkPath({
  kind,
  backendType,
  targetPath,
}: {
  kind: DetectedSourceItem['kind'];
  backendType: AgentBackendType;
  targetPath: string;
}): string {
  if (kind === 'skill') {
    return path.join(
      getSkillPathConfig(backendType).userSkillsDir,
      path.basename(targetPath),
    );
  }
  return path.join(
    getAgentPathConfig(backendType).userAgentsDir,
    path.basename(targetPath),
  );
}

async function removeSymlinkIfPointsTo({
  symlinkPath,
  targetPath,
}: {
  symlinkPath: string;
  targetPath: string;
}): Promise<void> {
  try {
    const stat = await fs.lstat(symlinkPath);
    if (!stat.isSymbolicLink()) return;
    const [actualTarget, expectedTarget] = await Promise.all([
      fs.realpath(symlinkPath),
      fs.realpath(targetPath),
    ]);
    if (actualTarget === expectedTarget) {
      await fs.unlink(symlinkPath);
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function assertNoSymlinks(directoryPath: string): Promise<void> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Source item contains symlink: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      await assertNoSymlinks(entryPath);
    }
  }
}

async function assertExistingPathInsideRoot({
  rootPath,
  targetPath,
}: {
  rootPath: string;
  targetPath: string;
}): Promise<void> {
  const [rootRealPath, targetRealPath] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(targetPath),
  ]);
  assertPathInsideRoot({ rootPath: rootRealPath, targetPath: targetRealPath });
}

async function assertValidInstalledPath(
  install: SourceInstallRecord,
): Promise<void> {
  const rootPath =
    install.kind === 'skill'
      ? getUserSkillCanonicalRoot()
      : getUserAgentCanonicalRoot();
  const itemName = install.kind === 'skill' ? 'skill' : 'agent';
  const resolvedRoot = path.resolve(rootPath);
  const resolvedInstalledPath = path.resolve(install.installedPath);

  if (
    !isPathDescendant({
      rootPath: resolvedRoot,
      targetPath: resolvedInstalledPath,
    })
  ) {
    throw new Error(
      `Installed ${itemName} path is outside managed ${itemName} directory: ${install.installedPath}`,
    );
  }

  const realInstalledPath = await fs.realpath(install.installedPath);
  if (
    !isPathDescendant({ rootPath: resolvedRoot, targetPath: realInstalledPath })
  ) {
    throw new Error(
      `Installed ${itemName} path resolves outside managed ${itemName} directory: ${install.installedPath}`,
    );
  }
}

async function assertInstalledPathIsNotSymlink(
  install: SourceInstallRecord,
): Promise<void> {
  const stat = await fs.lstat(install.installedPath);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Installed ${install.kind} path is a symlink: ${install.installedPath}`,
    );
  }
}

type InstalledReplacement = {
  rollback: () => Promise<void>;
  cleanup: () => Promise<void>;
};

async function replaceSkillInstallDirectory({
  sourcePath,
  installedPath,
}: {
  sourcePath: string;
  installedPath: string;
}): Promise<InstalledReplacement> {
  const parentDir = path.dirname(installedPath);
  const baseName = path.basename(installedPath);
  const tempPath = path.join(
    parentDir,
    `.${baseName}.update-${randomUUID()}.tmp`,
  );
  const backupPath = path.join(
    parentDir,
    `.${baseName}.backup-${randomUUID()}.tmp`,
  );
  let backupCreated = false;
  let replaced = false;

  try {
    await copySkillDirectory({ sourcePath, targetPath: tempPath });
    await fs.rename(installedPath, backupPath);
    backupCreated = true;
    await fs.rename(tempPath, installedPath);
    replaced = true;
  } catch (error) {
    await fs
      .rm(tempPath, { force: true, recursive: true })
      .catch(() => undefined);
    if (backupCreated) {
      await fs.rename(backupPath, installedPath).catch(() => undefined);
    }
    throw error;
  }

  return {
    rollback: async () => {
      if (!replaced) return;
      await fs.rm(installedPath, { force: true, recursive: true });
      await fs.rename(backupPath, installedPath);
      replaced = false;
    },
    cleanup: async () => {
      await fs
        .rm(tempPath, { force: true, recursive: true })
        .catch(() => undefined);
      await fs
        .rm(backupPath, { force: true, recursive: true })
        .catch(() => undefined);
    },
  };
}

async function copySkillDirectory({
  sourcePath,
  targetPath,
}: {
  sourcePath: string;
  targetPath: string;
}): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Source item contains symlink: ${sourceEntryPath}`);
    }
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      await copySkillDirectory({
        sourcePath: sourceEntryPath,
        targetPath: targetEntryPath,
      });
    } else if (entry.isFile()) {
      await fs.copyFile(sourceEntryPath, targetEntryPath);
    }
  }
}

async function replaceAgentInstallFile({
  sourcePath,
  installedPath,
}: {
  sourcePath: string;
  installedPath: string;
}): Promise<InstalledReplacement> {
  const parentDir = path.dirname(installedPath);
  const baseName = path.basename(installedPath);
  const backupPath = path.join(
    parentDir,
    `.${baseName}.backup-${randomUUID()}.tmp`,
  );
  let backupCreated = false;

  try {
    await fs.mkdir(parentDir, { recursive: true });
    await fs.copyFile(installedPath, backupPath);
    backupCreated = true;
    await fs.copyFile(sourcePath, installedPath);
  } catch (error) {
    if (backupCreated) {
      await fs.copyFile(backupPath, installedPath).catch(() => undefined);
    }
    await fs.rm(backupPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    rollback: async () => {
      await fs.copyFile(backupPath, installedPath);
    },
    cleanup: async () => {
      await fs.rm(backupPath, { force: true }).catch(() => undefined);
    },
  };
}

async function isInstalledPathPresent(
  install: SourceInstallRecord,
): Promise<boolean> {
  return pathExists(install.installedPath);
}

type PlannedSourceInstall = Awaited<ReturnType<typeof planSourceInstall>>;

function isValidGitHubOwner(owner: string): boolean {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner);
}

function isValidGitHubRepo(repo: string): boolean {
  return repo !== '.' && repo !== '..' && /^[a-zA-Z0-9._-]+$/.test(repo);
}

async function runGitCommand(args: string[], cwd?: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, timeout: 60_000 });
  return String(result.stdout).trim();
}

function withManifestMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = manifestMutationQueue.then(operation, operation);
  manifestMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function assertManagedSourcePath(sourcePath: string): void {
  const resolvedBaseDir = path.resolve(sourcesBaseDir);
  const resolvedSourcePath = path.resolve(sourcePath);
  const relativePath = path.relative(resolvedBaseDir, resolvedSourcePath);

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Source clone path is outside managed sources directory');
  }
}

async function assertManagedSourceParentPath(
  sourcePath: string,
): Promise<void> {
  assertManagedSourcePath(sourcePath);
  const parentPath = path.dirname(sourcePath);
  await fs.mkdir(parentPath, { recursive: true });
  const [baseRealPath, parentRealPath] = await Promise.all([
    fs.realpath(sourcesBaseDir),
    fs.realpath(parentPath),
  ]);
  if (
    !isPathDescendant({ rootPath: baseRealPath, targetPath: parentRealPath })
  ) {
    throw new Error(
      'Source clone parent path resolves outside managed sources directory',
    );
  }
}

async function assertExistingManagedSourcePath(
  sourcePath: string,
): Promise<void> {
  assertManagedSourcePath(sourcePath);
  let baseRealPath: string;
  let sourceRealPath: string;
  try {
    [baseRealPath, sourceRealPath] = await Promise.all([
      fs.realpath(sourcesBaseDir),
      fs.realpath(sourcePath),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error(`Source clone path does not exist: ${sourcePath}`);
    }
    throw error;
  }

  if (
    !isPathDescendant({ rootPath: baseRealPath, targetPath: sourceRealPath })
  ) {
    throw new Error(
      'Source clone path resolves outside managed sources directory',
    );
  }
}

function assertPathInsideRoot({
  rootPath,
  targetPath,
}: {
  rootPath: string;
  targetPath: string;
}): void {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  if (
    !isPathInsideRoot({ rootPath: resolvedRoot, targetPath: resolvedTarget })
  ) {
    throw new Error('Source item path is outside source clone');
  }
}

function isPathInsideRoot({
  rootPath,
  targetPath,
}: {
  rootPath: string;
  targetPath: string;
}): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function isPathDescendant({
  rootPath,
  targetPath,
}: {
  rootPath: string;
  targetPath: string;
}): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

async function planSourceInstall({
  manifest,
  item,
}: {
  manifest: SourceManifest;
  item: InstallSourceItemsParams['items'][number];
}): Promise<{
  source: ManagedSource;
  item: DetectedSourceItem;
  sourcePath: string;
  targetPath: string;
  targetName: string;
  enabledBackends: InstallSourceItemsParams['items'][number]['enabledBackends'];
}> {
  const source = manifest.sources.find((source) => source.id === item.sourceId);
  if (!source) {
    throw new Error(`Source not found: ${item.sourceId}`);
  }

  const sourceItem = source.items.find(
    (existingItem) => existingItem.id === item.sourceItemId,
  );
  if (!sourceItem) {
    throw new Error(`Source item not found: ${item.sourceItemId}`);
  }

  const existingInstalls = source.installs.filter(
    (install) => install.sourceItemId === sourceItem.id,
  );
  if (
    (
      await Promise.all(
        existingInstalls.map((install) => isInstalledPathPresent(install)),
      )
    ).some(Boolean)
  ) {
    throw new Error(`Source item already installed: ${sourceItem.id}`);
  }

  const sourcePath = await getSafeSourceItemPath({
    source,
    item: sourceItem,
  });
  if (sourceItem.kind === 'skill') {
    assertValidSkillTargetName(item.targetName);
  } else {
    assertValidAgentTargetName(item.targetName);
  }

  return {
    source,
    item: sourceItem,
    sourcePath,
    targetPath:
      sourceItem.kind === 'skill'
        ? getUserSkillCanonicalPath(item.targetName)
        : getUserAgentCanonicalPath(item.targetName),
    targetName: item.targetName,
    enabledBackends: item.enabledBackends,
  };
}

async function buildSourceFromClone({
  id,
  owner,
  repo,
  url,
  clonePath,
  existingInstalls,
}: {
  id?: string;
  owner: string;
  repo: string;
  url: string;
  clonePath: string;
  existingInstalls: ManagedSource['installs'];
}): Promise<ManagedSource> {
  assertManagedSourcePath(clonePath);
  await assertExistingManagedSourcePath(clonePath);
  const branch = await gitRunner(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    clonePath,
  );
  const currentCommit = await gitRunner(['rev-parse', 'HEAD'], clonePath);
  const now = new Date().toISOString();

  return {
    id: id ?? buildSourceId({ owner, repo, url }),
    type: 'github',
    url,
    owner,
    repo,
    branch,
    clonePath,
    currentCommit,
    lastFetchedAt: now,
    lastScanAt: now,
    items: await scanSourceDirectory({
      rootPath: clonePath,
      commit: currentCommit,
    }),
    installs: existingInstalls,
  };
}

function buildSourceId({
  owner,
  repo,
  url,
}: {
  owner: string;
  repo: string;
  url: string;
}): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return `github:${owner}/${repo}-${hash}`;
}

function replaceSource(
  manifest: SourceManifest,
  sourceIndex: number,
  source: ManagedSource,
): SourceManifest {
  return {
    ...manifest,
    sources: manifest.sources.map((existingSource, index) =>
      index === sourceIndex ? source : existingSource,
    ),
  };
}

async function getSafeSourceItemPath({
  source,
  item,
}: {
  source: ManagedSource;
  item: DetectedSourceItem;
}): Promise<string> {
  assertManagedSourcePath(source.clonePath);
  await assertExistingPathInsideRoot({
    rootPath: sourcesBaseDir,
    targetPath: source.clonePath,
  });

  const sourcePath = path.join(source.clonePath, item.sourceRelativePath);
  assertPathInsideRoot({ rootPath: source.clonePath, targetPath: sourcePath });
  let sourceStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    sourceStat = await fs.lstat(sourcePath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    throw new Error(`Source item path does not exist: ${sourcePath}`);
  }
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Source item contains symlink: ${sourcePath}`);
  }
  if (item.kind === 'skill') {
    await assertNoSymlinks(sourcePath);
  }
  await assertExistingPathInsideRoot({
    rootPath: source.clonePath,
    targetPath: sourcePath,
  });
  return sourcePath;
}

async function toSourceView(source: ManagedSource): Promise<SourceView> {
  const existingItems = await Promise.all(
    source.items.map((item) => toSourceItemView({ source, item })),
  );
  const itemIds = new Set(source.items.map((item) => item.id));
  const missingInstallItems = source.installs
    .filter((install) => !itemIds.has(install.sourceItemId))
    .map((install) => sourceMissingInstallToItem({ source, install }));

  return {
    ...source,
    items: [...existingItems, ...missingInstallItems],
  };
}

function sourceMissingInstallToItem({
  source,
  install,
}: {
  source: ManagedSource;
  install: SourceInstallRecord;
}): SourceItemView {
  return {
    id: install.sourceItemId,
    kind: install.kind,
    sourceRelativePath: install.sourceRelativePath,
    sourceCommit: source.currentCommit,
    detectedName: install.installedName,
    detectedDescription: '',
    sourceContentHash: install.sourceContentHash,
    install,
    status: 'source-missing',
  };
}

async function toSourceItemView({
  source,
  item,
}: {
  source: ManagedSource;
  item: DetectedSourceItem;
}): Promise<SourceItemView> {
  const install = source.installs.find(
    (existingInstall) => existingInstall.sourceItemId === item.id,
  );
  if (!install) {
    return { ...item, status: 'available' };
  }

  let sourcePath: string;
  try {
    sourcePath = await getSafeSourceItemPath({ source, item });
  } catch (error) {
    if (isSourceMissingError(error)) {
      return { ...item, install, status: 'source-missing' };
    }
    return { ...item, install, status: 'conflict' };
  }
  if (!(await pathExists(install.installedPath))) {
    return { ...item, install, status: 'installed-missing' };
  }

  try {
    await assertValidInstalledPath(install);
    await assertInstalledPathIsNotSymlink(install);
  } catch {
    return { ...item, install, status: 'conflict' };
  }

  let currentInstalledContentHash: string;
  try {
    currentInstalledContentHash = await hashInstalledContent(install);
  } catch {
    return { ...item, install, status: 'conflict' };
  }
  if (currentInstalledContentHash !== install.installedContentHash) {
    return {
      ...item,
      install,
      status: 'local-changes',
      currentInstalledContentHash,
    };
  }

  let currentSourceContentHash: string;
  try {
    currentSourceContentHash = await hashSourceItemPath({
      kind: item.kind,
      sourcePath,
    });
  } catch {
    return { ...item, install, status: 'conflict' };
  }
  if (currentSourceContentHash !== install.sourceContentHash) {
    return {
      ...item,
      install,
      status: 'update-available',
      currentInstalledContentHash,
    };
  }
  return {
    ...item,
    install,
    status: 'up-to-date',
    currentInstalledContentHash,
  };
}

function isSourceMissingError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Source item path does not exist:')
  );
}

async function hashInstalledContent(
  install: SourceInstallRecord,
): Promise<string> {
  return install.kind === 'skill'
    ? hashDirectory(install.installedPath)
    : hashFileContent(await fs.readFile(install.installedPath, 'utf-8'));
}

async function hashSourceItemPath({
  kind,
  sourcePath,
}: {
  kind: DetectedSourceItem['kind'];
  sourcePath: string;
}): Promise<string> {
  return kind === 'skill'
    ? hashDirectory(sourcePath)
    : hashFileContent(await fs.readFile(sourcePath, 'utf-8'));
}

async function walkSourceDirectory({
  rootPath,
  currentPath,
  commit,
  items,
  budget,
  depth,
}: {
  rootPath: string;
  currentPath: string;
  commit: string;
  items: DetectedSourceItem[];
  budget: ScanBudget;
  depth: number;
}): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) {
    throw new Error(`Source scan exceeded max depth of ${MAX_SCAN_DEPTH}`);
  }
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const skillMd = entries.find(
    (entry) => entry.isFile() && entry.name === 'SKILL.md',
  );

  if (skillMd) {
    const raw = await readTextFileWithinBudget(
      path.join(currentPath, skillMd.name),
      budget,
    );
    const frontmatter = parseFrontmatter(raw);
    const sourceRelativePath = toPosixRelativePath(rootPath, currentPath);
    items.push({
      id: `skill:${sourceRelativePath}`,
      kind: 'skill',
      sourceRelativePath,
      sourceCommit: commit,
      detectedName: frontmatter.name ?? path.basename(currentPath),
      detectedDescription: frontmatter.description ?? '',
      sourceContentHash: await hashDirectory(currentPath, budget),
    });
    return;
  }

  const sourceRelativePath = toPosixRelativePath(rootPath, currentPath);
  if (AGENT_DIRS.has(sourceRelativePath)) {
    for (const entry of entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(currentPath, entry.name);
      const raw = await readTextFileWithinBudget(filePath, budget);
      const frontmatter = parseFrontmatter(raw);
      const relativeFile = toPosixRelativePath(rootPath, filePath);
      items.push({
        id: `agent:${relativeFile}`,
        kind: 'agent',
        sourceRelativePath: relativeFile,
        sourceCommit: commit,
        detectedName: frontmatter.name ?? path.basename(entry.name, '.md'),
        detectedDescription: frontmatter.description ?? '',
        sourceContentHash: hashFileContent(raw),
      });
    }
  }

  for (const entry of entries
    .filter((entry) => entry.isDirectory() && shouldScanDirectory(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    await walkSourceDirectory({
      rootPath,
      currentPath: path.join(currentPath, entry.name),
      commit,
      items,
      budget,
      depth: depth + 1,
    });
  }
}

function shouldScanDirectory(name: string): boolean {
  if (SKIPPED_DIRS.has(name)) return false;
  if (name.startsWith('.') && !ALLOWED_HIDDEN_DIRS.has(name)) return false;
  return true;
}

type ScanBudget = {
  files: number;
  bytes: number;
  rootPath: string;
};

async function hashDirectory(
  directoryPath: string,
  budget?: ScanBudget,
): Promise<string> {
  const hashBudget = budget ?? { files: 0, bytes: 0, rootPath: directoryPath };
  const filePaths = (await listFiles(directoryPath, hashBudget, 0)).sort(
    (a, b) =>
      toPosixRelativePath(directoryPath, a).localeCompare(
        toPosixRelativePath(directoryPath, b),
      ),
  );
  const hash = createHash('sha256');

  for (const filePath of filePaths) {
    const relativeFile = toPosixRelativePath(directoryPath, filePath);
    hash.update(relativeFile);
    hash.update('\0');
    hash.update(await readBinaryFileWithinBudget(filePath, hashBudget));
    hash.update('\0');
  }

  return hash.digest('hex');
}

async function listFiles(
  directoryPath: string,
  budget: ScanBudget,
  depth: number,
): Promise<string[]> {
  if (depth > MAX_SCAN_DEPTH) {
    throw new Error(`Source scan exceeded max depth of ${MAX_SCAN_DEPTH}`);
  }
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Source item contains symlink: ${entryPath}`);
    } else if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      files.push(...(await listFiles(entryPath, budget, depth + 1)));
    } else if (entry.isFile()) {
      budget.files += 1;
      if (budget.files > MAX_SCAN_FILES) {
        throw new Error(
          `Source scan exceeded max file count of ${MAX_SCAN_FILES}`,
        );
      }
      files.push(entryPath);
    }
  }

  return files;
}

async function readTextFileWithinBudget(
  filePath: string,
  budget: ScanBudget,
): Promise<string> {
  return (await readBinaryFileWithinBudget(filePath, budget)).toString('utf-8');
}

async function readBinaryFileWithinBudget(
  filePath: string,
  budget: ScanBudget,
): Promise<Buffer> {
  const stat = await fs.stat(filePath);
  budget.bytes += stat.size;
  if (budget.bytes > MAX_SCAN_BYTES) {
    throw new Error(`Source scan exceeded max size of ${MAX_SCAN_BYTES} bytes`);
  }
  return fs.readFile(filePath);
}

function hashFileContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function toPosixRelativePath(rootPath: string, targetPath: string): string {
  return path
    .relative(rootPath, targetPath)
    .split(path.sep)
    .join(path.posix.sep);
}
