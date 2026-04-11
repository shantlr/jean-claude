import type { MouseEvent } from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import type { ToolUseByName } from '@shared/normalized-message-v2';
import type { InteractionMode } from '@shared/types';

import { AddPermissionModal } from '../ui-add-permission-modal';
import { PermissionBar } from '../ui-permission-bar';
import { QuestionOptions } from '../ui-question-options';

import { mergeSkillMessages } from './message-merger';
import { computePromptAndResultDurations } from './prompt-duration';
import {
  addBashToPermissionsItem,
  showRawMessageItem,
  useMessageContextMenu,
} from './ui-message-context-menu';
import type { ContextMenuItem } from './ui-message-context-menu';
import { QueuedPromptEntry } from './ui-queued-prompt-entry';
import { SkillEntry } from './ui-skill-entry';
import { SubagentEntry } from './ui-subagent-entry';
import { TimelineEntry, CompactingEntry } from './ui-timeline-entry';
import { TimelinePromptNavigator } from './ui-timeline-prompt-navigator';
import { computePromptIndexMap } from './use-prompt-navigation';
import { WorkingIndicator } from './working-indicator';

// Threshold in pixels - if user is within this distance from bottom, auto-scroll
const SCROLL_THRESHOLD = 10;

export interface PermissionBannerProps {
  request: NormalizedPermissionRequest & { taskId: string };
  onRespond: (
    requestId: string,
    response: PermissionResponse,
  ) => void | Promise<void>;
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
  onAllowGlobally?: (toolName: string, input: Record<string, unknown>) => void;
  onSetMode?: (mode: InteractionMode) => void;
  worktreePath?: string | null;
}

export interface QuestionBannerProps {
  request: {
    taskId: string;
    requestId: string;
    questions: AgentQuestion[];
  };
  onRespond: (
    requestId: string,
    response: QuestionResponse,
  ) => void | Promise<void>;
}

