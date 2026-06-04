import { execFile } from 'child_process';

import { systemPreferences } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeEditorWindowsForWorktree } from './editor-window-service';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('electron', () => ({
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn(),
  },
}));

const originalPlatform = process.platform;

function setPlatform(platform: typeof process.platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

describe('closeEditorWindowsForWorktree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      _file,
      _args,
      _options,
      callback,
    ) => {
      const invokeCallback = callback as unknown as (
        error: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      invokeCallback(null, '', '');
      return {} as ReturnType<typeof execFile>;
    }) as typeof execFile);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('requests accessibility permission before closing editor windows', async () => {
    vi.mocked(systemPreferences.isTrustedAccessibilityClient)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const attemptedClose = await closeEditorWindowsForWorktree({
      worktreePath: '/repo/.worktrees/task-1',
      editorSetting: { type: 'preset', id: 'cursor' },
    });

    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenCalledWith(
      false,
    );
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenCalledWith(
      true,
    );
    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        expect.stringContaining('perform action "AXPress"'),
        'Cursor',
        'task-1',
        '/repo/.worktrees/task-1',
      ],
      { timeout: 3_000 },
      expect.any(Function),
    );
    expect(attemptedClose).toEqual({ attempted: true });
  });

  it('does not run osascript when accessibility permission is denied', async () => {
    vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockReturnValue(
      false,
    );

    const attemptedClose = await closeEditorWindowsForWorktree({
      worktreePath: '/repo/.worktrees/task-1',
      editorSetting: { type: 'preset', id: 'cursor' },
    });

    expect(execFile).not.toHaveBeenCalled();
    expect(attemptedClose).toEqual({
      attempted: false,
      warning:
        'Editor windows could not be closed because Accessibility permission is not granted.',
    });
  });
});
