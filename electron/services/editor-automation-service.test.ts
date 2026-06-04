import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsRepository } from '../database/repositories/settings';

import { closeEditorWindowsForTaskWorktree } from './editor-automation-service';
import { closeEditorWindowsForWorktree } from './editor-window-service';

vi.mock('../database/repositories/settings', () => ({
  SettingsRepository: {
    get: vi.fn(),
  },
}));

vi.mock('./editor-window-service', () => ({
  closeEditorWindowsForWorktree: vi.fn(),
}));

describe('closeEditorWindowsForTaskWorktree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('closes editor windows when automation is enabled', async () => {
    const editorSetting = { type: 'preset' as const, id: 'vscode' };
    vi.mocked(closeEditorWindowsForWorktree).mockResolvedValue({
      attempted: true,
    });
    vi.mocked(SettingsRepository.get).mockImplementation(async (key) => {
      if (key === 'editorAutomation') {
        return { closeWindowsOnTaskCompletion: true };
      }
      if (key === 'editor') return editorSetting;
      throw new Error(`Unexpected setting key: ${key}`);
    });

    await closeEditorWindowsForTaskWorktree({
      id: 'task-1',
      worktreePath: '/repo/.worktrees/task-1',
    });

    expect(closeEditorWindowsForWorktree).toHaveBeenCalledWith({
      worktreePath: '/repo/.worktrees/task-1',
      editorSetting,
    });
  });

  it('does not load editor setting when automation is disabled', async () => {
    vi.mocked(SettingsRepository.get).mockResolvedValue({
      closeWindowsOnTaskCompletion: false,
    });

    await closeEditorWindowsForTaskWorktree({
      id: 'task-1',
      worktreePath: '/repo/.worktrees/task-1',
    });

    expect(SettingsRepository.get).toHaveBeenCalledTimes(1);
    expect(SettingsRepository.get).toHaveBeenCalledWith('editorAutomation');
    expect(closeEditorWindowsForWorktree).not.toHaveBeenCalled();
  });
});
