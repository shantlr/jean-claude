import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';


import type {
  SourceManifest,
  SourceProvenance,
} from '@shared/source-management-types';

export const SOURCE_MANIFEST_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'sources',
);

const MANIFEST_PATH = path.join(SOURCE_MANIFEST_DIR, 'manifest.json');

let sourceManifestPath = MANIFEST_PATH;

export function setSourceManifestPathForTests(manifestPath?: string): void {
  sourceManifestPath = manifestPath ?? MANIFEST_PATH;
}

export async function readSourceManifest(): Promise<SourceManifest> {
  try {
    const raw = await fs.readFile(sourceManifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as unknown;
    if (!isSourceManifest(manifest)) {
      throw new Error(
        'Invalid source manifest: expected version 1 with sources array',
      );
    }
    return manifest;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
    return { version: 1, sources: [] };
  }
}

export async function writeSourceManifest(
  manifest: SourceManifest,
): Promise<void> {
  await fs.mkdir(path.dirname(sourceManifestPath), { recursive: true });
  const tmpPath = `${sourceManifestPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(
      tmpPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf-8',
    );
    await fs.rename(tmpPath, sourceManifestPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function getSourceProvenanceByInstalledPathMap(): Promise<
  Map<string, SourceProvenance>
> {
  const provenanceByInstalledPath = new Map<string, SourceProvenance>();
  try {
    const manifest = await readSourceManifest();
    for (const source of manifest.sources) {
      for (const install of source.installs) {
        provenanceByInstalledPath.set(path.resolve(install.installedPath), {
          sourceId: source.id,
          owner: source.owner,
          repo: source.repo,
          commit: install.sourceCommit,
        });
      }
    }
  } catch {
    return new Map();
  }
  return provenanceByInstalledPath;
}

export async function getSourceProvenanceByInstalledPath({
  installedPath,
}: {
  installedPath: string;
}): Promise<SourceProvenance | undefined> {
  const provenanceByInstalledPath =
    await getSourceProvenanceByInstalledPathMap();
  return provenanceByInstalledPath.get(path.resolve(installedPath));
}

function isSourceManifest(value: unknown): value is SourceManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { sources?: unknown }).sources)
  );
}
