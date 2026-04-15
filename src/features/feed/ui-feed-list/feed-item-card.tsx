import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowDownNarrowWide,
  Bot,
  CirclePause,
  ClipboardList,
  FolderOpen,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageCircleQuestion,
  MessageSquare,
  Pin,
  PinOff,
  ShieldQuestion,
  StickyNote,
  Terminal,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';

import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { formatRelativeTime } from '@/lib/time';
import {
  bgJobLabel,
  useRunningBackgroundJobsForTask,
} from '@/stores/background-jobs';
import { useFeedStore } from '@/stores/feed';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

function getInitials(name: string): string {
  if (!name) return '?';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function AttentionIcon({ attention }: { attention: FeedItemAttention }) {
  switch (attention) {
    case 'errored':
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />;
    case 'needs-permission':
      return <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
    case 'has-question':
      return (
        <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      );
    case 'completed':
      return null;
    case 'interrupted':
      return <CirclePause className="h-3.5 w-3.5 shrink-0 text-yellow-400" />;
    case 'running':
      return (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
      );
    case 'review-requested':
    case 'pr-comments':
    case 'pr-approved-by-me':
      return (
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-purple-400" />
      );
    case 'assigned-work-item':
      return <ClipboardList className="h-3.5 w-3.5 shrink-0 text-teal-400" />;
    case 'note':
      return <StickyNote className="h-3.5 w-3.5 shrink-0 text-yellow-500/70" />;
    case 'waiting':
      return (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
        </span>
      );
  }
}

function borderClasses({
  attention,
  hasUnread,
  isSelected,
}: {
  attention: FeedItemAttention;
  hasUnread?: boolean;
  isSelected: boolean;
}): string {
  if (attention === 'completed' && hasUnread) {
    return isSelected
      ? 'completed-unread-border-selected'
      : 'completed-unread-border';
  }

  if (isSelected) {
    switch (attention) {
      case 'errored':
        return 'border border-red-500/60 bg-neutral-800 shadow-sm';
      case 'needs-permission':
      case 'has-question':
        return 'border border-amber-500/60 bg-neutral-800 shadow-sm';
      case 'running':
        return 'running-border-selected';
      case 'interrupted':
        return 'border border-yellow-500/40 bg-neutral-800 shadow-sm';
      case 'review-requested':
      case 'pr-comments':
        return 'border border-purple-500/40 bg-neutral-800 shadow-sm';
      case 'pr-approved-by-me':
        return 'border border-neutral-600 bg-neutral-800 shadow-sm';
      case 'assigned-work-item':
        return 'border border-teal-500/60 bg-neutral-800 shadow-sm';
      case 'completed':
      default:
        return 'border-r-2 border-primary bg-surface-bright shadow-sm';
    }
  }

  switch (attention) {
    case 'errored':
      return 'border border-red-500/30 hover:border-red-500/50';
    case 'needs-permission':
    case 'has-question':
      return 'border border-amber-500/30 hover:border-amber-500/50';
    case 'running':
      return 'running-border';
    default:
      return '';
  }
}

export function FeedItemCard({
  item,
  isSelected,
  isDraggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  item: FeedItem;
  isSelected?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const navigate = useNavigate();
  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);
  const dismiss = useFeedStore((s) => s.dismiss);
  const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
  const isPinned = useFeedStore((s) => s.pinned.some((p) => p.id === item.id));
  const isLowPriority = useFeedStore((s) => s.lowPriority.includes(item.id));
  const runCommandStatus = useTaskMessagesStore((s) =>
    item.taskId ? s.runCommandRunning[item.taskId] : undefined,
  );
  const runningCommands = useMemo(
    () =>
      runCommandStatus?.commands.filter((c) => c.status === 'running') ?? [],
    [runCommandStatus],
  );
  const runningBgJobs = useRunningBackgroundJobsForTask(item.taskId ?? null);
  const isDeleting = runningBgJobs.some((j) => j.type === 'task-deletion');
  const hasNonDeleteBgJob =
    runningBgJobs.length > 0 &&
    runningBgJobs.some((j) => j.type !== 'task-deletion');
  const menuRef = useRef<{ toggle: () => void } | null>(null);

  const handleClick = useCallback(() => {
    if (item.source === 'work-item' && item.workItemId) {
      navigate({
        to: '/all/work-items/$projectId/$workItemId',
        params: {
          projectId: item.projectId,
          workItemId: String(item.workItemId),
        },
      });
    } else if (item.source === 'pull-request' && item.pullRequestId) {
      navigate({
        to: '/all/prs/$projectId/$prId',
        params: {
          projectId: item.projectId,
          prId: String(item.pullRequestId),
        },
      });
    } else if (item.taskId) {
      navigate({
        to: '/all/$taskId',
        params: { taskId: item.taskId },
      });
    }
  }, [navigate, item]);

  const openMenu = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    menuRef.current?.toggle();
  }, []);

  const handlePin = useCallback(() => {
    if (isPinned) {
      unpin(item.id);
    } else {
      pin(item.id);
    }
    menuRef.current?.toggle();
  }, [isPinned, pin, unpin, item.id]);

  const handleToggleLowPriority = useCallback(() => {
    toggleLowPriority(item.id);
    menuRef.current?.toggle();
  }, [toggleLowPriority, item.id]);

  const handleDismiss = useCallback(() => {
    dismiss(item.id);
    menuRef.current?.toggle();
  }, [dismiss, item.id]);

  const handleOpenInProject = useCallback(() => {
    if (item.source === 'pull-request' && item.pullRequestId) {
      navigate({
        to: '/projects/$projectId/prs/$prId',
        params: {
          projectId: item.projectId,
          prId: String(item.pullRequestId),
        },
      });
    } else if (item.taskId) {
      navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: {
          projectId: item.projectId,
          taskId: item.taskId,
        },
      });
    }
    menuRef.current?.toggle();
  }, [navigate, item]);

  return (
    <Dropdown
      variant="bright"
      trigger={({ triggerRef }) => (
        <div
          role="link"
          ref={triggerRef as React.Ref<HTMLDivElement>}
          tabIndex={0}
          draggable={isDraggable}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onClick={handleClick}
          onContextMenu={openMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
              return;
            }

            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              openMenu(e);
            }
          }}
          className={clsx(
            'relative flex cursor-pointer flex-col gap-1 rounded-lg px-3.5 py-2.5 transition-all duration-200 ease-out',
            borderClasses({
              attention: item.attention,
              hasUnread: item.hasUnread,
              isSelected: isSelected ?? false,
            }),
            isDeleting && 'opacity-50',
            !isSelected && 'hover:bg-surface-bright hover:translate-x-0.5',
          )}
        >
          {/* New activity accent bar */}
          {item.hasNewActivity && (
            <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-blue-400" />
          )}
          <div className="flex items-center gap-2">
            {item.taskType === 'skill-creation' && (
              <Bot className="h-3.5 w-3.5 shrink-0 text-purple-400" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
              {item.title}
            </span>
            {item.source === 'task' &&
              item.pullRequestId &&
              !item.workItemPrStatus && (
                <>
                  <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  {item.isDraft && (
                    <span className="shrink-0 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      Draft
                    </span>
                  )}
                </>
              )}
            {(item.source === 'work-item' || item.source === 'task') &&
              item.workItemPrStatus &&
              item.workItemPrStatus !== 'active' && (
                <span
                  className={clsx(
                    'flex shrink-0 items-center gap-1',
                    item.workItemPrStatus === 'completed'
                      ? 'text-purple-400'
                      : 'text-neutral-500',
                  )}
                  title={
                    item.workItemPrStatus === 'completed'
                      ? 'PR merged'
                      : 'PR abandoned'
                  }
                >
                  {item.workItemPrStatus === 'completed' ? (
                    <GitMerge className="h-3.5 w-3.5" />
                  ) : (
                    <GitPullRequest className="h-3.5 w-3.5" />
                  )}
                  <span className="text-[10px] font-medium">
                    {item.workItemPrStatus === 'completed'
                      ? 'Completed'
                      : 'Abandoned'}
                  </span>
                </span>
              )}
            {(item.source === 'work-item' || item.source === 'task') &&
              item.workItemPrStatus === 'active' && (
                <>
                  <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  {item.isDraft && (
                    <span className="shrink-0 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      Draft
                    </span>
                  )}
                </>
              )}
            {item.source === 'pull-request' &&
              (item.activeThreadCount ?? 0) > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 text-purple-400">
                  <MessageSquare className="h-3 w-3" />
                  <span className="text-[10px]">{item.activeThreadCount}</span>
                </span>
              )}
            <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <AttentionIcon attention={item.attention} />
            <span className="min-w-0 truncate">
              {item.projectName}
              {item.workItemIds && item.workItemIds.length > 0
                ? ` #${item.workItemIds.join(', #')}`
                : item.workItemId
                  ? ` #${item.workItemId}`
                  : null}
            </span>
            {item.source === 'pull-request' && item.ownerName && (
              <span
                className={clsx(
                  'max-w-28 shrink-0 truncate rounded px-1.5 py-0.5 text-[10px]',
                  item.isOwnedByCurrentUser
                    ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/40'
                    : 'bg-neutral-700/70 text-neutral-300',
                )}
              >
                {item.ownerName}
              </span>
            )}
            {item.source === 'pull-request' && item.isDraft && (
              <span className="shrink-0 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">
                Draft
              </span>
            )}
            {item.approvedBy && item.approvedBy.length > 0 && (
              <div className="flex shrink-0 -space-x-1.5">
                {item.approvedBy.map((reviewer) => (
                  <span
                    key={reviewer.uniqueName}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-green-900/50 text-[8px] font-medium text-green-300 ring-1 ring-green-500/50"
                    title={`${reviewer.displayName} approved`}
                  >
                    {getInitials(reviewer.displayName)}
                  </span>
                ))}
              </div>
            )}
            {item.source === 'work-item' && item.workItemState && (
              <span className="ml-auto shrink-0 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-300 ring-1 ring-teal-500/30">
                {item.workItemState}
              </span>
            )}
          </div>

          {item.source === 'task' && item.pendingMessage && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{item.pendingMessage}</span>
            </div>
          )}

          {runningCommands.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-2 py-1 ring-1 ring-green-500/20">
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-green-400">
                <Terminal className="animate-command-running h-3 w-3" />
              </span>
              <span className="min-w-0 truncate text-[11px] text-green-300">
                {runningCommands.map((c) => c.command).join(', ')}
              </span>
            </div>
          )}

          {hasNonDeleteBgJob && (
            <div className="flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2 py-1 ring-1 ring-violet-500/20">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-400" />
              <span className="min-w-0 truncate text-[11px] text-violet-300">
                {runningBgJobs
                  .filter((j) => j.type !== 'task-deletion')
                  .map((j) => bgJobLabel(j.type))
                  .join(', ')}
              </span>
            </div>
          )}
        </div>
      )}
      dropdownRef={menuRef}
      className="min-w-[180px]"
    >
      <DropdownItem
        onClick={handlePin}
        icon={
          isPinned ? (
            <PinOff className="text-neutral-400" />
          ) : (
            <Pin className="text-neutral-400" />
          )
        }
      >
        {isPinned ? 'Unpin' : 'Pin to top'}
      </DropdownItem>
      <DropdownItem
        onClick={handleToggleLowPriority}
        icon={<ArrowDownNarrowWide className="text-neutral-400" />}
      >
        {isLowPriority ? 'Remove low priority' : 'Mark low priority'}
      </DropdownItem>
      <DropdownItem
        onClick={handleDismiss}
        icon={<XCircle className="text-neutral-400" />}
      >
        Dismiss
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        onClick={handleOpenInProject}
        icon={<FolderOpen className="text-neutral-400" />}
      >
        Open in project
      </DropdownItem>
      <DropdownDivider />
      <DropdownInfo label="Menu shortcut" value="Shift+F10" />
    </Dropdown>
  );
}
