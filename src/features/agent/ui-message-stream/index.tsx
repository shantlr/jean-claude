import {
  memo,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
} from 'react';

import type {
  AgentQuestion,
  PermissionResponse,
  QuestionResponse,
  QueuedPrompt,
} from '@shared/agent-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from '@shared/normalized-message-v2';
import type { InteractionMode } from '@shared/types';

import { PermissionBar } from '../ui-permission-bar';
import { QuestionOptions } from '../ui-question-options';

import { GameOfLife } from './game-of-life';
import { mergeSkillMessages } from './message-merger';
import { QueuedPromptEntry } from './ui-queued-prompt-entry';
import { SkillEntry } from './ui-skill-entry';
import { SubagentEntry } from './ui-subagent-entry';
import { TimelineEntry, CompactingEntry } from './ui-timeline-entry';
import { TimelinePromptNavigator } from './ui-timeline-prompt-navigator';
import { computePromptIndexMap } from './use-prompt-navigation';

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export interface PermissionBannerProps {
  request: NormalizedPermissionRequest & { taskId: string };
  onRespond: (requestId: string, response: PermissionResponse) => void;
  onAllowForSession?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProject?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProjectWorktrees?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onSetMode?: (mode: InteractionMode) => void;
  worktreePath?: string | null;
}

export interface QuestionBannerProps {
  request: {
    taskId: string;
    requestId: string;
    questions: AgentQuestion[];
  };
  onRespond: (requestId: string, response: QuestionResponse) => void;
}

export const MessageStream = memo(function MessageStream({
  messages,
  isRunning,
  queuedPrompts = [],
  onFilePathClick,
  onCancelQueuedPrompt,
  bottomPadding = 0,
  pendingPermission,
  pendingQuestion,
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
  /** Permission request to render inline at the bottom of the stream */
  pendingPermission?: PermissionBannerProps | null;
  /** Question request to render inline at the bottom of the stream */
  pendingQuestion?: QuestionBannerProps | null;
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

  // Derive a boolean so the effect only fires when a banner appears/disappears
  const hasPendingBanner = !!pendingPermission || !!pendingQuestion;

  // Auto-scroll to bottom when new messages arrive, prompts are queued,
  // or a permission/question banner appears — but only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [displayMessages.length, queuedPrompts.length, hasPendingBanner]);

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
              <div className="flex items-center gap-2.5">
                <GameOfLife />
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
        {/* Permission request (in-stream banner) */}
        {pendingPermission && (
          <div className="my-2 mr-3 ml-2 overflow-hidden rounded-lg">
            <PermissionBar
              request={pendingPermission.request}
              onRespond={pendingPermission.onRespond}
              onAllowForSession={pendingPermission.onAllowForSession}
              onAllowForProject={pendingPermission.onAllowForProject}
              onAllowForProjectWorktrees={
                pendingPermission.onAllowForProjectWorktrees
              }
              onSetMode={pendingPermission.onSetMode}
              worktreePath={pendingPermission.worktreePath}
            />
          </div>
        )}
        {/* Question (in-stream banner) */}
        {pendingQuestion && (
          <div className="my-2 mr-3 ml-2 overflow-hidden rounded-lg">
            <QuestionOptions
              request={pendingQuestion.request}
              onRespond={pendingQuestion.onRespond}
            />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
