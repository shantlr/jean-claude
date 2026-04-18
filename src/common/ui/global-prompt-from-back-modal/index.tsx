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
    <div className="bg-bg-0/50 fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-bg-1 w-full max-w-md rounded-lg shadow-xl">
        {/* Header */}
        <div className="border-glass-border flex items-center gap-3 border-b px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden />
          </div>
          <h2 className="text-ink-0 flex-1 text-lg font-semibold">
            {currentPrompt.title}
          </h2>
          <button
            onClick={() => handleResponse(false)}
            aria-label="Close dialog"
            className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-ink-1 text-sm">{currentPrompt.message}</p>

          {currentPrompt.details && (
            <div className="bg-bg-0 mt-3 rounded-md p-3">
              <pre className="text-ink-2 font-mono text-xs break-all whitespace-pre-wrap">
                {currentPrompt.details}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-glass-border flex justify-end gap-3 border-t px-4 py-3">
          <button
            onClick={() => handleResponse(false)}
            className="text-ink-1 hover:bg-glass-medium flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
          >
            {currentPrompt.rejectLabel ?? 'Cancel'}
            <Kbd shortcut="escape" className="text-[9px]" />
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="bg-acc text-ink-0 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {currentPrompt.acceptLabel ?? 'Accept'}
            <Kbd shortcut="cmd+enter" className="text-[9px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
