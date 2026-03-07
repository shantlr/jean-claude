import { Loader2 } from 'lucide-react';
import {
  memo,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
} from 'react';

import type { QueuedPrompt } from '@shared/agent-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';

import { mergeSkillMessages } from './message-merger';
import { QueuedPromptEntry } from './ui-queued-prompt-entry';
import { SkillEntry } from './ui-skill-entry';
import { SubagentEntry } from './ui-subagent-entry';
import { TimelineEntry, CompactingEntry } from './ui-timeline-entry';
import { TimelinePromptNavigator } from './ui-timeline-prompt-navigator';
import { computePromptIndexMap } from './use-prompt-navigation';

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export const MessageStream = memo(function MessageStream({
  messages,
  isRunning,
  queuedPrompts = [],
  onFilePathClick,
  onCancelQueuedPrompt,
  bottomPadding = 0,
}: {
  messages: NormalizedEntry[];
  isRunning?: boolean;
  queuedPrompts?: QueuedPrompt[];
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onCancelQueuedPrompt?: (promptId: string) => void;
  /** Extra bottom padding (px) so content can scroll behind a floating footer */
  bottomPadding?: number;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Merge skill messages for display
  const displayMessages = useMemo(
    () => mergeSkillMessages(messages),
    [messages],
  );

  // Prompt index map for data-prompt-index attributes (used by navigator's scroll tracking)
  const promptIndexMap = useMemo(
    () => computePromptIndexMap(displayMessages),
    [displayMessages],
  );

  // Check if scroll position is near bottom
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= SCROLL_THRESHOLD;
  }, []);

  // Update near-bottom state on scroll
  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
  }, [checkIfNearBottom]);

  // Initial scroll to bottom
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    isNearBottomRef.current = true;
  }, []);

  // Auto-scroll to bottom when new messages arrive or prompts are queued, but only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [displayMessages.length, queuedPrompts.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        <p>Agent session will appear here</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <TimelinePromptNavigator
        scrollContainerRef={scrollContainerRef}
        displayMessages={displayMessages}
      />
      {/* Timeline vertical line */}
      <div className="timeline-gradient-line relative ml-3">
        {displayMessages.map((displayMessage, index) => {
          if (displayMessage.kind === 'skill') {
            const promptIdx = promptIndexMap.get(index);
            return (
              <div
                key={index}
                {...(promptIdx !== undefined
                  ? { 'data-prompt-index': promptIdx }
                  : {})}
              >
                <SkillEntry
                  skillToolUse={displayMessage.skillToolUse}
                  promptEntry={displayMessage.promptEntry}
                  onFilePathClick={onFilePathClick}
                />
              </div>
            );
          }
          if (displayMessage.kind === 'compacting') {
            return (
              <CompactingEntry
                key={index}
                isComplete={!!displayMessage.endEntry}
              />
            );
          }
          if (displayMessage.kind === 'subagent') {
            return (
              <SubagentEntry
                key={index}
                toolUse={displayMessage.toolUse}
                childEntries={displayMessage.childEntries}
                onFilePathClick={onFilePathClick}
              />
            );
          }
          const promptIdx = promptIndexMap.get(index);
          if (promptIdx !== undefined) {
            return (
              <div key={index} data-prompt-index={promptIdx}>
                <TimelineEntry
                  entry={displayMessage.entry}
                  onFilePathClick={onFilePathClick}
                />
              </div>
            );
          }
          return (
            <TimelineEntry
              key={index}
              entry={displayMessage.entry}
              onFilePathClick={onFilePathClick}
            />
          );
        })}
        {isRunning && (
          <div className="relative pl-6">
            <div className="absolute top-2.5 -left-1 flex h-2 w-2 items-center justify-center">
              <span className="animate-timeline-working-ping absolute h-3 w-3 rounded-full bg-sky-400/20" />
              <span className="animate-timeline-working-core h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_5px_theme(colors.sky.400/35)]" />
            </div>
            <div className="py-1.5 pr-3">
              <div className="flex items-center gap-2">
                <Loader2
                  className="h-3 w-3 shrink-0 animate-spin text-sky-400/90"
                  aria-hidden
                />
                <span className="text-xs font-medium text-neutral-400">
                  Working
                </span>
                <span className="flex items-center gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="animate-timeline-working-dot h-1 w-1 rounded-full bg-sky-300/70"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Queued prompts */}
        {queuedPrompts.map((prompt) => (
          <QueuedPromptEntry
            key={prompt.id}
            prompt={prompt}
            onCancel={onCancelQueuedPrompt ?? (() => {})}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
