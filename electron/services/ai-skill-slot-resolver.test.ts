import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settingsGetMock } = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
}));

vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: settingsGetMock,
  },
}));

import { resolveAiSkillSlot } from './ai-skill-slot-resolver';

describe('resolveAiSkillSlot', () => {
  beforeEach(() => {
    settingsGetMock.mockReset();
    settingsGetMock.mockImplementation((key: string) => {
      if (key === 'backends') {
        return Promise.resolve({
          enabledBackends: ['opencode'],
          defaultBackend: 'opencode',
        });
      }
      if (key === 'backendDefaultModels') {
        return Promise.resolve({
          models: {
            'claude-code': 'haiku',
            opencode: 'openai/gpt-5.1-codex',
            codex: 'gpt-5.1-codex',
          },
        });
      }
      if (key === 'aiSkillSlots') {
        return Promise.resolve({});
      }
      throw new Error(`Unexpected setting key: ${key}`);
    });
  });

  it('falls back project slots from disabled backend to enabled default backend', async () => {
    const slot = await resolveAiSkillSlot('commit-message', {
      'commit-message': {
        backend: 'claude-code',
        model: 'haiku',
        thinkingEffort: 'high',
        skillName: 'claude-only-skill',
      },
    });

    expect(slot).toEqual({
      backend: 'opencode',
      model: 'openai/gpt-5.1-codex',
      thinkingEffort: 'default',
      skillName: null,
    });
  });

  it('falls back global slots from disabled backend to enabled default backend', async () => {
    settingsGetMock.mockImplementation((key: string) => {
      if (key === 'backends') {
        return Promise.resolve({
          enabledBackends: ['opencode'],
          defaultBackend: 'opencode',
        });
      }
      if (key === 'backendDefaultModels') {
        return Promise.resolve({
          models: {
            'claude-code': 'haiku',
            opencode: 'openai/gpt-5.1-codex',
            codex: 'gpt-5.1-codex',
          },
        });
      }
      if (key === 'aiSkillSlots') {
        return Promise.resolve({
          'task-name': {
            backend: 'claude-code',
            model: 'haiku',
            thinkingEffort: 'high',
            skillName: 'claude-only-skill',
          },
        });
      }
      throw new Error(`Unexpected setting key: ${key}`);
    });

    const slot = await resolveAiSkillSlot('task-name', null);

    expect(slot).toEqual({
      backend: 'opencode',
      model: 'openai/gpt-5.1-codex',
      thinkingEffort: 'default',
      skillName: null,
    });
  });

  it('keeps enabled slots unchanged', async () => {
    const slot = await resolveAiSkillSlot('pr-description', {
      'pr-description': {
        backend: 'opencode',
        model: 'anthropic/claude-sonnet-4-5',
        thinkingEffort: 'medium',
        skillName: 'shared-skill',
      },
    });

    expect(slot).toEqual({
      backend: 'opencode',
      model: 'anthropic/claude-sonnet-4-5',
      thinkingEffort: 'medium',
      skillName: 'shared-skill',
    });
  });

  it('falls back default project feature map slot but keeps builtin skill', async () => {
    const slot = await resolveAiSkillSlot('project-feature-map', null);

    expect(slot).toEqual({
      backend: 'opencode',
      model: 'openai/gpt-5.1-codex',
      thinkingEffort: 'default',
      skillName: 'project-feature-mapping',
    });
  });
});
