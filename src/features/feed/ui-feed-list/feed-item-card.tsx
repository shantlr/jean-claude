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
      return <AlertCircle className="text-status-fail h-3.5 w-3.5 shrink-0" />;
    case 'needs-permission':
      return (
        <ShieldQuestion className="text-status-run h-3.5 w-3.5 shrink-0" />
      );
    case 'has-question':
      return (
        <MessageCircleQuestion className="text-status-run h-3.5 w-3.5 shrink-0" />
      );
    case 'completed':
      return null;
    case 'interrupted':
      return <CirclePause className="text-status-run h-3.5 w-3.5 shrink-0" />;
    case 'running':
      return (
        <Loader2 className="text-acc-ink h-3.5 w-3.5 shrink-0 animate-spin" />
      );
    case 'review-requested':
    case 'pr-comments':
    case 'pr-approved-by-me':
      return <GitPullRequest className="text-status-pr h-3.5 w-3.5 shrink-0" />;
    case 'assigned-work-item':
      return (
        <ClipboardList className="text-status-azure h-3.5 w-3.5 shrink-0" />
      );
    case 'note':
      return <StickyNote className="text-status-run/70 h-3.5 w-3.5 shrink-0" />;
    case 'waiting':
      return (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span className="bg-ink-3 h-1.5 w-1.5 rounded-full" />
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
        return 'focused-border-fail';
      case 'needs-permission':
      case 'has-question':
        return 'focused-border-run';
      case 'running':
        return 'running-border-selected';
      case 'interrupted':
        return 'focused-border-run-subtle';
      case 'review-requested':
      case 'pr-comments':
        return 'focused-border-pr';
      case 'pr-approved-by-me':
        return 'focused-border';
      case 'assigned-work-item':
        return 'focused-border-azure';
      case 'completed':
      default:
        return 'focused-border';
    }
  }

  switch (attention) {
    case 'errored':
      return 'border border-status-fail/30 hover:border-status-fail/50';
    case 'needs-permission':
    case 'has-question':
      return 'border border-status-run/30 hover:border-status-run/50';
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
            !isSelected && 'hover:bg-glass-light hover:translate-x-0.5',
          )}
        >
          {/* New activity accent bar */}
          {item.hasNewActivity && (
            <span className="bg-acc absolute top-2 bottom-2 left-0 w-[3px] rounded-full" />
          )}
          <div className="flex items-center gap-2">
            {item.taskType === 'skill-creation' && (
              <Bot className="text-status-pr h-3.5 w-3.5 shrink-0" />
            )}
            <span className="text-ink-0 min-w-0 flex-1 truncate text-sm font-semibold">
              {item.title}
            </span>
            {item.source === 'task' &&
              item.pullRequestId &&
              !item.workItemPrStatus && (
                <>
                  <GitPullRequest className="text-status-done h-3.5 w-3.5 shrink-0" />
                  {item.isDraft && (
                    <span className="border-glass-border text-ink-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
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
                      ? 'text-status-pr'
                      : 'text-ink-3',
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
                  <GitPullRequest className="text-status-done h-3.5 w-3.5 shrink-0" />
                  {item.isDraft && (
                    <span className="border-glass-border text-ink-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                      Draft
                    </span>
                  )}
                </>
              )}
            {item.source === 'pull-request' &&
              (item.activeThreadCount ?? 0) > 0 && (
                <span className="text-status-pr flex shrink-0 items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" />
                  <span className="text-[10px]">{item.activeThreadCount}</span>
                </span>
              )}
            <span className="text-ink-3 shrink-0 text-[11px] tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>

          <div className="text-ink-2 flex items-center gap-1.5 text-xs">
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
                    ? 'bg-acc/20 text-acc-ink ring-acc/40 ring-1'
                    : 'bg-glass-medium/70 text-ink-1',
                )}
              >
                {item.ownerName}
              </span>
            )}
            {item.source === 'pull-request' && item.isDraft && (
              <span className="border-glass-border text-ink-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                Draft
              </span>
            )}
            {item.approvedBy && item.approvedBy.length > 0 && (
              <div className="flex shrink-0 -space-x-1.5">
                {item.approvedBy.map((reviewer) => (
                  <span
                    key={reviewer.uniqueName}
                    className="bg-status-done/20 text-status-done ring-status-done/50 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-medium ring-1"
                    title={`${reviewer.displayName} approved`}
                  >
                    {getInitials(reviewer.displayName)}
                  </span>
                ))}
              </div>
            )}
            {item.source === 'work-item' && item.workItemState && (
              <span className="bg-status-azure/15 text-status-azure ring-status-azure/30 ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1">
                {item.workItemState}
              </span>
            )}
          </div>

          {item.source === 'task' && item.pendingMessage && (
            <div className="text-status-run flex items-center gap-1 text-xs">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{item.pendingMessage}</span>
            </div>
          )}

          {runningCommands.length > 0 && (
            <div className="bg-status-done/10 ring-status-done/20 flex items-center gap-1.5 rounded-md px-2 py-1 ring-1">
              <span className="text-status-done flex shrink-0 items-center gap-1.5 text-[11px] font-medium">
                <Terminal className="animate-command-running h-3 w-3" />
              </span>
              <span className="text-status-done min-w-0 truncate text-[11px]">
                {runningCommands.map((c) => c.command).join(', ')}
              </span>
            </div>
          )}

          {hasNonDeleteBgJob && (
            <div className="bg-acc/10 ring-acc/20 flex items-center gap-1.5 rounded-md px-2 py-1 ring-1">
              <Loader2 className="text-acc-ink h-3 w-3 shrink-0 animate-spin" />
              <span className="text-acc-ink min-w-0 truncate text-[11px]">
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
            <PinOff className="text-ink-2" />
          ) : (
            <Pin className="text-ink-2" />
          )
        }
      >
        {isPinned ? 'Unpin' : 'Pin to top'}
      </DropdownItem>
      <DropdownItem
        onClick={handleToggleLowPriority}
        icon={<ArrowDownNarrowWide className="text-ink-2" />}
      >
        {isLowPriority ? 'Remove low priority' : 'Mark low priority'}
      </DropdownItem>
      <DropdownItem
        onClick={handleDismiss}
        icon={<XCircle className="text-ink-2" />}
      >
        Dismiss
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        onClick={handleOpenInProject}
        icon={<FolderOpen className="text-ink-2" />}
      >
        Open in project
      </DropdownItem>
      <DropdownDivider />
      <DropdownInfo label="Menu shortcut" value="Shift+F10" />
    </Dropdown>
  );
}
