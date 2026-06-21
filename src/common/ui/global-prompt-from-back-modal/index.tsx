import { AlertTriangle, KeyRound, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { api } from '@/lib/api';
import type { GlobalPrompt } from '@shared/global-prompt-types';
import { Kbd } from '@/common/ui/kbd';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';


export function GlobalPromptFromBackModal() {
  const [promptQueue, setPromptQueue] = useState<GlobalPrompt[]>([]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const unsubscribe = api.globalPrompt.onShow((prompt) => {
      setPromptQueue((queue) => [...queue, prompt]);
    });
    return unsubscribe;
  }, []);

  const currentPrompt = promptQueue[0] ?? null;
  const hasInput = !!currentPrompt?.inputType;

  // Auto-focus input when a prompt with input appears
  useEffect(() => {
    if (hasInput) {
      // Use a small delay to ensure the input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [hasInput, currentPrompt?.id]);

  const handleResponse = useCallback(
    (accepted: boolean) => {
      if (currentPrompt) {
        api.globalPrompt.respond({
          id: currentPrompt.id,
          accepted,
          ...(currentPrompt.inputType ? { inputValue } : {}),
        });
        setInputValue('');
        setPromptQueue((queue) => queue.slice(1));
      }
    },
    [currentPrompt, inputValue],
  );

  useRegisterKeyboardBindings(
    `global-prompt-modal-${id}`,
    currentPrompt
      ? {
          escape: () => {
            handleResponse(false);
            return true;
          },
          // Only bind cmd+enter for non-input prompts (input prompts use form submit via Enter)
          ...(hasInput
            ? {}
            : {
                'cmd+enter': () => {
                  handleResponse(true);
                  return true;
                },
              }),
        }
      : {},
  );

  if (!currentPrompt) return null;

  const IconComponent = hasInput ? KeyRound : AlertTriangle;
  const iconColorClass = hasInput ? 'text-blue-500' : 'text-yellow-500';
  const iconBgClass = hasInput ? 'bg-blue-500/20' : 'bg-yellow-500/20';
  const defaultAcceptLabel = hasInput ? 'Submit' : 'Accept';

  return (
    <div className="bg-bg-0/50 fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-bg-1 w-full max-w-md rounded-lg shadow-xl">
        {/* Header */}
        <div className="border-glass-border flex items-center gap-3 border-b px-4 py-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${iconBgClass}`}
          >
            <IconComponent
              className={`h-4 w-4 ${iconColorClass}`}
              aria-hidden
            />
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

          {hasInput && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResponse(true);
              }}
              className="mt-3"
            >
              <input
                ref={inputRef}
                type={currentPrompt.inputType}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentPrompt.inputPlaceholder}
                className="bg-bg-0 border-glass-border text-ink-0 w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </form>
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
            {currentPrompt.acceptLabel ?? defaultAcceptLabel}
            {!hasInput && <Kbd shortcut="cmd+enter" className="text-[9px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
