import { randomUUID } from 'crypto';

import { BrowserWindow } from 'electron';

import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '../../shared/global-prompt-types';

const pendingPrompts = new Map<string, (accepted: boolean) => void>();

export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'>
): Promise<boolean> {
  const id = randomUUID();
  const fullPrompt: GlobalPrompt = { ...prompt, id };

  return new Promise((resolve) => {
    pendingPrompts.set(id, resolve);

    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send('globalPrompt:show', fullPrompt);
  });
}

export function handlePromptResponse(response: GlobalPromptResponse): void {
  const resolve = pendingPrompts.get(response.id);
  if (resolve) {
    pendingPrompts.delete(response.id);
    resolve(response.accepted);
  }
}
