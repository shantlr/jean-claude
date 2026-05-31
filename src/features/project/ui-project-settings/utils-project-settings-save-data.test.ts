import { describe, expect, it } from 'vitest';

import { getProjectSettingsSaveData } from './utils-project-settings-save-data';

describe('getProjectSettingsSaveData', () => {
  it('keeps only dirty fields to avoid overwriting concurrent updates', () => {
    expect(
      getProjectSettingsSaveData({
        data: {
          name: 'Jean Claude',
          summary: null,
          color: '#7c3aed',
        },
        dirtyFields: new Set(['name', 'color']),
      }),
    ).toEqual({
      name: 'Jean Claude',
      color: '#7c3aed',
    });
  });

  it('keeps summary when user edited it', () => {
    expect(
      getProjectSettingsSaveData({
        data: {
          name: 'Jean Claude',
          summary: null,
        },
        dirtyFields: new Set(['summary']),
      }),
    ).toEqual({
      summary: null,
    });
  });
});
