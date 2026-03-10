import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowDownNarrowWide,
  CirclePause,
  FolderOpen,
  GitPullRequest,
  Loader2,
  MessageCircleQuestion,
  Pin,
  PinOff,
  ShieldQuestion,
  StickyNote,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useRef } from 'react';

import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { formatRelativeTime } from '@/lib/time';
import { useFeedStore } from '@/stores/feed';
import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

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
      return (
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-purple-400" />
      );
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
  isSelected,
}: {
  attention: FeedItemAttention;
  isSelected: boolean;
}): string {
  if (isSelected) {
    switch (attention) {
      case 'errored':
        return 'border border-red-500/60 bg-neutral-800 shadow-sm';
      case 'needs-permission':
      case 'has-question':
        return 'border border-amber-500/60 bg-neutral-800 shadow-sm';
      case 'running':
        return 'border border-blue-500/60 bg-neutral-800 shadow-sm';
      case 'completed':
        return 'border border-green-500/40 bg-neutral-800 shadow-sm';
      case 'interrupted':
        return 'border border-yellow-500/40 bg-neutral-800 shadow-sm';
      case 'review-requested':
      case 'pr-comments':
        return 'border border-purple-500/40 bg-neutral-800 shadow-sm';
      default:
        return 'border border-blue-500 bg-neutral-800 shadow-sm';
    }
  }

  switch (attention) {
    case 'errored':
      return 'border border-red-500/30 hover:border-red-500/50';
    case 'needs-permission':
    case 'has-question':
      return 'border border-amber-500/30 hover:border-amber-500/50';
    case 'running':
      return 'border border-blue-500/20 hover:border-blue-500/40';
    default:
      return 'border border-transparent';
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
  const menuRef = useRef<{ toggle: () => void } | null>(null);

  const handleClick = useCallback(() => {
    if (item.source === 'pull-request' && item.pullRequestId) {
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
            'flex cursor-pointer flex-col gap-1 rounded-lg px-3.5 py-2.5 transition-all duration-200 ease-out',
            borderClasses({
              attention: item.attention,
              isSelected: isSelected ?? false,
            }),
            !isSelected && 'hover:translate-x-0.5 hover:bg-neutral-800/80',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <AttentionIcon attention={item.attention} />
            <span className="min-w-0 truncate">{item.projectName}</span>
            {item.source === 'pull-request' && item.ownerName && (
              <span className="max-w-28 shrink-0 truncate rounded bg-neutral-700/70 px-1.5 py-0.5 text-[10px] text-neutral-300">
                {item.ownerName}
              </span>
            )}
            {item.source === 'pull-request' && item.isDraft && (
              <span className="shrink-0 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-400">
                Draft
              </span>
            )}
          </div>
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
