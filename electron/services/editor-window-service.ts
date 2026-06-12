import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

import { systemPreferences } from 'electron';

import { PRESET_EDITORS, type EditorSetting } from '@shared/types';

import { dbg } from '../lib/debug';

const execFileAsync = promisify(execFile);
const CLOSE_WINDOW_TIMEOUT_MS = 10_000;

export interface EditorWindowCloseResult {
  attempted: boolean;
  warning?: string;
}

const PRESET_PROCESS_NAMES: Record<string, string[]> = {
  vscode: ['Visual Studio Code', 'Code'],
};

function getPresetAppNames(editor: (typeof PRESET_EDITORS)[number]): string[] {
  return [editor.appName, ...(PRESET_PROCESS_NAMES[editor.id] ?? [])];
}

function getPresetAppNamesForAppName(appName: string): string[] {
  const normalizedAppName = withoutAppSuffix(appName).toLowerCase();
  const preset = PRESET_EDITORS.find(
    (editor) => editor.appName.toLowerCase() === normalizedAppName,
  );
  return preset ? getPresetAppNames(preset) : [];
}

function withoutAppSuffix(name: string): string {
  return name.endsWith('.app') ? name.slice(0, -4) : name;
}

function getEditorAppNames(setting: EditorSetting): string[] {
  if (setting.type === 'preset') {
    const editor = PRESET_EDITORS.find((item) => item.id === setting.id);
    return editor ? getPresetAppNames(editor) : [];
  }

  if (setting.type === 'app') {
    const appNames = [
      withoutAppSuffix(setting.name),
      withoutAppSuffix(path.basename(setting.path)),
    ];
    return [
      ...appNames,
      ...appNames.flatMap((appName) => getPresetAppNamesForAppName(appName)),
    ];
  }

  const commandName = path.basename(
    setting.command.trim().split(/\s+/)[0] ?? '',
  );
  const preset = PRESET_EDITORS.find((item) => item.command === commandName);
  return preset ? getPresetAppNames(preset) : [commandName];
}

const CLOSE_WINDOWS_SCRIPT = `
on run argv
  set appName to item 1 of argv
  set worktreeName to item 2 of argv
  set worktreePath to item 3 of argv
  set closedWindowCount to 0

  tell application "System Events"
    if not (exists process appName) then return "0"
    tell process appName
      repeat with editorWindow in windows
        try
          set editorWindowName to name of editorWindow as text
          if editorWindowName contains worktreeName or editorWindowName contains worktreePath then
            set closeButton to first button of editorWindow whose subrole is "AXCloseButton"
            perform action "AXPress" of closeButton
            set closedWindowCount to closedWindowCount + 1
          end if
        end try
      end repeat
    end tell
  end tell
  return closedWindowCount as text
end run
`;

export async function closeEditorWindowsForWorktree({
  worktreePath,
  editorSetting,
}: {
  worktreePath: string;
  editorSetting: EditorSetting;
}): Promise<EditorWindowCloseResult> {
  if (process.platform !== 'darwin') return { attempted: false };

  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    const warning =
      'Editor windows could not be closed because Accessibility permission is not granted.';
    if (!trusted) {
      dbg.ipc('%s Worktree: %s', warning, worktreePath);
      return { attempted: false, warning };
    }
  }

  const appNames = Array.from(
    new Set(getEditorAppNames(editorSetting).filter(Boolean)),
  );
  if (appNames.length === 0) {
    return {
      attempted: false,
      warning: 'Editor windows could not be closed for the selected editor.',
    };
  }

  const worktreeName = path.basename(worktreePath);

  const results: boolean[] = [];
  for (const appName of appNames) {
    try {
      await execFileAsync(
        'osascript',
        ['-e', CLOSE_WINDOWS_SCRIPT, appName, worktreeName, worktreePath],
        { timeout: CLOSE_WINDOW_TIMEOUT_MS },
      );
      results.push(true);
    } catch (error) {
      dbg.ipc(
        'Failed to close editor windows for app %s and worktree %s: %O',
        appName,
        worktreePath,
        error,
      );
      results.push(false);
    }
  }

  if (results.every((success) => !success)) {
    return {
      attempted: true,
      warning:
        'Editor windows could not be closed. Worktree cleanup continued.',
    };
  }

  return { attempted: true };
}
