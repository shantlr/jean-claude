import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RefObject } from 'react';
import { useMemo, useState } from 'react';

import { formatDuration } from '@/lib/time';
import { useUISetting } from '@/stores/ui';

import type { DisplayMessage } from '../message-merger';
import { usePromptNavigation } from '../use-prompt-navigation';

export function TimelinePromptNavigator({
  scrollContainerRef,
  displayMessages,
  promptDurationMsByPromptIndex,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  displayMessages: DisplayMessage[];
  promptDurationMsByPromptIndex: Map<number, number>;
}) {
  const defaultCollapsed = useUISetting('promptNavigatorDefaultCollapsed');
  const maxWidth = useUISetting('promptNavigatorMaxWidth');
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
  const visibleIndices = new Set<number>([
    0,
    totalPrompts - 1,
    currentIndex,
    currentIndex - 1,
    currentIndex - 2,
  ]);

  const sortedVisibleIndices = [...visibleIndices]
    .filter((index) => index >= 0 && index < totalPrompts)
    .sort((a, b) => a - b);

  const items = [] as Array<
    | { type: 'prompt'; prompt: { index: number; text: string } }
    | { type: 'ellipsis'; id: string }
  >;

  for (let i = 0; i < sortedVisibleIndices.length; i++) {
    const promptIndex = sortedVisibleIndices[i];
    const previousPromptIndex = sortedVisibleIndices[i - 1];

    if (
      i > 0 &&
      previousPromptIndex !== undefined &&
      promptIndex - previousPromptIndex > 1
    ) {
      items.push({
        type: 'ellipsis',
        id: `gap-${previousPromptIndex}-${promptIndex}`,
      });
    }

    const prompt = prompts[promptIndex];
    if (prompt) {
      items.push({ type: 'prompt', prompt });
    }
  }

  return (
    <div className="pointer-events-none sticky top-0 z-20 mb-2 ml-6 flex justify-end pt-1 pr-3">
      <div
        className="pointer-events-auto flex min-w-[12rem] flex-col items-end gap-1"
        style={{ maxWidth: `min(${maxWidth}%, 56rem)` }}
      >
        {/* Collapse/Expand toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="border-glass-border bg-bg-1 text-ink-2 hover:border-glass-border-strong hover:bg-glass-medium hover:text-ink-1 flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] opacity-90 transition-colors"
          title={
            collapsed ? 'Expand prompt navigator' : 'Collapse prompt navigator'
          }
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>
                {currentPrompt
                  ? `${currentPrompt.index + 1}/${totalPrompts}`
                  : `${totalPrompts} prompts`}
              </span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* Prompt pills */}
        {!collapsed &&
          items.map((item) => {
            if (item.type === 'ellipsis') {
              return (
                <div
                  key={item.id}
                  className="text-ink-3 w-full text-center text-xs leading-4"
                >
                  ...
                </div>
              );
            }

            const isCurrent = item.prompt.index === currentPrompt?.index;
            const promptDurationMs = promptDurationMsByPromptIndex.get(
              item.prompt.index,
            );
            return (
              <button
                key={item.prompt.index}
                type="button"
                onClick={() => {
                  goToPrompt(item.prompt.index, { behavior: 'instant' });
                }}
                className={
                  isCurrent
                    ? 'border-glass-border-strong bg-bg-0 text-ink-0 w-full min-w-0 rounded-lg border px-3 py-1.5 text-left text-xs shadow-md'
                    : 'border-glass-border bg-bg-1 text-ink-1 hover:text-ink-1 hover:border-glass-border-strong hover:bg-glass-medium w-full min-w-0 rounded-lg border px-3 py-1 text-left text-xs opacity-90 transition-colors'
                }
                title={isCurrent ? 'Align current prompt' : 'Jump to prompt'}
              >
                <span className="inline-flex w-full min-w-0 items-start gap-2">
                  <span className="text-ink-2 shrink-0 text-[10px] leading-4">
                    {item.prompt.index + 1}/{totalPrompts}
                  </span>
                  {promptDurationMs !== undefined && (
                    <span className="text-ink-3 shrink-0 text-[10px] leading-4">
                      {formatDuration(promptDurationMs)}
                    </span>
                  )}
                  <span className="[display:-webkit-box] min-w-0 overflow-hidden leading-4 break-words [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {item.prompt.text}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
