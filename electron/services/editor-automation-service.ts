import { dbg } from '../lib/debug';
import { SettingsRepository } from '../database/repositories/settings';


import { closeEditorWindowsForWorktree } from './editor-window-service';

export async function closeEditorWindowsForTaskWorktree(task: {
  id: string;
  worktreePath: string | null;
}): Promise<string | undefined> {
  if (!task.worktreePath) return undefined;

  const automationSetting = await SettingsRepository.get('editorAutomation');
  if (!automationSetting.closeWindowsOnTaskCompletion) return undefined;

  const editorSetting = await SettingsRepository.get('editor');
  const result = await closeEditorWindowsForWorktree({
    worktreePath: task.worktreePath,
    editorSetting,
  });
  if (result.warning) {
    dbg.ipc('Editor close warning for task %s: %s', task.id, result.warning);
    return result.warning;
  }

  if (result.attempted) {
    dbg.ipc('Closed editor windows for task %s worktree', task.id);
  }

  return undefined;
}
