import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';


import { ensureUtc, formatDuration } from '@/lib/time';
import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
} from '@shared/normalized-message-v2';
import { countUnifiedPatchStats } from '@/features/agent/ui-diff-view/diff-utils';
import { extractImagesFromMarkdown } from '@/lib/markdown-images';
import { formatModelName } from '@/hooks/use-model';
import { formatNumber } from '@/lib/number';



import type { DisplayMessage, PromptGroup } from '../message-merger';
import {
  getLastActivitySummary,
  getTodoProgress,
  getToolActivitySummary,
} from '../ui-subagent-entry/last-activity';
import { CommentableWrapper } from '../ui-commentable-text-entry';
import { MarkdownContent } from '../../ui-markdown-content';
import { RunningTimer } from '../ui-running-timer';
import { SkillEntry } from '../ui-skill-entry';
import { SubagentEntry } from '../ui-subagent-entry';
import { TimelineEntry } from '../ui-timeline-entry';



import { PromptGroupDiffModal } from './prompt-group-diff-modal';

// ── Helpers ────────────────────────────────────────────────────────────

const PROMPT_MAX_CHARS = 300;
const RECENT_RUNNING_MESSAGE_COUNT = 5;
const EMPTY_DISPLAY_MESSAGES: DisplayMessage[] = [];

type RunningActivityMessage =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'bash';
      command: string;
    };

function getAssistantPreviewMessage(
  dm: DisplayMessage,
): RunningActivityMessage | null {
  if (
    dm.kind !== 'entry' ||
    dm.entry.type !== 'assistant-message' ||
    !dm.entry.value.trim()
  ) {
    return null;
  }

  const preview = dm.entry.value.slice(0, 100);
  return {
    kind: 'text',
    text: preview.length < dm.entry.value.length ? `${preview}...` : preview,
  };
}

function getLatestActivityMessage(
  dm: DisplayMessage,
): RunningActivityMessage | null {
  const assistantMessage = getAssistantPreviewMessage(dm);
  if (assistantMessage) return assistantMessage;

  if (dm.kind === 'entry' && dm.entry.type === 'tool-use') {
    if (dm.entry.name === 'bash') {
      const bashEntry = dm.entry as ToolUseByName<'bash'>;
      const firstLine = bashEntry.input.command.split('\n')[0];
      const command = firstLine.slice(0, 80);
      return {
        kind: 'bash',
        command: command.length < firstLine.length ? `${command}...` : command,
      };
    }

    return {
      kind: 'text',
      text: getToolActivitySummary(dm.entry as NormalizedToolUse),
    };
  }

  return null;
}

/**
 * Get live activity for a running prompt group:
 * active subagents, active skills, latest todo, recent messages.
 */
function getRunningActivity(childMessages: DisplayMessage[]): {
  subagents: Array<{
    id: string;
    name: string;
    kind: string;
    step: string | null;
    model: string | null;
  }>;
  runningTools: Array<{
    id: string;
    summary: string;
  }>;
  todos: Array<{
    text: string;
    done: boolean;
    current: boolean;
  }>;
  isCompacting: boolean;
  recentMessages: RunningActivityMessage[];
} {
  const subagents: Array<{
    id: string;
    name: string;
    kind: string;
    step: string | null;
    model: string | null;
  }> = [];
  const runningTools: Array<{
    id: string;
    summary: string;
  }> = [];
  const recentMessages: RunningActivityMessage[] = [];

  // Collect active subagents
  for (const dm of childMessages) {
    if (dm.kind === 'subagent' && !dm.toolUse.result) {
      const subAgent =
        dm.toolUse.name === 'sub-agent'
          ? (dm.toolUse as ToolUseByName<'sub-agent'>)
          : undefined;
      const innerActivity = getLastActivitySummary(dm.childEntries);
      // Get model from child entries
      let model: string | null = null;
      for (let i = dm.childEntries.length - 1; i >= 0; i--) {
        if (dm.childEntries[i].model) {
          model = dm.childEntries[i].model ?? null;
          break;
        }
      }
      subagents.push({
        id: dm.toolUse.toolId,
        name: subAgent?.input.description ?? 'Sub-agent',
        kind: subAgent?.input.agentType ?? 'Agent',
        step: innerActivity,
        model,
      });
    }
  }

  // Collect running tools (tool_use without result, excluding subagents/skills/todo-write)
  for (const dm of childMessages) {
    if (
      dm.kind === 'entry' &&
      dm.entry.type === 'tool-use' &&
      !dm.entry.result &&
      dm.entry.name !== 'todo-write'
    ) {
      runningTools.push({
        id: dm.entry.toolId,
        summary: getToolActivitySummary(dm.entry as NormalizedToolUse),
      });
    }
  }

  // Collect latest todo state from most recent todo-write in ALL child messages
  const allEntries: NormalizedEntry[] = [];
  for (const dm of childMessages) {
    if (dm.kind === 'entry') allEntries.push(dm.entry);
    if (dm.kind === 'subagent') allEntries.push(...dm.childEntries);
    if (dm.kind === 'skill') allEntries.push(...dm.childEntries);
  }
  const todoProgress = getTodoProgress(allEntries);
  const todos: Array<{ text: string; done: boolean; current: boolean }> = [];

  if (todoProgress) {
    // Re-extract actual todo items from the most recent todo-write
    for (let i = allEntries.length - 1; i >= 0; i--) {
      const entry = allEntries[i];
      if (entry.type !== 'tool-use' || entry.name !== 'todo-write') continue;
      const todoEntry = entry as ToolUseByName<'todo-write'>;
      const todoItems = todoEntry.result?.newTodos ?? todoEntry.input.todos;
      if (todoItems && todoItems.length > 0) {
        for (const t of todoItems) {
          todos.push({
            text: t.description ?? t.content,
            done: t.status === 'completed',
            current: t.status === 'in_progress',
          });
        }
        break;
      }
    }
  }

  // Recent messages: newest row is latest activity; faded rows are assistant text.
  let latestMessage: RunningActivityMessage | null = null;
  let latestMessageIndex = -1;
  for (let i = childMessages.length - 1; i >= 0; i--) {
    const message = getLatestActivityMessage(childMessages[i]);
    if (message) {
      latestMessage = message;
      latestMessageIndex = i;
      break;
    }
  }

  if (latestMessage) {
    for (let i = latestMessageIndex - 1; i >= 0; i--) {
      const message = getAssistantPreviewMessage(childMessages[i]);
      if (message) {
        recentMessages.unshift(message);
        if (recentMessages.length >= RECENT_RUNNING_MESSAGE_COUNT - 1) break;
      }
    }
    recentMessages.push(latestMessage);
  }

  if (recentMessages.length === 0) {
    recentMessages.push({ kind: 'text', text: 'Working...' });
  }

  // Check if context compaction is in progress
  const isCompacting = childMessages.some(
    (dm) => dm.kind === 'compacting' && !dm.endEntry,
  );

  return { subagents, runningTools, todos, isCompacting, recentMessages };
}

