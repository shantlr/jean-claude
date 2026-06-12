import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const executeTakeFirst = vi.fn();
  const insertExecute = vi.fn();
  const insertValues = vi.fn(() => ({
    onConflict: (
      callback: (builder: { column: (name: string) => unknown }) => unknown,
    ) => {
      callback({
        column: () => ({
          doUpdateSet: () => ({}),
        }),
      });
      return {
        execute: insertExecute,
      };
    },
  }));
  const insertInto = vi.fn(() => ({
    values: insertValues,
  }));
  const selectAll = vi.fn(() => ({
    executeTakeFirst,
  }));
  const where = vi.fn(() => ({
    selectAll,
  }));
  const selectFrom = vi.fn(() => ({
    where,
  }));

  return {
    dbMock: {
      insertInto,
      selectFrom,
    },
    executeTakeFirst,
    insertExecute,
    insertInto,
  };
});

const { executeTakeFirst, insertExecute, insertInto } = mocks;

vi.mock('../index', () => ({
  db: mocks.dbMock,
}));

vi.mock('../../lib/debug', () => ({
  dbg: {
    db: vi.fn(),
  },
}));

import { SettingsRepository } from './settings';

describe('SettingsRepository legacy normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes legacy backend default models missing codex', async () => {
    executeTakeFirst.mockResolvedValue({
      key: 'backendDefaultModels',
      value: JSON.stringify({
        models: {
          'claude-code': 'sonnet',
          opencode: 'openai/gpt-5',
        },
      }),
      updatedAt: '2026-06-12T00:00:00.000Z',
    });
    insertExecute.mockResolvedValue(undefined);

    await expect(
      SettingsRepository.get('backendDefaultModels'),
    ).resolves.toEqual({
      models: {
        'claude-code': 'sonnet',
        opencode: 'openai/gpt-5',
        codex: 'default',
      },
    });

    expect(insertInto).toHaveBeenCalledWith('settings');
  });

  it('normalizes legacy thinking settings missing codex', async () => {
    executeTakeFirst.mockResolvedValue({
      key: 'thinkingSettings',
      value: JSON.stringify({
        efforts: {
          'claude-code': { default: 'high', sonnet: 'max' },
          opencode: { default: 'medium' },
        },
        selectedModels: {
          'claude-code': 'sonnet',
          opencode: 'openai/gpt-5',
        },
      }),
      updatedAt: '2026-06-12T00:00:00.000Z',
    });
    insertExecute.mockResolvedValue(undefined);

    await expect(SettingsRepository.get('thinkingSettings')).resolves.toEqual({
      efforts: {
        'claude-code': { default: 'high', sonnet: 'max' },
        opencode: { default: 'medium' },
        codex: { default: 'default' },
      },
      selectedModels: {
        'claude-code': 'sonnet',
        opencode: 'openai/gpt-5',
        codex: 'default',
      },
    });

    expect(insertInto).toHaveBeenCalledWith('settings');
  });
});
