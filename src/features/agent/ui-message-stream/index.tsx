import type { MouseEvent } from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  NormalizedToolUse,
} from '@shared/normalized-message-v2';
import type { ToolUseByName } from '@shared/normalized-message-v2';
import type { InteractionMode } from '@shared/types';

import { PermissionBar } from '../ui-permission-bar';
import { QuestionOptions } from '../ui-question-options';

import { groupByPrompts, mergeSkillMessages } from './message-merger';
import type { StreamMessage } from './message-merger';
import {
  addBashToPermissionsItem,
  copyToClipboardItem,
  showRawMessageItem,
  useMessageContextMenu,
} from './ui-message-context-menu';
import type { ContextMenuItem } from './ui-message-context-menu';
import { PromptGroupEntry } from './ui-prompt-group-entry';
import { PromptSidebar } from './ui-prompt-sidebar';
import { QueuedPromptEntry } from './ui-queued-prompt-entry';
import { SkillEntry } from './ui-skill-entry';
import { SubagentEntry } from './ui-subagent-entry';
import { TimelineEntry, CompactingEntry } from './ui-timeline-entry';

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
  onUpdateQueuedPrompt,
  onShowRawMessage,
  bottomPadding = 0,
  pendingPermission,
  pendingQuestion,
  onAddBashToPermissions,
  rootPath,
  taskId,
  stepId,
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
  onUpdateQueuedPrompt?: (promptId: string, content: string) => void;
  /** Callback when user wants to see a message's raw data in the debug pane */
  onShowRawMessage?: (entryId: string) => void;
  /** Extra bottom padding (px) so content can scroll behind a floating footer */
  bottomPadding?: number;
  /** Permission request to render inline at the bottom of the stream */
  pendingPermission?: PermissionBannerProps | null;
  /** Question request to render inline at the bottom of the stream */
  pendingQuestion?: QuestionBannerProps | null;
  /** Callback to open the "Add to permissions" modal (state managed by parent) */
  onAddBashToPermissions?: (command: string) => void;
  /** Root path (worktree or project) used to relativize file paths in diff modals */
  rootPath?: string | null;
  /** Task ID for comment anchoring in assistant messages */
  taskId?: string;
  /** Active step ID so task/step switches can reset scroll position */
  stepId?: string | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Merge skill messages, then group by prompts
  const displayMessages = useMemo(
    () => mergeSkillMessages(messages),
    [messages],
  );

  const streamMessages = useMemo(
    () => groupByPrompts(displayMessages, isRunning),
    [displayMessages, isRunning],
  );

  // Prompt index map for data-prompt-index attributes (used by navigator's scroll tracking)
  // Now computed from streamMessages — prompt groups count as prompts
  // Also track the last prompt group index so we can auto-collapse previous ones
  const { promptIndexMap, lastPromptGroupIndex } = useMemo(() => {
    const map = new Map<number, number>();
    let counter = 0;
    let lastPgIdx = -1;
    for (let i = 0; i < streamMessages.length; i++) {
      const sm = streamMessages[i];
      if (sm.kind === 'prompt-group') {
        map.set(i, counter);
        counter++;
        lastPgIdx = i;
      } else if (
        (sm.kind === 'entry' &&
          sm.entry.type === 'user-prompt' &&
          sm.entry.value.trim() !== '') ||
        sm.kind === 'skill'
      ) {
        // Standalone prompts (before first group) — unlikely but handle gracefully
        map.set(i, counter);
        counter++;
      }
    }
    return { promptIndexMap: map, lastPromptGroupIndex: lastPgIdx };
  }, [streamMessages]);

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

  // Reset scroll to bottom when switching tasks or steps
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    isNearBottomRef.current = true;
  }, [taskId, stepId]);

  // Derive a boolean so the effect only fires when a banner appears/disappears
  const hasPendingBanner = !!pendingPermission || !!pendingQuestion;

  // Auto-scroll to bottom when new messages arrive, prompts are queued,
  // or a permission/question banner appears — but only if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [streamMessages.length, queuedPrompts.length, hasPendingBanner]);

  const { openMenu: openContextMenu, portal: contextMenuPortal } =
    useMessageContextMenu();

  // Build context menu items for a stream message
  const buildContextMenuItems = useCallback(
    (streamMessage: StreamMessage): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      // Prompt groups use their promptEntry id for context menu
      if (streamMessage.kind === 'prompt-group') {
        const copyItem = copyToClipboardItem(streamMessage.promptEntry);
        if (copyItem) items.push(copyItem);
        if (onShowRawMessage) {
          items.push(
            showRawMessageItem(onShowRawMessage, streamMessage.promptEntry.id),
          );
        }
        return items;
      }

      // "Copy to clipboard" for entries with copyable text
      if (streamMessage.kind === 'entry') {
        const copyItem = copyToClipboardItem(streamMessage.entry);
        if (copyItem) items.push(copyItem);
      }

      // "Add to permissions" for bash tool entries
      if (
        onAddBashToPermissions &&
        streamMessage.kind === 'entry' &&
        streamMessage.entry.type === 'tool-use' &&
        streamMessage.entry.name === 'bash'
      ) {
        const command = (streamMessage.entry as ToolUseByName<'bash'>).input
          .command;
        items.push(addBashToPermissionsItem(onAddBashToPermissions, command));
      }

      // "Show in Raw Messages" for all entries
      if (onShowRawMessage) {
        let entryId: string | null = null;
        if (streamMessage.kind === 'entry') entryId = streamMessage.entry.id;
        else if (streamMessage.kind === 'skill')
          entryId = streamMessage.skillToolUse.toolId;
        else if (streamMessage.kind === 'subagent')
          entryId = streamMessage.toolUse.toolId;

        if (entryId) {
          items.push(showRawMessageItem(onShowRawMessage, entryId));
        }
      }

      return items;
    },
    [onAddBashToPermissions, onShowRawMessage],
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent, streamMessage: StreamMessage) => {
      const items = buildContextMenuItems(streamMessage);
      openContextMenu(e, items);
    },
    [buildContextMenuItems, openContextMenu],
  );

  const buildEntryContextMenuItems = useCallback(
    (entry: NormalizedEntry): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      const copyItem = copyToClipboardItem(entry);
      if (copyItem) items.push(copyItem);

      if (
        onAddBashToPermissions &&
        entry.type === 'tool-use' &&
        entry.name === 'bash'
      ) {
        const command = (entry as ToolUseByName<'bash'>).input.command;
        items.push(addBashToPermissionsItem(onAddBashToPermissions, command));
      }

      if (onShowRawMessage && entry.id) {
        items.push(showRawMessageItem(onShowRawMessage, entry.id));
      }

      return items;
    },
    [onAddBashToPermissions, onShowRawMessage],
  );

  const buildToolUseContextMenuItems = useCallback(
    (toolUse: NormalizedToolUse): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      if (onAddBashToPermissions && toolUse.name === 'bash') {
        const command = (toolUse as ToolUseByName<'bash'>).input.command;
        items.push(addBashToPermissionsItem(onAddBashToPermissions, command));
      }

      if (onShowRawMessage && toolUse.toolId) {
        items.push(showRawMessageItem(onShowRawMessage, toolUse.toolId));
      }

      return items;
    },
    [onAddBashToPermissions, onShowRawMessage],
  );

  const handleEntryContextMenu = useCallback(
    (e: MouseEvent, entry: NormalizedEntry) => {
      openContextMenu(e, buildEntryContextMenuItems(entry));
    },
    [buildEntryContextMenuItems, openContextMenu],
  );

  const handleToolUseContextMenu = useCallback(
    (e: MouseEvent, toolUse: NormalizedToolUse) => {
      openContextMenu(e, buildToolUseContextMenuItems(toolUse));
    },
    [buildToolUseContextMenuItems, openContextMenu],
  );

  if (messages.length === 0) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        <p>Agent session will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <PromptSidebar
        scrollContainerRef={scrollContainerRef}
        streamMessages={streamMessages}
        taskId={taskId}
        bottomPadding={bottomPadding}
      />
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-auto"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        {contextMenuPortal}
        <div className="relative">
          {streamMessages.map((streamMessage, index) => {
            // Prompt groups render as collapsible entries
            if (streamMessage.kind === 'prompt-group') {
              const promptIdx = promptIndexMap.get(index);
              const previousPromptDate = (() => {
                for (let i = index - 1; i >= 0; i--) {
                  const previousMessage = streamMessages[i];
                  if (previousMessage?.kind === 'prompt-group') {
                    return previousMessage.promptEntry.date;
                  }
                }
                return undefined;
              })();
              // Show separator before non-first prompt groups
              const showSeparator =
                index > 0 && streamMessages[index - 1]?.kind === 'prompt-group';
              return (
                <div
                  key={index}
                  {...(promptIdx !== undefined
                    ? { 'data-prompt-index': promptIdx }
                    : {})}
                >
                  {showSeparator && (
                    <div
                      className="mx-4 my-1"
                      style={{
                        height: '1px',
                        background:
                          'linear-gradient(to right, transparent, oklch(1 0 0 / 0.12), transparent)',
                      }}
                    />
                  )}
                  <PromptGroupEntry
                    group={streamMessage}
                    isLast={index === lastPromptGroupIndex}
                    isTaskRunning={isRunning}
                    previousPromptDate={previousPromptDate}
                    onFilePathClick={onFilePathClick}
                    onToolDiffClick={onToolDiffClick}
                    onPromptContextMenu={handleEntryContextMenu}
                    onEntryContextMenu={handleEntryContextMenu}
                    onToolUseContextMenu={handleToolUseContextMenu}
                    onResultContextMenu={handleEntryContextMenu}
                    rootPath={rootPath}
                    taskId={taskId}
                  />
                </div>
              );
            }

            // Standalone messages (before first prompt)
            if (streamMessage.kind === 'skill') {
              const promptIdx = promptIndexMap.get(index);
              return (
                <div
                  key={index}
                  onContextMenu={(e) => handleContextMenu(e, streamMessage)}
                  {...(promptIdx !== undefined
                    ? { 'data-prompt-index': promptIdx }
                    : {})}
                >
                  <SkillEntry
                    skillToolUse={streamMessage.skillToolUse}
                    promptEntry={streamMessage.promptEntry}
                    onFilePathClick={onFilePathClick}
                  />
                </div>
              );
            }
            if (streamMessage.kind === 'compacting') {
              return (
                <CompactingEntry
                  key={index}
                  isComplete={!!streamMessage.endEntry}
                />
              );
            }
            if (streamMessage.kind === 'subagent') {
              return (
                <div
                  key={index}
                  onContextMenu={(e) => handleContextMenu(e, streamMessage)}
                >
                  <SubagentEntry
                    toolUse={streamMessage.toolUse}
                    childEntries={streamMessage.childEntries}
                    onFilePathClick={onFilePathClick}
                    onToolDiffClick={onToolDiffClick}
                    onEntryContextMenu={handleEntryContextMenu}
                    taskId={taskId}
                  />
                </div>
              );
            }
            return (
              <div
                key={index}
                onContextMenu={(e) => handleContextMenu(e, streamMessage)}
              >
                <TimelineEntry
                  entry={streamMessage.entry}
                  onFilePathClick={onFilePathClick}
                  onToolDiffClick={onToolDiffClick}
                  taskId={taskId}
                />
              </div>
            );
          })}
          {/* Queued prompts */}
          {queuedPrompts.map((prompt) => (
            <QueuedPromptEntry
              key={prompt.id}
              prompt={prompt}
              onCancel={onCancelQueuedPrompt ?? (() => {})}
              onUpdate={onUpdateQueuedPrompt ?? (() => {})}
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
      </div>
    </div>
  );
});