function parseDateMs(date: string | undefined): number | null {
  if (!date) return null;

  const ms = Date.parse(ensureUtc(date));
  return Number.isNaN(ms) ? null : ms;
}

function formatMessageTime(date: string): string {
  const parsedDate = new Date(ensureUtc(date));
  const hours = String(parsedDate.getHours()).padStart(2, '0');
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDisplayMessageDate(dm: DisplayMessage): string | undefined {
  if (dm.kind === 'entry') return dm.entry.date;
  if (dm.kind === 'compacting') return dm.startEntry.date;
  if (dm.kind === 'skill') {
    return 'date' in dm.skillToolUse
      ? (dm.skillToolUse as NormalizedEntry).date
      : dm.promptEntry?.date;
  }
  return 'date' in dm.toolUse
    ? (dm.toolUse as NormalizedEntry).date
    : undefined;
}

function getLatestEntryDate(
  latest: { date: string; ms: number } | null,
  entry: NormalizedEntry,
): { date: string; ms: number } | null {
  const ms = parseDateMs(entry.date);
  if (ms === null || (latest && ms <= latest.ms)) return latest;

  return { date: entry.date, ms };
}

function getLatestDisplayMessageDate(
  childMessages: DisplayMessage[],
): string | undefined {
  let latest: { date: string; ms: number } | null = null;

  for (const dm of childMessages) {
    if (dm.kind === 'entry') latest = getLatestEntryDate(latest, dm.entry);
    if (dm.kind === 'compacting') {
      latest = getLatestEntryDate(latest, dm.startEntry);
      if (dm.endEntry) latest = getLatestEntryDate(latest, dm.endEntry);
    }
    if (dm.kind === 'skill') {
      if ('date' in dm.skillToolUse) {
        latest = getLatestEntryDate(
          latest,
          dm.skillToolUse as NormalizedEntry,
        );
      }
      if (dm.promptEntry) latest = getLatestEntryDate(latest, dm.promptEntry);
      for (const entry of dm.childEntries) {
        latest = getLatestEntryDate(latest, entry);
      }
      if (dm.latestChildEntryDate) {
        const ms = parseDateMs(dm.latestChildEntryDate);
        if (ms !== null && (!latest || ms > latest.ms)) {
          latest = { date: dm.latestChildEntryDate, ms };
        }
      }
    }
    if (dm.kind === 'subagent') {
      if ('date' in dm.toolUse) {
        latest = getLatestEntryDate(latest, dm.toolUse as NormalizedEntry);
      }
      for (const entry of dm.childEntries) {
        latest = getLatestEntryDate(latest, entry);
      }
      if (dm.latestChildEntryDate) {
        const ms = parseDateMs(dm.latestChildEntryDate);
        if (ms !== null && (!latest || ms > latest.ms)) {
          latest = { date: dm.latestChildEntryDate, ms };
        }
      }
    }
  }

  return latest?.date;
}

function MessageTime({ date }: { date?: string }) {
  if (!date) {
    return <div className="w-10 shrink-0" />;
  }

  return (
    <time
      dateTime={ensureUtc(date)}
      className="text-ink-4 w-10 shrink-0 pt-1 text-right font-mono text-[10px] leading-4 tabular-nums select-none"
      title={new Date(ensureUtc(date)).toLocaleString()}
    >
      {formatMessageTime(date)}
    </time>
  );
}

function shouldRenderChildMessage(dm: DisplayMessage): boolean {
  return dm.kind !== 'entry' || dm.entry.type !== 'session-summary';
}

function hasActiveTextSelectionWithin(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return false;
  }

  return [selection.anchorNode, selection.focusNode].some(
    (node) => node && element.contains(node),
  );
}

function getLastAssistantMessage(
  childMessages: DisplayMessage[],
): { text: string; entryId: string } | null {
  for (let i = childMessages.length - 1; i >= 0; i--) {
    const dm = childMessages[i];
    if (
      dm.kind === 'entry' &&
      dm.entry.type === 'assistant-message' &&
      dm.entry.value.trim()
    ) {
      return { text: dm.entry.value, entryId: dm.entry.id };
    }
  }

  return null;
}

