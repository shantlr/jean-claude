import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
import { api } from '@/lib/api';
import type { GlobalPrompt } from '@shared/global-prompt-types';

export function GlobalPromptFromBackModal() {
  const [promptQueue, setPromptQueue] = useState<GlobalPrompt[]>([]);
  const id = useId();

  useEffect(() => {
    const unsubscribe = api.globalPrompt.onShow((prompt) => {
      setPromptQueue((queue) => [...queue, prompt]);
    });
    return unsubscribe;
  }, []);

  const currentPrompt = promptQueue[0] ?? null;

  const handleResponse = useCallback(
    (accepted: boolean) => {
      if (currentPrompt) {
        api.globalPrompt.respond({ id: currentPrompt.id, accepted });
        setPromptQueue((queue) => queue.slice(1));
      }
    },
    [currentPrompt],
  );

  useRegisterKeyboardBindings(
    `global-prompt-modal-${id}`,
    currentPrompt
      ? {
          escape: () => {
            handleResponse(false);
            return true;
          },
          'cmd+enter': () => {
            handleResponse(true);
            return true;
          },
        }
      : {},
  );

  if (!currentPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden />
          </div>
          <h2 className="flex-1 text-lg font-semibold text-neutral-100">
            {currentPrompt.title}
          </h2>
          <button
            onClick={() => handleResponse(false)}
            aria-label="Close dialog"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-neutral-300">{currentPrompt.message}</p>

          {currentPrompt.details && (
            <div className="mt-3 rounded-md bg-neutral-900 p-3">
              <pre className="font-mono text-xs break-all whitespace-pre-wrap text-neutral-400">
                {currentPrompt.details}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={() => handleResponse(false)}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {currentPrompt.rejectLabel ?? 'Cancel'}
            <Kbd shortcut="escape" className="text-[9px]" />
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {currentPrompt.acceptLabel ?? 'Accept'}
            <Kbd shortcut="cmd+enter" className="text-[9px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
