import { describe, expect, it } from 'vitest';

import type { ProjectFeatureMap } from '@shared/types';

import {
  expandFeatureReferencesInPrompt,
  flattenProjectFeatures,
  getFeatureReferenceText,
  getReferencedFeatures,
} from './prompt-feature-context';

const featureMap: ProjectFeatureMap = {
  generatedAt: '2026-06-07T00:00:00.000Z',
  features: [
    {
      id: 'shell',
      name: 'Shell',
      summary: 'App shell summary',
      key_files: ['src/shell.tsx'],
      children: [
        {
          id: 'shell-settings',
          name: 'Settings',
          summary: 'Shell settings summary',
          key_files: ['src/shell-settings.tsx'],
          children: [],
        },
      ],
    },
    {
      id: 'project',
      name: 'Project',
      summary: 'Project summary',
      key_files: ['src/project.tsx'],
      children: [
        {
          id: 'project-settings',
          name: 'Settings',
          summary: 'Project settings summary',
          key_files: ['src/project-settings.tsx'],
          children: [],
        },
      ],
    },
  ],
};

describe('prompt feature context', () => {
  it('expands refs after accepted punctuation prefixes', () => {
    const expanded = expandFeatureReferencesInPrompt({
      text: 'Update (#Shell) and "#Project".',
      featureMap,
    });

    expect(expanded).toContain('Update (Shell) and "Project".');
    expect(expanded).toContain('<feature name="Shell">');
    expect(expanded).toContain('<feature name="Project">');
  });

  it('uses breadcrumb refs for duplicate feature names', () => {
    const flat = flattenProjectFeatures(featureMap.features);
    const projectSettings = flat.find(
      (feature) => feature.id === 'project-settings',
    );
    expect(projectSettings).toBeDefined();

    const reference = getFeatureReferenceText(projectSettings!, flat);
    expect(reference).toBe('Project > Settings');

    const referenced = getReferencedFeatures({
      text: `Update #${reference}`,
      featureMap,
    });
    expect(referenced.map((feature) => feature.id)).toEqual([
      'project-settings',
    ]);
  });
});
