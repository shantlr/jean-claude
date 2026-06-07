import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { ProjectFeatureMap } from '@shared/types';

const MAX_FEATURE_DEPTH = 4;
export const FEATURE_MAP_GIT_PATH = '.jean-claude/feature-map.yaml';
const FEATURE_MAP_RELATIVE_PATH = path.join('.jean-claude', 'feature-map.yaml');
const LEGACY_FEATURE_MAP_RELATIVE_PATH = path.join(
  '.jean-claude',
  'feature-map.json',
);

const FEATURE_MAP_YAML_SCHEMA = `features:
  - name: string, max 100 chars
    summary: string, max 500 chars
    key_files:
      - relative/path/to/key-file.ts
    children:
      - name: string, max 100 chars
        summary: string, max 500 chars
        key_files:
          - relative/path/to/key-file.ts
        children: []

Rules:
- features is required and must contain at least one item.
- Every feature node must include name, summary, key_files, and children.
- key_files and children must be arrays. Use [] when empty.
- children repeats the same node shape recursively.
- Maximum feature depth is 4 total levels.`;

export function getProjectFeatureMapPath(projectPath: string) {
  return path.join(projectPath, FEATURE_MAP_RELATIVE_PATH);
}

export async function getProjectFeatureMap(
  projectPath: string,
): Promise<ProjectFeatureMap | null> {
  for (const filePath of [
    getProjectFeatureMapPath(projectPath),
    path.join(projectPath, LEGACY_FEATURE_MAP_RELATIVE_PATH),
  ]) {
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
  skillName,
}: {
  project: {
    name: string;
    path: string;
  };
  tempFilePath: string;
  skillName?: string | null;
}): string {
  const projectDetails = `Project name: ${project.name}
Repository path: ${project.path}
Output file: ${tempFilePath}`;
  const skillInstruction = skillName
    ? `Use the "${skillName}" skill to create the feature map.\n\n`
    : '';
  const schemaBlock = `<feature_map_yaml_schema>
${FEATURE_MAP_YAML_SCHEMA}
</feature_map_yaml_schema>`;

  return `${skillInstruction}${projectDetails}

Write the feature map YAML to the output file.
The YAML must match this schema:
${schemaBlock}`;
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
  depth = 1,
  parentId = '',
): ProjectFeatureMap['features'][number] | null {
  if (depth > MAX_FEATURE_DEPTH) return null;
  if (!value || typeof value !== 'object') return null;
  const item = value as {
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

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const featureId = `${parentId}${id || 'feature'}-${index + 1}`;

  const children = Array.isArray(item.children)
    ? item.children
        .map((child, childIndex) =>
          normalizeFeature(child, childIndex, depth + 1, `${featureId}-`),
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
