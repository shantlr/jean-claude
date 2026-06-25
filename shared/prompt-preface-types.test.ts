import { describe, expect, it } from 'vitest';

import {
  applyPromptPrefaceToParts,
  normalizeProjectPromptPrefaceSetting,
  normalizePromptPrefaceSetting,
} from './prompt-preface-types';

describe('prompt preface settings', () => {
  it('normalizes legacy global preface into a generic enabled entry', () => {
    expect(
      normalizePromptPrefaceSetting({
        text: 'Global rules',
        placement: 'before',
        frequency: 'initial',
      }),
    ).toEqual([
      {
        id: 'legacy-1',
        name: 'Preface 1',
        enabled: true,
        text: 'Global rules',
        placement: 'before',
        frequency: 'initial',
      },
    ]);
  });

  it('normalizes legacy project extend to preserve old effective behavior', () => {
    expect(
      normalizeProjectPromptPrefaceSetting({
        value: {
          mode: 'extend',
          text: 'Project rules',
          placement: 'after',
          frequency: 'each',
        },
        globalEntries: [
          {
            id: 'legacy-1',
            name: 'Preface 1',
            enabled: true,
            text: 'Global rules',
            placement: 'before',
            frequency: 'initial',
          },
        ],
      }),
    ).toEqual({
      mode: 'override',
      entries: [
        {
          id: 'legacy-1',
          name: 'Preface 1',
          enabled: true,
          text: 'Global rules',
          placement: 'after',
          frequency: 'each',
        },
        {
          id: 'legacy-2',
          name: 'Preface 2',
          enabled: true,
          text: 'Project rules',
          placement: 'after',
          frequency: 'each',
        },
      ],
    });
  });

  it('normalizes empty legacy project extend to inherit global behavior', () => {
    expect(
      normalizeProjectPromptPrefaceSetting({
        value: {
          mode: 'extend',
          text: '   ',
          placement: 'after',
          frequency: 'each',
        },
        globalEntries: [
          {
            id: 'legacy-1',
            name: 'Preface 1',
            enabled: true,
            text: 'Global rules',
            placement: 'before',
            frequency: 'initial',
          },
        ],
      }),
    ).toEqual({ mode: 'inherit', entries: [] });
  });

  it('applies enabled prefaces in order by placement and frequency', () => {
    expect(
      applyPromptPrefaceToParts({
        parts: [{ type: 'text', text: 'Prompt' }],
        isInitialPrompt: false,
        entries: [
          {
            id: '1',
            name: 'Before initial',
            enabled: true,
            text: 'Skipped',
            placement: 'before',
            frequency: 'initial',
          },
          {
            id: '2',
            name: 'Before each',
            enabled: true,
            text: 'Before',
            placement: 'before',
            frequency: 'each',
          },
          {
            id: '3',
            name: 'After each',
            enabled: true,
            text: 'After',
            placement: 'after',
            frequency: 'each',
          },
        ],
      }),
    ).toEqual([{ type: 'text', text: 'Before\n\nPrompt\n\nAfter' }]);
  });
});
