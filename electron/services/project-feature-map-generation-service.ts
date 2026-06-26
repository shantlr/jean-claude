import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { ProjectFeatureMap } from '@shared/types';

export const FEATURE_MAP_GIT_PATH = '.jean-claude/feature-map.yaml';
const FEATURE_MAP_RELATIVE_PATH = path.join('.jean-claude', 'feature-map.yaml');
const LEGACY_FEATURE_MAP_RELATIVE_PATH = path.join(
  '.jean-claude',
  'feature-map.json',
);

const FEATURE_MAP_YAML_SCHEMA = `features:
  - id: stable string id
    name: string, max 100 chars
    summary: string, max 500 chars
    key_files:
      - relative/path/to/key-file.ts
    children:
      - id: stable string id
        name: string, max 100 chars
        summary: string, max 500 chars
        key_files:
          - relative/path/to/key-file.ts
        children: []

Rules:
- features is required and must contain at least one item.
- Every feature node must include id, name, summary, key_files, and children.
- Preserve existing ids when updating an existing feature map.
- key_files and children must be arrays. Use [] when empty.
- children repeats the same node shape recursively.`;

export function getProjectFeatureMapPath(projectPath: string) {
  return path.join(projectPath, FEATURE_MAP_RELATIVE_PATH);
}

export async function getProjectFeatureMap(
  projectPath: string,
): Promise<ProjectFeatureMap | null> {
  for (const filePath of getSupportedProjectFeatureMapPaths(projectPath)) {
    try {
      const content = await readFile(filePath, 'utf8');
      const featureMap = parseProjectFeatureMapContent(content);
      if (featureMap) return featureMap;
    } catch {
      // Try next supported feature-map format.
    }
  }
  return null;
}

export async function getExistingProjectFeatureMapPath(
  projectPath: string,
): Promise<string | null> {
  for (const filePath of getSupportedProjectFeatureMapPaths(projectPath)) {
    try {
      const content = await readFile(filePath, 'utf8');
      if (parseProjectFeatureMapContent(content)) return filePath;
    } catch {
      // Try next supported feature-map format.
    }
  }
  return null;
}

export async function copyExistingProjectFeatureMapToTemp({
  existingFeatureMapPath,
  tempDir,
}: {
  existingFeatureMapPath: string | null;
  tempDir: string;
}): Promise<string | null> {
  if (!existingFeatureMapPath) return null;

  await mkdir(tempDir, { recursive: true });
  const ext = path.extname(existingFeatureMapPath).toLowerCase();
  const tempPath = path.join(
    tempDir,
    `existing-feature-map${ext === '.json' ? '.json' : '.yaml'}`,
  );
  await copyFile(existingFeatureMapPath, tempPath);
  return tempPath;
}

export async function saveProjectFeatureMapFromTemp({
  tempFilePath,
  savedFilePath,
}: {
  tempFilePath: string;
  savedFilePath: string;
}) {
  const content = await readFile(tempFilePath, 'utf8');
  const featureMap = parseProjectFeatureMapContent(content);
  if (!featureMap) throw new Error('Temp file is not a valid feature map YAML');

  const yamlPath = savedFilePath.replace(/\.json$/i, '.yaml');
  await mkdir(path.dirname(yamlPath), { recursive: true });
  await writeFile(yamlPath, stringifyFeatureMap(featureMap));
  return featureMap;
}

export async function getProjectFeatureMapDraftDiff({
  projectPath,
  tempFilePath,
}: {
  projectPath: string;
  tempFilePath: string;
}) {
  const newContent = await readFile(tempFilePath, 'utf8');
  const existingPath = await getExistingProjectFeatureMapPath(projectPath);
  const oldContent = existingPath ? await readFile(existingPath, 'utf8') : '';

  return {
    path: FEATURE_MAP_GIT_PATH,
    status: existingPath ? ('modified' as const) : ('added' as const),
    oldContent,
    newContent,
  };
}

