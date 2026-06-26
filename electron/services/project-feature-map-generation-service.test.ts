import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  buildProjectFeatureMapPrompt,
  copyExistingProjectFeatureMapToTemp,
  parseProjectFeatureMapContent,
  saveProjectFeatureMapFromTemp,
} from './project-feature-map-generation-service';

describe('buildProjectFeatureMapPrompt', () => {
  it('includes an existing feature map path when provided', () => {
    const prompt = buildProjectFeatureMapPrompt({
      project: { name: 'Jean Claude', path: '/workspace/jean-claude' },
      tempFilePath:
        '/workspace/jean-claude/.jean-claude/tmp/feature-map/1/feature-map.yaml',
      existingFeatureMapPath:
        '/workspace/jean-claude/.jean-claude/feature-map.yaml',
    });

    expect(prompt).toContain(
      'Existing feature map copy: /workspace/jean-claude/.jean-claude/feature-map.yaml',
    );
  });

  it('asks the agent to update existing maps instead of replacing them', () => {
    const prompt = buildProjectFeatureMapPrompt({
      project: { name: 'Jean Claude', path: '/workspace/jean-claude' },
      tempFilePath:
        '/workspace/jean-claude/.jean-claude/tmp/feature-map/1/feature-map.yaml',
      existingFeatureMapPath:
        '/workspace/jean-claude/.jean-claude/feature-map.yaml',
      skillName: 'project-feature-mapping',
    });

    expect(prompt).toContain(
      'Use the "project-feature-mapping" skill to update the feature map.',
    );
    expect(prompt).toContain('Preserve accurate existing nodes');
    expect(prompt).toContain('Read the existing feature map copy first.');
    expect(prompt).toContain(
      'Iterate on the existing feature map; do not fully rewrite it from scratch.',
    );
    expect(prompt).toContain(
      'Explore code to find missing, newly added, or shallowly documented user-facing features.',
    );
    expect(prompt).toContain('Output the complete updated YAML');
  });

  it('tells agents to preserve feature ids', () => {
    const prompt = buildProjectFeatureMapPrompt({
      project: { name: 'Jean Claude', path: '/workspace/jean-claude' },
      tempFilePath:
        '/workspace/jean-claude/.jean-claude/tmp/feature-map/1/feature-map.yaml',
      existingFeatureMapPath:
        '/workspace/jean-claude/.jean-claude/feature-map.yaml',
    });

    expect(prompt).toContain('id: stable string id');
    expect(prompt).toContain('Preserve existing ids');
    expect(prompt).not.toContain('Maximum feature depth');
  });
});

describe('copyExistingProjectFeatureMapToTemp', () => {
  it('copies an existing feature map into the temp directory', async () => {
    await mkdir(tmpdir(), { recursive: true });
    const tempDir = await mkdtemp(path.join(tmpdir(), 'feature-map-'));
    const existingFeatureMapPath = path.join(tempDir, 'feature-map.yaml');
    const workingDir = path.join(tempDir, 'work');
    await writeFile(existingFeatureMapPath, 'features: []');

    const copiedPath = await copyExistingProjectFeatureMapToTemp({
      existingFeatureMapPath,
      tempDir: workingDir,
    });

    expect(copiedPath).toBe(path.join(workingDir, 'existing-feature-map.yaml'));
    await expect(readFile(copiedPath!, 'utf8')).resolves.toBe('features: []');
  });

  it('returns null when no existing feature map exists', async () => {
    const copiedPath = await copyExistingProjectFeatureMapToTemp({
      existingFeatureMapPath: null,
      tempDir: path.join(tmpdir(), 'feature-map-missing'),
    });

    expect(copiedPath).toBeNull();
  });
});

describe('parseProjectFeatureMapContent', () => {
  it('generates fallback ids when feature ids are omitted', () => {
    const featureMap = parseProjectFeatureMapContent(`features:
  - name: Project Summary & Feature Map
    summary: AI-generated project summaries and YAML feature maps.
    key_files: []
    children:
      - name: Feature Map Save Action
        summary: Saves reviewed feature-map drafts.
        key_files: []
        children: []
`);

    expect(featureMap?.features[0]?.id).toBe(
      'project-summary-feature-map-1',
    );
    expect(featureMap?.features[0]?.children[0]?.id).toBe(
      'project-summary-feature-map-1-feature-map-save-action-1',
    );
  });

  it('keeps feature nodes beyond four levels deep', () => {
    const featureMap = parseProjectFeatureMapContent(`features:
  - id: level-1
    name: Level 1
    summary: First level.
    key_files: []
    children:
      - id: level-2
        name: Level 2
        summary: Second level.
        key_files: []
        children:
          - id: level-3
            name: Level 3
            summary: Third level.
            key_files: []
            children:
              - id: level-4
                name: Level 4
                summary: Fourth level.
                key_files: []
                children:
                  - id: level-5
                    name: Level 5
                    summary: Fifth level.
                    key_files: []
                    children: []
`);

    expect(
      featureMap?.features[0]?.children[0]?.children[0]?.children[0]
        ?.children[0]?.id,
    ).toBe('level-5');
  });
});

describe('saveProjectFeatureMapFromTemp', () => {
  it('preserves explicit feature ids when saving YAML', async () => {
    await mkdir(tmpdir(), { recursive: true });
    const tempDir = await mkdtemp(path.join(tmpdir(), 'feature-map-'));
    const tempFilePath = path.join(tempDir, 'draft.yaml');
    const savedFilePath = path.join(tempDir, 'feature-map.yaml');

    await writeFile(
      tempFilePath,
      `features:
  - id: project-summary-feature-map
    name: Project Summary & Feature Map
    summary: AI-generated project summaries and YAML feature maps.
    key_files:
      - electron/services/project-feature-map-generation-service.ts
    children:
      - id: feature-map-save-action
        name: Feature Map Save Action
        summary: Saves reviewed feature-map drafts.
        key_files:
          - src/features/task/ui-feature-map-save-action/index.tsx
        children: []
`,
    );

    const featureMap = await saveProjectFeatureMapFromTemp({
      tempFilePath,
      savedFilePath,
    });
    const savedContent = await readFile(savedFilePath, 'utf8');

    expect(featureMap.features[0]?.id).toBe('project-summary-feature-map');
    expect(featureMap.features[0]?.children[0]?.id).toBe(
      'feature-map-save-action',
    );
    expect(savedContent).toContain('id: project-summary-feature-map');
    expect(savedContent).toContain('id: feature-map-save-action');
  });
});
