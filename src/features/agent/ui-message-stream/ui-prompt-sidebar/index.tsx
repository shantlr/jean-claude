import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { DisplayMessage } from '../message-merger';
import { usePromptNavigation } from '../use-prompt-navigation';

function ChipTooltip({
  text,
  triggerRef,
}: {
  text: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }, [triggerRef]);

  if (!pos) return null;

  return createPortal(
    <div
      role="tooltip"
      className="border-glass-border bg-bg-1 text-ink-1 pointer-events-none fixed z-50 max-w-64 rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
    >
      <div className="[display:-webkit-box] overflow-hidden leading-relaxed break-words [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
        {text}
      </div>
    </div>,
    document.body,
  );
}

function PromptChip({
  prompt,
  isCompleted,
  isCurrent,
  isFuture,
  onNavigate,
}: {
  prompt: { index: number; text: string };
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  onNavigate: (index: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onNavigate(prompt.index)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-xs font-medium transition-all ${
          isCompleted
            ? 'bg-acc/15 text-acc-ink border-acc/25 hover:bg-acc/25 border'
            : isCurrent
              ? 'bg-acc text-white shadow-[0_0_12px_oklch(0.7_0.18_295_/_0.4)]'
              : isFuture
                ? 'border border-dashed border-white/20 text-white/40 hover:border-white/35'
                : ''
        }`}
      >
        {prompt.index + 1}
      </button>
      {hovered && <ChipTooltip text={prompt.text} triggerRef={buttonRef} />}
    </div>
  );
}

export function PromptSidebar({
  scrollContainerRef,
  displayMessages,
  bottomPadding = 0,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  displayMessages: DisplayMessage[];
  bottomPadding?: number;
}) {
  const prompts = useMemo(() => {
    const items: Array<{ index: number; text: string }> = [];
    let promptIndex = 0;

    for (const message of displayMessages) {
      if (message.kind === 'entry' && message.entry.type === 'user-prompt') {
        const text = message.entry.value.trim();
        if (!text) continue;
        items.push({ index: promptIndex, text });
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
        items.push({ index: promptIndex, text });
        promptIndex++;
      }
    }

    return items;
  }, [displayMessages]);

  const totalPrompts = prompts.length;

  const { currentIndex, goToPrompt } = usePromptNavigation({
    scrollContainerRef,
    totalPrompts,
  });

  const handleNavigate = (index: number) =>
    goToPrompt(index, { behavior: 'instant' });

  // Auto-scroll the sidebar to keep the current prompt chip visible
  const chipRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    const el = chipRefs.current.get(currentIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  if (totalPrompts === 0) return null;

  return (
    <div
      className="no-scrollbar flex shrink-0 flex-col items-center gap-0 overflow-y-auto py-4 pr-0.5 pl-1.5"
      style={
        bottomPadding > 0 ? { marginBottom: bottomPadding + 8 } : undefined
      }
    >
      {prompts.map((prompt) => {
        const isCompleted = prompt.index < currentIndex;
        const isCurrent = prompt.index === currentIndex;
        const isFuture = prompt.index > currentIndex;

        return (
          <div
            key={prompt.index}
            className="flex flex-col items-center"
            ref={(node) => {
              if (node) {
                chipRefs.current.set(prompt.index, node);
              } else {
                chipRefs.current.delete(prompt.index);
              }
            }}
          >
            {/* Connector line above (except first) */}
            {prompt.index > 0 && (
              <div
                className={`h-3 w-px ${
                  prompt.index <= currentIndex
                    ? 'bg-acc/40'
                    : 'border-l border-dashed border-white/15'
                }`}
              />
            )}

            <PromptChip
              prompt={prompt}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isFuture={isFuture}
              onNavigate={handleNavigate}
            />
          </div>
        );
      })}
    </div>
  );
}