function getRunningStartDate({
  promptDate,
  previousPromptDate,
}: {
  promptDate: string | undefined;
  previousPromptDate: string | undefined;
}): string | undefined {
  const promptMs = parseDateMs(promptDate);
  if (promptMs !== null && promptMs <= Date.now() + 5_000) {
    return promptDate;
  }

  const previousPromptMs = parseDateMs(previousPromptDate);
  if (previousPromptMs !== null && previousPromptMs <= Date.now() + 5_000) {
    return previousPromptDate;
  }

  return promptDate;
}

// ── Sub-components ─────────────────────────────────────────────────────

/** Prompt section — glass card, expand/collapse for long prompts only */
const PromptSection = memo(function PromptSection({
  group,
  onFilePathClick,
  onContextMenu,
}: {
  group: PromptGroup;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  onContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
}) {
  const promptText = group.promptEntry.value;
  const promptContent = useMemo(
    () => extractImagesFromMarkdown(promptText),
    [promptText],
  );
  const visiblePromptText = promptContent.contentWithoutImages;
  const isLong = visiblePromptText.length > PROMPT_MAX_CHARS;
  const [open, setOpen] = useState(false);
  const handlePromptClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (hasActiveTextSelectionWithin(event.currentTarget)) return;

    setOpen((current) => !current);
  }, []);

  return (
    <div
      className="group/prompt border-glass-border bg-glass-light relative rounded-md border transition-colors duration-100"
      style={isLong ? { cursor: 'pointer' } : undefined}
      onClick={isLong ? handlePromptClick : undefined}
      onContextMenu={
        onContextMenu ? (e) => onContextMenu(e, group.promptEntry) : undefined
      }
      onMouseOver={
        isLong
          ? (e) => {
              e.currentTarget.style.background = 'oklch(1 0 0 / 0.06)';
            }
          : undefined
      }
      onMouseOut={
        isLong
          ? (e) => {
              e.currentTarget.style.background = '';
            }
          : undefined
      }
    >
      <div className="px-3.5 pt-2.5 pb-2.5">
        {/* Timestamp */}
        {group.promptEntry.date && (
          <div className="text-ink-4 pointer-events-none absolute top-2.5 right-3 font-mono text-[10px]">
            {new Date(group.promptEntry.date).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}

        {/* Prompt text */}
        <div className="text-ink-1 pr-14 text-[12.5px] leading-relaxed">
          <MarkdownContent
            content={promptText}
            onFilePathClick={onFilePathClick}
            imagePresentation="footer-thumbnails"
            truncateToChars={open || !isLong ? undefined : PROMPT_MAX_CHARS}
            extractedContent={promptContent}
          />
          {isLong && !open && <span className="text-ink-3">&hellip;</span>}
        </div>

        {/* Show more / less toggle */}
        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="text-ink-3 hover:text-ink-1 mt-1.5 flex items-center gap-1 font-mono text-[10.5px]"
          >
            {open ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            {open ? 'collapse' : 'show more'}
          </button>
        )}
      </div>
    </div>
  );
}, arePromptSectionPropsEqual);

function arePromptSectionPropsEqual(
  prev: {
    group: PromptGroup;
    onFilePathClick?: (
      filePath: string,
      lineStart?: number,
      lineEnd?: number,
    ) => void;
    onContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
  },
  next: {
    group: PromptGroup;
    onFilePathClick?: (
      filePath: string,
      lineStart?: number,
      lineEnd?: number,
    ) => void;
    onContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
  },
): boolean {
  return (
    prev.group.promptEntry === next.group.promptEntry &&
    prev.onFilePathClick === next.onFilePathClick &&
    prev.onContextMenu === next.onContextMenu
  );
}

const AgentHeader = memo(function AgentHeader({
  detailsExpanded,
  onToggleDetails,
  onContextMenu,
  isActiveGroup,
  runningStartDate,
  lastMessageDate,
  completedDurationLabel,
  stepCount,
  resultStats,
}: {
  detailsExpanded: boolean;
  onToggleDetails: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  isActiveGroup: boolean;
  runningStartDate?: string;
  lastMessageDate?: string;
  completedDurationLabel: string | null;
  stepCount: number;
  resultStats?: string | null;
}) {
  return (
    <div
      className="text-ink-3 flex cursor-pointer items-center gap-2 px-3 py-1.5 font-mono text-[10.5px] tracking-wide uppercase select-none"
      style={{
        borderBottom: detailsExpanded
          ? '1px solid oklch(1 0 0 / 0.06)'
          : 'none',
        background: 'oklch(1 0 0 / 0.02)',
      }}
      onClick={onToggleDetails}
      onContextMenu={onContextMenu}
    >
      {detailsExpanded ? (
        <ChevronDown className="h-2.5 w-2.5" />
      ) : (
        <ChevronRight className="h-2.5 w-2.5" />
      )}

      {isActiveGroup ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="rg-pulse-glow bg-acc h-1.5 w-1.5 rounded-full"
              style={{
                boxShadow:
                  '0 0 8px var(--color-acc), 0 0 14px color-mix(in oklch, var(--color-acc) 60%, transparent)',
                animation: 'rg-pulse-glow 1.4s ease-in-out infinite',
              }}
            />
            <span className="rg-running-text uppercase">
              running
              <span className="rg-running-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
          </span>
          <RunningTimer
            startDate={runningStartDate}
            className="text-ink-4 ml-1.5"
          />
          {lastMessageDate && (
            <time
              dateTime={ensureUtc(lastMessageDate)}
              className="text-ink-4 ml-1.5 tracking-normal normal-case"
              title={`Last message ${new Date(ensureUtc(lastMessageDate)).toLocaleString()}`}
            >
              last {formatMessageTime(lastMessageDate)}
            </time>
          )}
        </>
      ) : (
        <>
          {completedDurationLabel && (
            <span className="text-ink-4 tracking-normal normal-case">
              {completedDurationLabel}
            </span>
          )}
          <span className="text-ink-2">{stepCount} steps</span>
          {resultStats && (
            <span className="text-ink-4 ml-1.5 tracking-normal normal-case">
              {resultStats}
            </span>
          )}
        </>
      )}

      <div className="flex-1" />
      <span className="text-ink-4 tracking-normal normal-case">
        {detailsExpanded ? 'hide timeline' : 'show timeline'}
      </span>
    </div>
  );
});