export const MessageStream = memo(function MessageStream({
  messages,
  isRunning,
  queuedPrompts = [],
  onFilePathClick,
  onToolDiffClick,
  onCancelQueuedPrompt,
  onShowRawMessage,
  bottomPadding = 0,
  pendingPermission,
  pendingQuestion,
  taskId,
  hasWorktree,
}: {
  messages: NormalizedEntry[];
  isRunning?: boolean;
  queuedPrompts?: QueuedPrompt[];
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onToolDiffClick?: (
    filePath: string,
    oldString: string,
    newString: string,
  ) => void;
  onCancelQueuedPrompt?: (promptId: string) => void;
  /** Callback when user wants to see a message's raw data in the debug pane */
  onShowRawMessage?: (entryId: string) => void;
  /** Extra bottom padding (px) so content can scroll behind a floating footer */
  bottomPadding?: number;
  /** Permission request to render inline at the bottom of the stream */
  pendingPermission?: PermissionBannerProps | null;
  /** Question request to render inline at the bottom of the stream */
  pendingQuestion?: QuestionBannerProps | null;
  /** Task ID for permission management */
  taskId?: string;
  /** Whether the task has a worktree */
  hasWorktree?: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Single modal state for "Add to permissions" — hoisted here so only one instance exists
  const [permissionModal, setPermissionModal] = useState<{
    command: string;
  } | null>(null);

  const handleAddBashToPermissions = useCallback(
    (command: string) => {
      if (!taskId) return;
      setPermissionModal({ command });
    },
    [taskId],
  );

  const closePermissionModal = useCallback(() => {
    setPermissionModal(null);
  }, []);

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

  const { promptDurationMsByPromptIndex, resultDurationMsByEntryId } = useMemo(
    () => computePromptAndResultDurations(displayMessages),
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

  const { openMenu: openContextMenu, portal: contextMenuPortal } =
    useMessageContextMenu();

  // Build context menu items for a display message
  const buildContextMenuItems = useCallback(
    (displayMessage: (typeof displayMessages)[number]): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      // "Add to permissions" for bash tool entries
      if (
        taskId &&
        displayMessage.kind === 'entry' &&
        displayMessage.entry.type === 'tool-use' &&
        displayMessage.entry.name === 'bash'
      ) {
        const command = (displayMessage.entry as ToolUseByName<'bash'>).input
          .command;
        items.push(
          addBashToPermissionsItem(handleAddBashToPermissions, command),
        );
      }

      // "Show in Raw Messages" for all entries
      if (onShowRawMessage) {
        let entryId: string | null = null;
        if (displayMessage.kind === 'entry') entryId = displayMessage.entry.id;
        else if (displayMessage.kind === 'skill')
          entryId = displayMessage.skillToolUse.toolId;
        else if (displayMessage.kind === 'subagent')
          entryId = displayMessage.toolUse.toolId;

        if (entryId) {
          items.push(showRawMessageItem(onShowRawMessage, entryId));
        }
      }

      return items;
    },
    [taskId, onShowRawMessage, handleAddBashToPermissions],
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent, displayMessage: (typeof displayMessages)[number]) => {
      const items = buildContextMenuItems(displayMessage);
      openContextMenu(e, items);
    },
    [buildContextMenuItems, openContextMenu],
  );

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
      {contextMenuPortal}
      <TimelinePromptNavigator
        scrollContainerRef={scrollContainerRef}
        displayMessages={displayMessages}
        promptDurationMsByPromptIndex={promptDurationMsByPromptIndex}
      />
      {/* Timeline vertical line */}
      <div className="timeline-gradient-line relative ml-3">
        {displayMessages.map((displayMessage, index) => {
          if (displayMessage.kind === 'skill') {
            const promptIdx = promptIndexMap.get(index);
            return (
              <div
                key={index}
                onContextMenu={(e) => handleContextMenu(e, displayMessage)}
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
              <div
                key={index}
                onContextMenu={(e) => handleContextMenu(e, displayMessage)}
              >
                <SubagentEntry
                  toolUse={displayMessage.toolUse}
                  childEntries={displayMessage.childEntries}
                  onFilePathClick={onFilePathClick}
                  onToolDiffClick={onToolDiffClick}
                />
              </div>
            );
          }
          const promptIdx = promptIndexMap.get(index);
          if (promptIdx !== undefined) {
            return (
              <div
                key={index}
                data-prompt-index={promptIdx}
                onContextMenu={(e) => handleContextMenu(e, displayMessage)}
              >
                <TimelineEntry
                  entry={displayMessage.entry}
                  resultDurationMs={resultDurationMsByEntryId.get(
                    displayMessage.entry.id,
                  )}
                  onFilePathClick={onFilePathClick}
                  onToolDiffClick={onToolDiffClick}
                />
              </div>
            );
          }
          return (
            <div
              key={index}
              onContextMenu={(e) => handleContextMenu(e, displayMessage)}
            >
              <TimelineEntry
                entry={displayMessage.entry}
                resultDurationMs={resultDurationMsByEntryId.get(
                  displayMessage.entry.id,
                )}
                onFilePathClick={onFilePathClick}
                onToolDiffClick={onToolDiffClick}
              />
            </div>
          );
        })}
        {isRunning && (
          <div className="relative pl-6">
            <div className="absolute top-2.5 -left-1 flex h-2 w-2 items-center justify-center">
              <span className="animate-timeline-working-ping absolute h-3 w-3 rounded-full bg-sky-400/20" />
              <span className="animate-timeline-working-core h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_5px_theme(colors.sky.400/35)]" />
            </div>
            <div className="py-1.5 pr-3">
              <WorkingIndicator />
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
              onAllowGlobally={pendingPermission.onAllowGlobally}
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
      {/* Single hoisted modal for "Add to permissions" */}
      {taskId && permissionModal && (
        <AddPermissionModal
          isOpen
          onClose={closePermissionModal}
          command={permissionModal.command}
          taskId={taskId}
          hasWorktree={hasWorktree ?? false}
        />
      )}
    </div>
  );
});
