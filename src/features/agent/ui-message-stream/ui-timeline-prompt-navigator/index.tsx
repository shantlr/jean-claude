import type { RefObject } from 'react';
import { useMemo } from 'react';

import type { DisplayMessage } from '../message-merger';
import { usePromptNavigation } from '../use-prompt-navigation';

export function TimelinePromptNavigator({
  scrollContainerRef,
  displayMessages,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  displayMessages: DisplayMessage[];
}) {
  const prompts = useMemo(() => {
    const promptItems: Array<{ index: number; text: string }> = [];
    let promptIndex = 0;

    for (const message of displayMessages) {
      if (message.kind === 'entry' && message.entry.type === 'user-prompt') {
        const text = message.entry.value.trim();
        if (!text) continue;
        promptItems.push({ index: promptIndex, text });
        promptIndex++;
        continue;
      }

      if (message.kind === 'skill') {
        const skillPrompt =
          message.promptEntry?.type === 'user-prompt'
            ? message.promptEntry.value.trim()
            : '';
        const text =
          skillPrompt ||
          `Use skill ${
            'skillName' in message.skillToolUse
              ? message.skillToolUse.skillName
              : 'unknown'
          }`;
        promptItems.push({ index: promptIndex, text });
        promptIndex++;
      }
    }

    return promptItems;
  }, [displayMessages]);

  const totalPrompts = prompts.length;

  const { currentIndex, goToPrompt } = usePromptNavigation({
    scrollContainerRef,
    totalPrompts,
  });

  if (totalPrompts === 0) return null;

  const currentPrompt = prompts[currentIndex];
  const previousPrompts = prompts.slice(
    Math.max(0, currentIndex - 2),
    currentIndex,
  );

  return (
    <>
      <div className="pointer-events-none sticky top-0 z-20 mb-2 ml-6 flex justify-end pt-1 pr-3">
        <div className="pointer-events-auto flex max-w-[min(56rem,calc(100%-2rem))] flex-col items-end gap-1">
          {previousPrompts.map((prompt) => (
            <button
              key={prompt.index}
              type="button"
              onClick={() => {
                goToPrompt(prompt.index, { behavior: 'instant' });
              }}
              className="w-full min-w-0 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1 text-left text-xs text-neutral-300 opacity-90 transition-colors hover:border-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
              title="Jump to previous prompt"
            >
              <span className="[display:-webkit-box] overflow-hidden break-words [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {prompt.text}
              </span>
            </button>
          ))}
          {currentPrompt && (
            <button
              type="button"
              onClick={() => {
                goToPrompt(currentPrompt.index, { behavior: 'instant' });
              }}
              className="w-full min-w-0 rounded-lg border border-neutral-500 bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-100 shadow-md"
              title="Align current prompt"
            >
              <span className="inline-flex w-full min-w-0 items-start gap-2">
                <span className="shrink-0 text-[10px] leading-4 text-neutral-400">
                  {currentIndex + 1}/{totalPrompts}
                </span>
                <span className="[display:-webkit-box] min-w-0 overflow-hidden leading-4 break-words [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {currentPrompt.text}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
