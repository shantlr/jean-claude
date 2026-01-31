import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

import type { GlobalPrompt } from '../../../../shared/global-prompt-types';

export function GlobalPromptModal() {
  const [promptQueue, setPromptQueue] = useState<GlobalPrompt[]>([]);

  useEffect(() => {
    const unsubscribe = api.globalPrompt.onShow((prompt) => {
      setPromptQueue((queue) => [...queue, prompt]);
    });
    return unsubscribe;
  }, []);

  const currentPrompt = promptQueue[0] ?? null;

  const handleResponse = (accepted: boolean) => {
    if (currentPrompt) {
      api.globalPrompt.respond({ id: currentPrompt.id, accepted });
      setPromptQueue((queue) => queue.slice(1));
    }
  };

  if (!currentPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </div>
          <h2 className="flex-1 text-lg font-semibold text-neutral-100">
            {currentPrompt.title}
          </h2>
          <button
            onClick={() => handleResponse(false)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-neutral-300">{currentPrompt.message}</p>

          {currentPrompt.details && (
            <div className="mt-3 rounded-md bg-neutral-900 p-3">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-neutral-400">
                {currentPrompt.details}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={() => handleResponse(false)}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {currentPrompt.rejectLabel ?? 'Cancel'}
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {currentPrompt.acceptLabel ?? 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
