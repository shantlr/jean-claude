import { randomUUID } from 'crypto';

import { BrowserWindow } from 'electron';

import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';

const pendingPrompts = new Map<
  string,
  (response: { accepted: boolean; inputValue?: string }) => void
>();

export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'>,
): Promise<boolean>;
// eslint-disable-next-line no-redeclare
export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'> & { inputType: 'text' | 'password' },
): Promise<{ accepted: boolean; inputValue?: string }>;
// eslint-disable-next-line no-redeclare
export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'>,
): Promise<boolean | { accepted: boolean; inputValue?: string }> {
  const id = randomUUID();
  const fullPrompt: GlobalPrompt = { ...prompt, id };

  return new Promise((resolve) => {
    pendingPrompts.set(id, (response) => {
      if (prompt.inputType) {
        resolve(response);
      } else {
        resolve(response.accepted);
      }
    });

    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send('globalPrompt:show', fullPrompt);
  });
}

export function handlePromptResponse(response: GlobalPromptResponse): void {
  const resolve = pendingPrompts.get(response.id);
  if (resolve) {
    pendingPrompts.delete(response.id);
    resolve({ accepted: response.accepted, inputValue: response.inputValue });
  }
}