export async function cleanupFeatureMapTempDir(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

export function getFeatureMapTempPaths({
  projectPath,
  taskId,
}: {
  projectPath: string;
  taskId: string;
}) {
  const tempDir = path.join(
    projectPath,
    '.jean-claude',
    'tmp',
    'feature-map',
    taskId,
  );
  return {
    tempDir,
    tempFilePath: path.join(tempDir, 'feature-map.yaml'),
    savedFilePath: getProjectFeatureMapPath(projectPath),
  };
}

export function buildProjectFeatureMapPrompt({
  project,
  tempFilePath,
  existingFeatureMapPath,
  skillName,
}: {
  project: {
    name: string;
    path: string;
  };
  tempFilePath: string;
  existingFeatureMapPath?: string | null;
  skillName?: string | null;
}): string {
  const projectDetails = `Project name: ${project.name}
Repository path: ${project.path}
Output file: ${tempFilePath}${
    existingFeatureMapPath
      ? `\nExisting feature map copy: ${existingFeatureMapPath}`
      : ''
  }`;
  const skillInstruction = skillName
    ? `Use the "${skillName}" skill to ${
        existingFeatureMapPath ? 'update' : 'create'
      } the feature map.\n\n`
    : '';
  const schemaBlock = `<feature_map_yaml_schema>
${FEATURE_MAP_YAML_SCHEMA}
</feature_map_yaml_schema>`;
  const iterationInstructions = existingFeatureMapPath
    ? `
Update mode:
- Read the existing feature map copy first.
- Iterate on the existing feature map; do not fully rewrite it from scratch.
- Preserve accurate existing nodes, names, summaries, and structure.
- Explore code to find missing, newly added, or shallowly documented user-facing features.
- Add or refine only the parts needed to close gaps.
- Output the complete updated YAML, not a partial patch.`
    : '';

  return `${skillInstruction}${projectDetails}
${iterationInstructions}

Write the feature map YAML to the output file.
The YAML must match this schema:
${schemaBlock}`;
}

function getSupportedProjectFeatureMapPaths(projectPath: string) {
  return [
    getProjectFeatureMapPath(projectPath),
    path.join(projectPath, LEGACY_FEATURE_MAP_RELATIVE_PATH),
  ];
}

export function parseProjectFeatureMapContent(value: string) {
  try {
    return normalizeFeatureMap(parseYaml(value));
  } catch {
    return null;
  }
}

function stringifyFeatureMap(featureMap: ProjectFeatureMap) {
  return stringifyYaml(
    { features: featureMap.features },
    { lineWidth: 0, singleQuote: false },
  );
}

function normalizeFeatureMap(value: unknown): ProjectFeatureMap | null {
  if (!value || typeof value !== 'object' || !('features' in value))
    return null;
  const features = (value as { features: unknown }).features;
  if (!Array.isArray(features)) return null;

  const normalized = features
    .map((feature, index) => normalizeFeature(feature, index))
    .filter((feature): feature is ProjectFeatureMap['features'][number] =>
      Boolean(feature),
    );

  if (normalized.length === 0) return null;
  return { features: normalized, generatedAt: new Date().toISOString() };
}

function normalizeFeature(
  value: unknown,
  index: number,
  parentId = '',
): ProjectFeatureMap['features'][number] | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as {
    id?: unknown;
    name?: unknown;
    summary?: unknown;
    key_files?: unknown;
    files?: unknown;
    children?: unknown;
  };
  if (typeof item.name !== 'string' || typeof item.summary !== 'string') {
    return null;
  }

  const name = item.name.trim().replace(/\s+/g, ' ').slice(0, 100);
  const summary = item.summary.trim().replace(/\s+/g, ' ').slice(0, 500);
  if (!name || !summary) return null;

  const rawKeyFiles = Array.isArray(item.key_files)
    ? item.key_files
    : item.files;
  const keyFiles = Array.isArray(rawKeyFiles)
    ? rawKeyFiles
        .filter((file): file is string => typeof file === 'string')
        .map((file) => file.trim())
        .filter(Boolean)
    : [];

  const generatedId = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const explicitId = typeof item.id === 'string' ? item.id.trim() : '';
  const featureId =
    explicitId || `${parentId}${generatedId || 'feature'}-${index + 1}`;

  const children = Array.isArray(item.children)
    ? item.children
        .map((child, childIndex) =>
          normalizeFeature(child, childIndex, `${featureId}-`),
        )
        .filter((child): child is ProjectFeatureMap['features'][number] =>
          Boolean(child),
        )
    : [];

  return {
    id: featureId,
    name,
    summary,
    key_files: keyFiles,
    children,
  };
}