/** Subagent card — shimmer sweep + pulse-ring indicator */
function SubagentCard({
  sa,
}: {
  sa: {
    id: string;
    name: string;
    kind: string;
    step: string | null;
    model: string | null;
  };
}) {
  return (
    <div
      className="relative flex items-center gap-2.5 overflow-hidden rounded-md border px-2.5 py-1.5"
      style={{
        background: `linear-gradient(135deg,
          color-mix(in oklch, var(--color-acc) 14%, transparent) 0%,
          color-mix(in oklch, var(--color-acc) 4%, transparent) 45%,
          oklch(1 0 0 / 0.02) 100%)`,
        borderColor: `color-mix(in oklch, var(--color-acc) 28%, transparent)`,
        boxShadow: `0 0 24px -8px color-mix(in oklch, var(--color-acc) 60%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.04)`,
      }}
    >
      {/* Shimmer sweep */}
      <div
        className="rg-shimmer-sweep pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(110deg,
            transparent 0%, transparent 40%,
            color-mix(in oklch, var(--color-acc) 22%, transparent) 50%,
            transparent 60%, transparent 100%)`,
          animation: 'rg-shimmer-sweep 3.2s ease-in-out infinite',
        }}
      />

      {/* Pulse-ring indicator */}
      <div className="relative h-2.5 w-2.5 shrink-0">
        <span
          className="bg-acc absolute inset-0 rounded-full"
          style={{ opacity: 0.85, boxShadow: '0 0 8px var(--color-acc)' }}
        />
        <span
          className="rg-pulse-ring border-acc absolute inset-0 rounded-full border"
          style={{ animation: 'rg-pulse-ring 1.8s ease-out infinite' }}
        />
      </div>

      {/* Content */}
      <div className="relative flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-ink-1 flex items-baseline gap-2 overflow-hidden font-mono text-xs">
          <span className="truncate">{sa.name}</span>
          <span className="text-ink-3 shrink-0 rounded bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold tracking-wide uppercase">
            {sa.kind}
          </span>
        </div>
        {sa.step && (
          <div className="text-ink-3 flex items-center gap-2 font-mono text-[10.5px]">
            <span className="opacity-85" style={{ color: 'var(--color-acc)' }}>
              ›
            </span>
            <span className="min-w-0 flex-1 truncate">
              {sa.step}
              <span className="rg-caret">▍</span>
            </span>
            {sa.model && (
              <span className="text-ink-4 shrink-0">
                {formatModelName(sa.model)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Todo row — checkbox with accent styling */
function TodoRow({
  todo,
}: {
  todo: { text: string; done: boolean; current: boolean };
}) {
  return (
    <div
      className="flex items-center gap-2 rounded px-1.5 py-0.5 font-mono text-xs"
      style={
        todo.current
          ? {
              background: `color-mix(in oklch, var(--color-acc) 8%, transparent)`,
            }
          : undefined
      }
    >
      {/* Checkbox */}
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm"
        style={{
          border: todo.done
            ? '1px solid var(--color-acc)'
            : todo.current
              ? '1px solid color-mix(in oklch, var(--color-acc) 60%, transparent)'
              : '1px solid oklch(1 0 0 / 0.18)',
          background: todo.done ? 'var(--color-acc)' : 'transparent',
          boxShadow:
            todo.current && !todo.done
              ? '0 0 8px -2px var(--color-acc)'
              : 'none',
        }}
      >
        {todo.done && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.5L5 9l4.5-5.5"
              stroke="oklch(0.1 0 0)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {todo.current && !todo.done && (
          <span
            className="rg-pulse-glow bg-acc h-1.5 w-1.5 rounded-full"
            style={{ animation: 'rg-pulse-glow 1.4s ease-in-out infinite' }}
          />
        )}
      </span>

      {/* Text */}
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: todo.done
            ? 'var(--color-ink-3)'
            : todo.current
              ? 'var(--color-ink-1)'
              : 'var(--color-ink-2)',
          textDecoration: todo.done ? 'line-through' : 'none',
          textDecorationColor: 'oklch(1 0 0 / 0.25)',
        }}
      >
        {todo.text}
      </span>

      {/* NOW label */}
      {todo.current && (
        <span className="text-acc-ink shrink-0 font-mono text-[9px] font-semibold tracking-wide uppercase">
          now
        </span>
      )}
    </div>
  );
}

/** Result block — ✓ checkmark + text + bullets + cost line */
function ResultBlock({
  resultText,
  stats,
  isError,
  onFilePathClick,
  entryId,
  taskId,
}: {
  resultText: string | null;
  stats: string | null;
  isError: boolean;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  /** Entry ID for comment anchoring */
  entryId?: string;
  /** Task ID for comment anchoring */
  taskId?: string;
}) {
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>{resultText || 'Unknown error'}</span>
      </div>
    );
  }

  const content = (
    <div className="text-ink-1 font-mono text-xs leading-relaxed">
      <div className="flex items-baseline gap-2">
        <span className="text-acc-ink w-3 shrink-0 text-center">✓</span>
        <div className="min-w-0 flex-1">
          {resultText && (
            <div className="mb-0.5">
              <MarkdownContent
                content={resultText}
                onFilePathClick={onFilePathClick}
              />
            </div>
          )}
        </div>
      </div>
      {stats && (
        <div className="text-ink-4 mt-2 flex gap-3.5 pl-5 font-mono text-[10.5px]">
          {stats}
        </div>
      )}
    </div>
  );

  if (entryId && taskId) {
    return (
      <CommentableWrapper entryId={entryId} taskId={taskId}>
        {content}
      </CommentableWrapper>
    );
  }

  return content;
}

/** Running summary — subagent cards, todo checklist, recent messages */
function RunningSummary({
  activity,
}: {
  activity: ReturnType<typeof getRunningActivity>;
}) {
  return (
    <div className="text-ink-1 flex flex-col gap-2.5 font-mono text-xs">
      {/* Subagents */}
      {activity.subagents.length > 0 && (
        <div>
          <div className="text-ink-4 mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
            <span className="text-acc-ink">◆</span>
            <span>subagents</span>
            <span
              className="text-acc-ink inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold tracking-normal"
              style={{
                background:
                  'color-mix(in oklch, var(--color-acc) 18%, transparent)',
              }}
            >
              <span
                className="rg-pulse-glow bg-acc h-1 w-1 rounded-full"
                style={{
                  animation: 'rg-pulse-glow 1.4s ease-in-out infinite',
                }}
              />
              {activity.subagents.length} live
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {activity.subagents.map((sa) => (
              <SubagentCard key={sa.id} sa={sa} />
            ))}
          </div>
        </div>
      )}

      {/* Running tools */}
      {activity.runningTools.length > 0 && (
        <div>
          <div className="text-ink-4 mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
            <span>tools</span>
            <span className="text-ink-3 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold tracking-normal">
              <span
                className="rg-pulse-glow bg-acc h-1 w-1 rounded-full"
                style={{
                  animation: 'rg-pulse-glow 1.4s ease-in-out infinite',
                }}
              />
              {activity.runningTools.length} running
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {activity.runningTools.map((tool) => (
              <div
                key={tool.id}
                className="text-ink-2 flex items-baseline gap-2"
              >
                <span className="text-ink-4 w-3 shrink-0 text-center">⏳</span>
                <span className="flex-1 truncate">{tool.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context compaction */}
      {activity.isCompacting && (
        <div className="flex items-center gap-1.5">
          <span className="rg-pulse-glow h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 shadow-[0_0_6px_theme(colors.amber.500/40)]" />
          <span className="text-ink-3 font-mono text-[10px] tracking-wider uppercase">
            compacting context…
          </span>
        </div>
      )}

      {/* Todo list */}
      {activity.todos.length > 0 && (
        <div>
          <div className="text-ink-4 mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
            <span>todo</span>
            <span className="text-ink-3 rounded-full bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold tracking-normal">
              {activity.todos.filter((t) => t.done).length}/
              {activity.todos.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {activity.todos.map((td, i) => (
              <TodoRow key={i} todo={td} />
            ))}
          </div>
        </div>
      )}

      {/* Recent messages */}
      {activity.recentMessages.length > 0 && (
        <div>
          <div className="text-ink-4 mb-1 font-mono text-[10px] tracking-wider uppercase">
            recent
          </div>
          <div className="flex flex-col gap-0.5">
            {activity.recentMessages.map((message, index) => {
              const isNewest = index === activity.recentMessages.length - 1;
              const opacity =
                activity.recentMessages.length === 1
                  ? 1
                  : 0.38 +
                    (index / (activity.recentMessages.length - 1)) * 0.62;

              return (
                <div
                  key={index}
                  className="text-ink-2 flex items-baseline gap-2"
                  style={{ opacity }}
                >
                  <span className="text-ink-4 w-3 shrink-0 text-center">·</span>
                  <span className="min-w-0 flex-1 truncate">
                    {message.kind === 'bash' ? (
                      <span className="inline-flex min-w-0 items-baseline gap-1">
                        <span className="text-acc-ink shrink-0">$</span>
                        <span className="text-ink-2 truncate">
                          {message.command}
                        </span>
                      </span>
                    ) : (
                      message.text
                    )}
                    {isNewest && <span className="rg-caret">▍</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getVisibleChildMessageCount(childMessages: DisplayMessage[]): number {
  let count = 0;
  for (const dm of childMessages) {
    if (shouldRenderChildMessage(dm)) count++;
  }
  return count;
}

function getCompletedTodos(
  childMessages: DisplayMessage[],
): Array<{ text: string; done: boolean; current: boolean }> | null {
  const allEntries: NormalizedEntry[] = [];
  for (const dm of childMessages) {
    if (dm.kind === 'entry') allEntries.push(dm.entry);
    if (dm.kind === 'subagent') allEntries.push(...dm.childEntries);
    if (dm.kind === 'skill') allEntries.push(...dm.childEntries);
  }
  const todoProgress = getTodoProgress(allEntries);
  if (!todoProgress) return null;
  const todos: Array<{ text: string; done: boolean; current: boolean }> = [];
  for (let i = allEntries.length - 1; i >= 0; i--) {
    const entry = allEntries[i];
    if (entry.type !== 'tool-use' || entry.name !== 'todo-write') continue;
    const todoEntry = entry as ToolUseByName<'todo-write'>;
    const todoItems = todoEntry.result?.newTodos ?? todoEntry.input.todos;
    if (todoItems && todoItems.length > 0) {
      for (const t of todoItems) {
        todos.push({
          text: t.description ?? t.content,
          done: t.status === 'completed',
          current: t.status === 'in_progress',
        });
      }
      break;
    }
  }
  return todos.length > 0 ? todos : null;
}

type FileStats = {
  fileCount: number;
  added: number;
  removed: number;
};

function isFileChangeToolEntry(entry: NormalizedEntry): boolean {
  return (
    entry.type === 'tool-use' &&
    (entry.name === 'edit' || entry.name === 'write')
  );
}

function getFileChangeToolEntries(
  childMessages: DisplayMessage[],
): NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];

  function addEntry(entry: NormalizedEntry) {
    if (isFileChangeToolEntry(entry)) entries.push(entry);
  }

  for (const dm of childMessages) {
    if (dm.kind === 'entry') addEntry(dm.entry);
    if (dm.kind === 'subagent') dm.childEntries.forEach(addEntry);
    if (dm.kind === 'skill') dm.childEntries.forEach(addEntry);
  }

  return entries;
}

function getFileStats(fileChangeEntries: NormalizedEntry[]): FileStats | null {
  const files = new Set<string>();
  let added = 0;
  let removed = 0;

  function countLines(s: string): number {
    if (!s) return 0;
    return s.split('\n').length;
  }

  for (const entry of fileChangeEntries) {
    if (entry.type !== 'tool-use') continue;
    if (entry.name === 'edit') {
      const e = entry as ToolUseByName<'edit'>;
      const editFiles = e.input.files ?? [
        {
          filePath: e.input.filePath,
          type: 'update' as const,
          before: e.input.oldString,
          after: e.input.newString,
          additions: undefined,
          deletions: undefined,
        },
      ];
      for (const file of editFiles) {
        files.add(file.filePath);
        if (
          typeof file.additions === 'number' ||
          typeof file.deletions === 'number'
        ) {
          added += file.additions ?? 0;
          removed += file.deletions ?? 0;
          continue;
        }
        if (file.patch) {
          const patchStats = countUnifiedPatchStats(file.patch);
          if (patchStats) {
            added += patchStats.additions;
            removed += patchStats.deletions;
            continue;
          }
        }
        const oldLines = countLines(file.before ?? e.input.oldString);
        const newLines = countLines(file.after ?? e.input.newString);
        if (newLines > oldLines) added += newLines - oldLines;
        else removed += oldLines - newLines;
      }
    } else if (entry.name === 'write') {
      const w = entry as ToolUseByName<'write'>;
      const writeFiles = w.input.files ?? [
        {
          filePath: w.input.filePath,
          type: 'add' as const,
          after: w.input.value,
          additions: undefined,
          deletions: undefined,
        },
      ];
      for (const file of writeFiles) {
        files.add(file.filePath);
        if (
          typeof file.additions === 'number' ||
          typeof file.deletions === 'number'
        ) {
          added += file.additions ?? 0;
          removed += file.deletions ?? 0;
          continue;
        }
        if (file.patch) {
          const patchStats = countUnifiedPatchStats(file.patch);
          if (patchStats) {
            added += patchStats.additions;
            removed += patchStats.deletions;
            continue;
          }
        }
        added += countLines(file.after ?? w.input.value);
      }
    }
  }

  if (files.size === 0) return null;
  return { fileCount: files.size, added, removed };
}

// ── Main component ─────────────────────────────────────────────────────

/**
 * Renders a prompt group as two sections:
 *
 * 1. **Prompt section** — glass card, expand/collapse for long prompts
 * 2. **Agent section** — dark glass container with header bar + collapsible body
 *    - Running: shimmer text header, subagent cards, todos, latest message
 *    - Completed: result block with ✓, stats, bullets
 *    - Error/Interrupted: starts expanded
 */
export const PromptGroupEntry = memo(function PromptGroupEntry({
  group,
  isLast = false,
  isTaskRunning = false,
  previousPromptDate,
  onFilePathClick,
  onToolDiffClick,
  onPromptContextMenu,
  onEntryContextMenu,
  onToolUseContextMenu,
  onResultContextMenu,
  rootPath,
  taskId,
}: {
  group: PromptGroup;
  isLast?: boolean;
  /** Whether the parent task is currently running */
  isTaskRunning?: boolean;
  previousPromptDate?: string;
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
  onPromptContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
  onEntryContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
  onToolUseContextMenu?: (e: MouseEvent, toolUse: NormalizedToolUse) => void;
  onResultContextMenu?: (e: MouseEvent, entry: NormalizedEntry) => void;
  rootPath?: string | null;
  /** Task ID for comment anchoring in assistant messages */
  taskId?: string;
}) {
  const isError = group.status === 'error';
  const isInterrupted = group.status === 'interrupted';
  const isRunning = group.status === 'running';
  // Last group can still be active while backend has no open tool/result yet.
  const isActiveGroup = isRunning || (isLast && isTaskRunning);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  // Details expand/collapse:
  // - error/interrupted on last group: start expanded
  // - previous (non-last) groups: always default collapsed
  // - user can still manually toggle any group
  const [detailsToggled, setDetailsToggled] = useState<boolean | null>(null);
  const defaultDetailsExpanded = isLast && (isError || isInterrupted);
  const detailsExpanded = detailsToggled ?? defaultDetailsExpanded;

  // Result summary
  const resultSummary = useMemo(() => {
    if (!group.resultEntry) {
      return null;
    }

    const entry = group.resultEntry;
    if (entry.isError) {
      return {
        isError: true,
        stats: null,
        text: entry.value || 'Unknown error',
        entryId: entry.id,
      };
    }
    const cost = entry.cost?.toFixed(2) || '0.00';
    const apiCost = entry.apiCost?.toFixed(2);
    const tokens = formatNumber(
      (entry.usage?.inputTokens ?? 0) + (entry.usage?.outputTokens ?? 0),
    );
    const durationMs = group.durationMs ?? entry.durationMs ?? 0;
    const fallbackAssistantMessage =
      !entry.value || !entry.value.trim()
        ? getLastAssistantMessage(group.childMessages)
        : null;
    return {
      isError: false,
      stats: `${tokens} tok · ${formatDuration(durationMs)} · $${cost}${apiCost ? ` · api cost $${apiCost}` : ''}`,
      text: entry.value || fallbackAssistantMessage?.text || null,
      entryId: fallbackAssistantMessage?.entryId ?? entry.id,
      isAssistantFallback: fallbackAssistantMessage !== null,
    };
  }, [group.childMessages, group.durationMs, group.resultEntry]);

  const completedDurationLabel = useMemo(() => {
    if (isActiveGroup) return null;

    const durationMs = group.durationMs ?? group.resultEntry?.durationMs;
    if (durationMs === undefined || durationMs < 0) return null;

    return formatDuration(durationMs);
  }, [group.durationMs, group.resultEntry?.durationMs, isActiveGroup]);

  // Activity for running state
  const activity = useMemo(() => {
    if (!isActiveGroup) return null;
    return getRunningActivity(group.childMessages);
  }, [isActiveGroup, group.childMessages]);

  const visibleChildMessages = useMemo(
    () =>
      detailsExpanded
        ? group.childMessages.filter(shouldRenderChildMessage)
        : EMPTY_DISPLAY_MESSAGES,
    [detailsExpanded, group.childMessages],
  );

  // Extract todos for collapsed non-running state
  const completedTodos = useMemo(() => {
    if (isActiveGroup || detailsExpanded) return null;
    return getCompletedTodos(group.childMessages);
  }, [detailsExpanded, isActiveGroup, group.childMessages]);

  const toggleDetails = useCallback(
    () =>
      setDetailsToggled((prev) => {
        const current = prev ?? defaultDetailsExpanded;
        return !current;
      }),
    [defaultDetailsExpanded],
  );

  const handleAgentHeaderContextMenu = useCallback(
    (e: MouseEvent) => {
      onPromptContextMenu?.(e, group.promptEntry);
    },
    [onPromptContextMenu, group.promptEntry],
  );

  // Compute step count for header
  const stepCount = useMemo(
    () => getVisibleChildMessageCount(group.childMessages),
    [group.childMessages],
  );

  const runningStartDate = useMemo(
    () =>
      getRunningStartDate({
        promptDate: group.promptEntry.date,
        previousPromptDate,
      }),
    [group.promptEntry.date, previousPromptDate],
  );

  const lastMessageDate = useMemo(() => {
    if (!isActiveGroup) return undefined;
    return getLatestDisplayMessageDate(group.childMessages);
  }, [group.childMessages, isActiveGroup]);

  // Compute file edit/write stats from child messages
  const fileStats = useMemo(() => {
    const fileChangeEntries = getFileChangeToolEntries(group.childMessages);
    return getFileStats(fileChangeEntries);
  }, [group.childMessages]);

  return (
    <div className="mb-5">
      {/* Part 1: Prompt section */}
      <PromptSection
        group={group}
        onFilePathClick={onFilePathClick}
        onContextMenu={onPromptContextMenu}
      />

      {/* Part 2: Agent section with floating sticky collapse control */}
      <div className="relative mt-2">
        {/* Floating collapse control — only when expanded */}
        {detailsExpanded && (
          <div className="pointer-events-none absolute top-3.5 bottom-3.5 left-0 z-10 w-0 overflow-visible">
            <div className="pointer-events-auto sticky top-[50vh] -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={toggleDetails}
                className="text-ink-2 hover:text-ink-1 flex h-7 w-6 cursor-pointer items-center justify-center rounded-md border border-white/12 bg-white/10 shadow-[0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur-[6px] transition-all duration-150 hover:border-white/20 hover:bg-white/16 hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                style={{
                  opacity: 0.72,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.opacity = '0.72';
                }}
                aria-label="Collapse timeline"
              >
                <ChevronDown className="text-ink-2 h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <div
          className={
            isLast && isActiveGroup
              ? 'task-agent-running-shell min-w-0 flex-1 rounded-md'
              : 'min-w-0 flex-1 rounded-md'
          }
          style={{
            background: 'oklch(0.06 0.01 280 / 0.5)',
            border: '1px solid oklch(1 0 0 / 0.10)',
          }}
        >
          {/* Header bar */}
          <AgentHeader
            detailsExpanded={detailsExpanded}
            onToggleDetails={toggleDetails}
            onContextMenu={
              onPromptContextMenu ? handleAgentHeaderContextMenu : undefined
            }
            isActiveGroup={isActiveGroup}
            runningStartDate={runningStartDate}
            lastMessageDate={lastMessageDate}
            completedDurationLabel={completedDurationLabel}
            stepCount={stepCount}
            resultStats={resultSummary?.stats}
          />

          {/* Body */}
          <div className="px-3.5 py-2.5">
            {detailsExpanded ? (
              /* Expanded: full child timeline */
              <div className="flex flex-col gap-0.5">
                {visibleChildMessages.map((dm, index) => {
                  const messageDate = getDisplayMessageDate(dm);
                  if (dm.kind === 'skill') {
                    return (
                      <div
                        key={index}
                        className="flex items-start gap-2"
                        onContextMenu={
                          onToolUseContextMenu
                            ? (e) => onToolUseContextMenu(e, dm.skillToolUse)
                            : undefined
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <SkillEntry
                            skillToolUse={dm.skillToolUse}
                            promptEntry={dm.promptEntry}
                            onFilePathClick={onFilePathClick}
                          />
                        </div>
                        <MessageTime date={messageDate} />
                      </div>
                    );
                  }
                  if (dm.kind === 'compacting') return null;
                  if (dm.kind === 'subagent') {
                    return (
                      <div
                        key={index}
                        className="flex items-start gap-2"
                        onContextMenu={
                          onToolUseContextMenu
                            ? (e) => onToolUseContextMenu(e, dm.toolUse)
                            : undefined
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <SubagentEntry
                            toolUse={dm.toolUse}
                            childEntries={dm.childEntries}
                            onFilePathClick={onFilePathClick}
                            onToolDiffClick={onToolDiffClick}
                            onEntryContextMenu={onEntryContextMenu}
                            taskId={taskId}
                          />
                        </div>
                        <MessageTime date={messageDate} />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2"
                      onContextMenu={
                        onEntryContextMenu
                          ? (e) => onEntryContextMenu(e, dm.entry)
                          : undefined
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <TimelineEntry
                          entry={dm.entry}
                          onFilePathClick={onFilePathClick}
                          onToolDiffClick={onToolDiffClick}
                          taskId={taskId}
                        />
                      </div>
                      <MessageTime date={messageDate} />
                    </div>
                  );
                })}
                {/* Append result or running summary at bottom when expanded */}
                {!isActiveGroup && group.resultEntry && (
                  <div
                    className="mt-2.5 border-t border-dashed border-white/[0.08] pt-2.5"
                    onContextMenu={
                      onResultContextMenu
                        ? (e) => onResultContextMenu(e, group.resultEntry!)
                        : undefined
                    }
                  >
                    <ResultBlock
                      resultText={
                        resultSummary?.isAssistantFallback
                          ? null
                          : (resultSummary?.text ?? null)
                      }
                      stats={resultSummary?.stats ?? null}
                      isError={resultSummary?.isError ?? false}
                      onFilePathClick={onFilePathClick}
                      entryId={resultSummary?.entryId}
                      taskId={taskId}
                    />
                  </div>
                )}
                {isActiveGroup && activity && (
                  <div className="mt-2.5 border-t border-dashed border-white/[0.08] pt-2.5">
                    <RunningSummary activity={activity} />
                  </div>
                )}
              </div>
            ) : isActiveGroup && activity ? (
              /* Collapsed running: live summary */
              <RunningSummary activity={activity} />
            ) : (
              /* Collapsed done/interrupted: todos then result */
              <div className="flex flex-col gap-2.5">
                {completedTodos && completedTodos.length > 0 && (
                  <div>
                    <div className="text-ink-4 mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                      <span>todo</span>
                      <span className="text-ink-3 rounded-full bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold tracking-normal">
                        {completedTodos.filter((t) => t.done).length}/
                        {completedTodos.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {completedTodos.map((td, i) => (
                        <TodoRow key={i} todo={td} />
                      ))}
                    </div>
                  </div>
                )}
                {resultSummary ? (
                  <ResultBlock
                    resultText={resultSummary.text}
                    stats={resultSummary.stats}
                    isError={resultSummary.isError}
                    onFilePathClick={onFilePathClick}
                    entryId={resultSummary.entryId}
                    taskId={taskId}
                  />
                ) : isInterrupted ? (
                  <span className="text-ink-3 text-xs">Interrupted</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Changes summary — bottom of agent section (clickable) */}
          {fileStats && (
            <button
              type="button"
              onClick={() => setDiffModalOpen(true)}
              className="text-ink-4 hover:text-ink-2 flex w-full cursor-pointer items-center gap-3 px-3.5 py-1.5 font-mono text-[10.5px] transition-colors"
              style={{ borderTop: '1px solid oklch(1 0 0 / 0.06)' }}
            >
              <span>
                {fileStats.fileCount}{' '}
                {fileStats.fileCount === 1 ? 'file' : 'files'} changed
              </span>
              {fileStats.added > 0 && (
                <span className="text-status-done">+{fileStats.added}</span>
              )}
              {fileStats.removed > 0 && (
                <span className="text-status-fail">−{fileStats.removed}</span>
              )}
              <span className="text-ink-4 ml-auto text-[9.5px]">view diff</span>
            </button>
          )}
        </div>
      </div>

      {/* Diff modal */}
      {fileStats && (
        <PromptGroupDiffModal
          isOpen={diffModalOpen}
          onClose={() => setDiffModalOpen(false)}
          childMessages={group.childMessages}
          rootPath={rootPath}
          taskId={taskId}
        />
      )}
    </div>
  );
});
