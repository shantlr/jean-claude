import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { constants as fsConstants } from 'fs';


import type {
  AgentMigrationExecuteResult,
  AgentMigrationPreviewItem,
  AgentMigrationPreviewResult,
  ManagedAgent,
} from '@shared/agent-management-types';
import type { AgentBackendType } from '@shared/agent-backend-types';


import { dbg } from '../lib/debug';
import { isEnoent } from '../lib/fs';
import { parseFrontmatter } from '../lib/skill-frontmatter';

import { getSourceProvenanceByInstalledPathMap } from './source-manifest-store';

const JC_USER_AGENTS_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'agents',
  'user',
);

type AgentManagementBackendType = Exclude<AgentBackendType, 'codex'>;

const AGENT_PATH_CONFIGS: Record<
  AgentManagementBackendType,
  { userAgentsDir: string }
> = {
  'claude-code': {
    userAgentsDir: path.join(os.homedir(), '.claude', 'agents'),
  },
  opencode: {
    userAgentsDir: path.join(os.homedir(), '.config', 'opencode', 'agents'),
  },
};

export function getAgentPathConfig(backendType: AgentBackendType): {
  userAgentsDir: string;
} {
  if (backendType === 'codex') {
    throw new Error('Codex agents are not implemented yet');
  }
  return AGENT_PATH_CONFIGS[backendType];
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function getAllowedAgentRoots(): string[] {
  return [
    JC_USER_AGENTS_DIR,
    ...Object.values(AGENT_PATH_CONFIGS).map((config) => config.userAgentsDir),
  ].map((root) => path.resolve(root));
}

function isPathWithinRoot(p: string, root: string): boolean {
  const relative = path.relative(root, p);
  return (
    relative === '' ||
    (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

async function assertAllowedAgentPath(agentPath: string): Promise<void> {
  const resolvedPath = path.resolve(agentPath);
  const allowedRoots = getAllowedAgentRoots();

  if (!resolvedPath.toLowerCase().endsWith('.md')) {
    throw new Error('Agent path must be a markdown file');
  }

  if (!allowedRoots.some((root) => isPathWithinRoot(resolvedPath, root))) {
    throw new Error(
      `Agent path is outside managed agent directories: ${agentPath}`,
    );
  }

  try {
    const realPath = await fs.realpath(resolvedPath);
    const resolvedRealPath = path.resolve(realPath);
    if (
      !allowedRoots.some((root) => isPathWithinRoot(resolvedRealPath, root))
    ) {
      throw new Error(
        `Agent path resolves outside managed agent directories: ${agentPath}`,
      );
    }
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
}

async function symlinkPointsTo({
  symlinkPath,
  targetPath,
}: {
  symlinkPath: string;
  targetPath: string;
}): Promise<boolean> {
  if (!(await isSymlink(symlinkPath))) return false;
  try {
    const [actualTarget, expectedTarget] = await Promise.all([
      fs.realpath(symlinkPath),
      fs.realpath(targetPath),
    ]);
    return actualTarget === expectedTarget;
  } catch {
    return false;
  }
}

function normalizeAgentFileName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`;
}

function normalizeAgentFileBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export function normalizeAgentTargetFileName(name: string): string {
  return normalizeAgentFileName(name);
}

export function assertValidAgentTargetName(name: string): string {
  const fileBase = normalizeAgentFileBase(name);
  if (!/[a-z0-9]/.test(fileBase)) {
    throw new Error(
      'Invalid agent target name: must include a letter or number',
    );
  }
  return `${fileBase}.md`;
}

export function getUserAgentCanonicalPath(name: string): string {
  return path.join(JC_USER_AGENTS_DIR, normalizeAgentTargetFileName(name));
}

export function getUserAgentCanonicalRoot(): string {
  return JC_USER_AGENTS_DIR;
}

function createMigrationId({
  backendType,
  legacyPath,
}: {
  backendType: AgentBackendType;
  legacyPath: string;
}): string {
  return `${backendType}:${legacyPath}`;
}

async function readAgentFile(
  agentPath: string,
): Promise<{ name: string; description: string; content: string } | null> {
  try {
    const content = await fs.readFile(agentPath, 'utf-8');
    const fm = parseFrontmatter(content);
    return {
      name: fm.name || path.basename(agentPath, '.md'),
      description: fm.description || '',
      content,
    };
  } catch (error) {
    if (!isEnoent(error)) {
      dbg.agent('Failed to parse agent at %s: %O', agentPath, error);
    }
    return null;
  }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          (entry.isFile() || entry.isSymbolicLink()) &&
          entry.name.toLowerCase().endsWith('.md'),
      )
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function discoverJcManagedAgents(): Promise<ManagedAgent[]> {
  const agents: ManagedAgent[] = [];
  const sourceProvenanceByPath = await getSourceProvenanceByInstalledPathMap();

  for (const agentPath of await listMarkdownFiles(JC_USER_AGENTS_DIR)) {
    const info = await readAgentFile(agentPath);
    if (!info) continue;

    const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
    for (const [backend, config] of Object.entries(AGENT_PATH_CONFIGS)) {
      const backendType = backend as AgentManagementBackendType;
      enabledBackends[backendType] = await symlinkPointsTo({
        symlinkPath: path.join(config.userAgentsDir, path.basename(agentPath)),
        targetPath: agentPath,
      });
    }

    agents.push({
      name: info.name,
      description: info.description,
      agentPath,
      managed: true,
      enabledBackends,
      sourceProvenance: sourceProvenanceByPath.get(path.resolve(agentPath)),
      editable: true,
    });
  }
  return agents;
}

async function discoverLegacyAgents(
  backendType: AgentBackendType,
): Promise<ManagedAgent[]> {
  const config = getAgentPathConfig(backendType);
  const agents: ManagedAgent[] = [];
  for (const agentPath of await listMarkdownFiles(config.userAgentsDir)) {
    if (await isSymlink(agentPath)) continue;
    const info = await readAgentFile(agentPath);
    if (!info) continue;
    agents.push({
      name: info.name,
      description: info.description,
      agentPath,
      managed: false,
      enabledBackends: { [backendType]: true },
      editable: true,
    });
  }
  return agents;
}

async function discoverMigrationCandidates(
  backendType: AgentBackendType,
): Promise<AgentMigrationPreviewItem[]> {
  const config = getAgentPathConfig(backendType);
  const items: AgentMigrationPreviewItem[] = [];
  for (const legacyPath of await listMarkdownFiles(config.userAgentsDir)) {
    if (await isSymlink(legacyPath)) continue;
    const info = await readAgentFile(legacyPath);
    const id = createMigrationId({ backendType, legacyPath });
    if (!info) {
      items.push({
        id,
        backendType,
        legacyPath,
        targetCanonicalPath: '',
        name: path.basename(legacyPath, '.md'),
        status: 'skip-invalid',
        reason: 'Agent file could not be read',
      });
      continue;
    }

    const targetCanonicalPath = path.join(
      JC_USER_AGENTS_DIR,
      path.basename(legacyPath),
    );
    const conflict = await pathExists(targetCanonicalPath);
    items.push({
      id,
      backendType,
      legacyPath,
      targetCanonicalPath,
      name: info.name,
      status: conflict ? 'skip-conflict' : 'migrate',
      reason: conflict ? 'Canonical agent already exists' : undefined,
    });
  }
  return items;
}

export async function getAllManagedAgents(): Promise<ManagedAgent[]> {
  const results: ManagedAgent[] = [];
  const seenPaths = new Set<string>();

  for (const agent of await discoverJcManagedAgents()) {
    seenPaths.add(agent.agentPath);
    results.push(agent);
  }

  for (const backend of Object.keys(
    AGENT_PATH_CONFIGS,
  ) as AgentManagementBackendType[]) {
    for (const agent of await discoverLegacyAgents(backend)) {
      if (seenPaths.has(agent.agentPath)) continue;
      seenPaths.add(agent.agentPath);
      results.push(agent);
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgentContent({
  agentPath,
}: {
  agentPath: string;
}): Promise<{ name: string; description: string; content: string }> {
  await assertAllowedAgentPath(agentPath);
  const info = await readAgentFile(agentPath);
  if (!info) throw new Error(`Agent not found: ${agentPath}`);
  return info;
}

export async function createAgent({
  enabledBackends,
  name,
  description,
  content,
}: {
  enabledBackends: AgentBackendType[];
  name: string;
  description: string;
  content: string;
}): Promise<ManagedAgent> {
  const fileName = assertValidAgentTargetName(name);
  const canonicalPath = path.join(JC_USER_AGENTS_DIR, fileName);
  if (await pathExists(canonicalPath)) {
    throw new Error(`Agent already exists: ${canonicalPath}`);
  }

  const fileContent = content.trim().startsWith('---')
    ? content.trimEnd() + '\n'
    : [
        '---',
        `name: ${name}`,
        description ? `description: ${description}` : '',
        '---',
        '',
        content,
      ]
        .filter((line, index) => line !== '' || index >= 4)
        .join('\n') + '\n';

  await fs.mkdir(JC_USER_AGENTS_DIR, { recursive: true });
  await fs.writeFile(canonicalPath, fileContent, 'utf-8');

  const createdSymlinks: string[] = [];
  try {
    for (const backend of enabledBackends) {
      const config = getAgentPathConfig(backend);
      const symlinkPath = path.join(config.userAgentsDir, fileName);
      await fs.mkdir(config.userAgentsDir, { recursive: true });
      await fs.symlink(canonicalPath, symlinkPath);
      createdSymlinks.push(symlinkPath);
    }
  } catch (error) {
    for (const symlinkPath of createdSymlinks) {
      await fs.unlink(symlinkPath).catch(() => undefined);
    }
    await fs.rm(canonicalPath, { force: true });
    throw error;
  }

  return {
    name,
    description,
    agentPath: canonicalPath,
    managed: true,
    enabledBackends: Object.fromEntries(
      enabledBackends.map((backend) => [backend, true]),
    ) as Partial<Record<AgentBackendType, boolean>>,
    editable: true,
  };
}

export async function updateAgent({
  agentPath,
  content,
}: {
  agentPath: string;
  content: string;
}): Promise<ManagedAgent> {
  await assertAllowedAgentPath(agentPath);
  await fs.writeFile(agentPath, content.trimEnd() + '\n', 'utf-8');
  const info = await getAgentContent({ agentPath });
  const managed = agentPath.startsWith(JC_USER_AGENTS_DIR + path.sep);
  const enabledBackends: Partial<Record<AgentBackendType, boolean>> = {};
  if (managed) {
    for (const [backend, config] of Object.entries(AGENT_PATH_CONFIGS)) {
      enabledBackends[backend as AgentManagementBackendType] =
        await symlinkPointsTo({
          symlinkPath: path.join(
            config.userAgentsDir,
            path.basename(agentPath),
          ),
          targetPath: agentPath,
        });
    }
  } else {
    for (const [backend, config] of Object.entries(AGENT_PATH_CONFIGS)) {
      if (path.dirname(agentPath) === config.userAgentsDir) {
        enabledBackends[backend as AgentManagementBackendType] = true;
      }
    }
  }
  return { ...info, agentPath, managed, enabledBackends, editable: true };
}

export async function deleteAgent({
  agentPath,
}: {
  agentPath: string;
}): Promise<void> {
  await assertAllowedAgentPath(agentPath);
  const fileName = path.basename(agentPath);
  if (agentPath.startsWith(JC_USER_AGENTS_DIR + path.sep)) {
    for (const config of Object.values(AGENT_PATH_CONFIGS)) {
      const symlinkPath = path.join(config.userAgentsDir, fileName);
      if (await symlinkPointsTo({ symlinkPath, targetPath: agentPath })) {
        await fs.unlink(symlinkPath);
      }
    }
  }
  await fs.rm(agentPath, { force: true });
}

export async function enableAgent({
  agentPath,
  backendType,
}: {
  agentPath: string;
  backendType: AgentBackendType;
}): Promise<void> {
  await assertAllowedAgentPath(agentPath);
  const config = getAgentPathConfig(backendType);
  const symlinkPath = path.join(config.userAgentsDir, path.basename(agentPath));
  await fs.mkdir(config.userAgentsDir, { recursive: true });
  try {
    await fs.symlink(agentPath, symlinkPath);
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    if (!(await symlinkPointsTo({ symlinkPath, targetPath: agentPath }))) {
      throw new Error(
        `Agent already exists for ${backendType}: ${symlinkPath}`,
      );
    }
  }
}

export async function disableAgent({
  agentPath,
  backendType,
}: {
  agentPath: string;
  backendType: AgentBackendType;
}): Promise<void> {
  await assertAllowedAgentPath(agentPath);
  const config = getAgentPathConfig(backendType);
  const symlinkPath = path.join(config.userAgentsDir, path.basename(agentPath));
  if (await symlinkPointsTo({ symlinkPath, targetPath: agentPath })) {
    await fs.unlink(symlinkPath);
  }
}

export async function previewLegacyAgentMigration(): Promise<AgentMigrationPreviewResult> {
  const items = await Promise.all(
    (Object.keys(AGENT_PATH_CONFIGS) as AgentManagementBackendType[]).map(
      (backendType) => discoverMigrationCandidates(backendType),
    ),
  );
  return { items: items.flat() };
}

export async function executeLegacyAgentMigration({
  itemIds,
}: {
  itemIds: string[];
}): Promise<AgentMigrationExecuteResult> {
  const preview = await previewLegacyAgentMigration();
  const migratableById = new Map(
    preview.items
      .filter((item) => item.status === 'migrate')
      .map((item) => [item.id, item]),
  );
  const results: AgentMigrationExecuteResult['results'] = [];

  for (const itemId of itemIds) {
    const item = migratableById.get(itemId);
    if (!item) {
      results.push({
        id: itemId,
        backendType: 'claude-code',
        legacyPath: '',
        targetCanonicalPath: '',
        name: '',
        status: 'skipped',
        reason: 'Item is no longer migratable. Run preview again.',
      });
      continue;
    }

    let legacyRemoved = false;
    try {
      const currentInfo = await readAgentFile(item.legacyPath);
      if (!currentInfo) {
        throw new Error('Legacy agent is no longer valid');
      }

      if (await isSymlink(item.legacyPath)) {
        throw new Error('Legacy agent is already managed by a symlink');
      }

      if (await pathExists(item.targetCanonicalPath)) {
        throw new Error(
          `Canonical target already exists: ${item.targetCanonicalPath}`,
        );
      }

      await fs.mkdir(path.dirname(item.targetCanonicalPath), {
        recursive: true,
      });
      await fs.copyFile(
        item.legacyPath,
        item.targetCanonicalPath,
        fsConstants.COPYFILE_EXCL,
      );
      await fs.rm(item.legacyPath, { force: true });
      legacyRemoved = true;
      await fs.symlink(item.targetCanonicalPath, item.legacyPath);
      results.push({ ...item, status: 'migrated' });
    } catch (error) {
      if (legacyRemoved) {
        await fs
          .copyFile(item.targetCanonicalPath, item.legacyPath)
          .catch(() => undefined);
        await fs
          .rm(item.targetCanonicalPath, { force: true })
          .catch(() => undefined);
      }
      results.push({
        ...item,
        status: 'failed',
        reason:
          error instanceof Error ? error.message : 'Failed to migrate agent',
      });
    }
  }

  return { results };
}
