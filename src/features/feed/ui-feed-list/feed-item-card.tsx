import { useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ArrowDownNarrowWide,
  Bug,
  Bot,
  CircleHelp,
  ClipboardList,
  FolderOpen,
  GitMerge,
  GitPullRequest,
  ListTodo,
  Loader2,
  MessageSquare,
  Pin,
  ShieldAlert,
  ShieldQuestion,
  PinOff,
  StickyNote,
  Terminal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  Dropdown,
  DropdownDivider,
  DropdownInfo,
  DropdownItem,
} from '@/common/ui/dropdown';
import { ProjectLogoBackground } from '@/features/project/ui-project-logo';
import { PrAutoComplete } from '@/features/pull-request/ui-pr-auto-complete';
import { CompleteTaskDialog } from '@/features/task/ui-task-panel/complete-task-dialog';
import { usePullRequest } from '@/hooks/use-pull-requests';
import { useCompleteTask, useTask } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';
import {
  bgJobLabel,
  useRunningBackgroundJobsForTask,
} from '@/stores/background-jobs';
import { useFeedStore } from '@/stores/feed';
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { useOpenReviewCommentCount } from '@/stores/review-comments';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

import { useFeedItemProject } from './use-feed-item-project';

// ─── Status color mapping ────────────────────────────────────────
function statusColor(attention: FeedItemAttention): string {
  switch (attention) {
    case 'running':
    case 'interrupted':
      return 'var(--color-status-run)';
    case 'needs-permission':
      return 'var(--color-status-run)';
    case 'has-question':
      return 'var(--color-status-azure)';
    case 'completed':
      return 'var(--color-status-done)';
    case 'errored':
      return 'var(--color-status-fail)';
    case 'review-requested':
    case 'pr-comments':
    case 'pr-approved-by-me':
      return 'var(--color-status-pr)';
    case 'assigned-work-item':
      return 'var(--color-status-azure)';
    case 'waiting':
    case 'note':
    default:
      return 'var(--color-ink-4)';
  }
}

function FeedProjectLabel({ item }: { item: FeedItem }) {
  const project = useFeedItemProject(item);

  return (
    <span className="min-w-0">
      <span className="text-ink-3 text-[11px]">{project.name}</span>
    </span>
  );
}

function FeedProjectBackgroundLogo({ item }: { item: FeedItem }) {
  const project = useFeedItemProject(item);

  return (
    <ProjectLogoBackground
      project={{
        name: project.name,
        color: project.color,
        logoPath: project.logoPath,
      }}
      showColorFallback
      fixedHeight
    />
  );
}

// ─── Rail constants ──────────────────────────────────────────────
const RAIL_W = 32; // rail column width in px
const NODE_X = 16; // center X of main node
const FEED_RAIL_COLOR = 'var(--color-ink-4)';

function isModifiedClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

function openExternalUrl(url: string | undefined): boolean {
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

// ─── Graph Node (circle or attention icon) ──────────────────────
function GraphNode({
  attention,
  isSubtask,
}: {
  attention: FeedItemAttention;
  isSubtask?: boolean;
}) {
  const color = statusColor(attention);
  const needsPermission = attention === 'needs-permission';
  const hasQuestion = attention === 'has-question';
  const needsAttention = needsPermission || hasQuestion;

  // For attention states, render icon instead of circle
  if (needsAttention) {
    const iconSize = isSubtask ? 12 : 14;
    const left = isSubtask
      ? RAIL_W - 9 - iconSize / 2 + 4
      : NODE_X - iconSize / 2;
    return (
      <div
        className={clsx(
          needsPermission
            ? 'feed-node-pulse-permission'
            : 'feed-node-pulse-question',
        )}
        style={{
          position: 'absolute',
          left,
          top: 14 - 1,
          width: iconSize,
          height: iconSize,
          zIndex: 2,
          color,
          borderRadius: 3,
        }}
      >
        {needsPermission ? (
          <ShieldAlert style={{ width: iconSize, height: iconSize }} />
        ) : (
          <CircleHelp style={{ width: iconSize, height: iconSize }} />
        )}
      </div>
    );
  }

  const size = isSubtask ? 8 : 11;
  const left = isSubtask ? RAIL_W - 9 : NODE_X - 5;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: isSubtask ? 14 : 14,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--color-bg-0)',
        border: `2px solid ${FEED_RAIL_COLOR}`,
        zIndex: 2,
      }}
    />
  );
}

// ─── PR Diamond (merge node) ─────────────────────────────────────
function PrDiamond({ merged }: { merged: boolean }) {
  const color = merged ? 'var(--color-status-done)' : 'var(--color-status-pr)';
  return (
    <div
      style={{
        position: 'absolute',
        left: NODE_X - 5,
        top: '50%',
        marginTop: -5,
        width: 10,
        height: 10,
        transform: 'rotate(45deg)',
        background: color,
        border: '1px solid var(--color-bg-0)',
        zIndex: 2,
      }}
    />
  );
}

// ─── Work Item Chip (clickable) ──────────────────────────────────
function WorkItemChip({
  label,
  type,
  isFocused,
  onClick,
}: {
  label: string;
  type?: string | null;
  isFocused?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex cursor-pointer items-center gap-0.5 rounded px-1.5 py-0 font-mono text-[9.5px] ring-1 transition-colors',
        isFocused
          ? 'bg-acc/20 text-acc-ink ring-acc/50 shadow-[0_0_12px_oklch(0.72_0.20_295_/_0.4),0_0_4px_oklch(0.72_0.20_295_/_0.25)]'
          : workItemChipColorClass(type),
      )}
    >
      <span className="opacity-70">◈</span>
      {label}
    </button>
  );
}

function workItemChipColorClass(type?: string | null): string {
  switch (type) {
    case 'Bug':
      return 'bg-status-fail/10 text-status-fail ring-status-fail/25 hover:bg-status-fail/20 hover:ring-status-fail/40';
    case 'User Story':
    case 'Feature':
      return 'bg-status-azure/10 text-status-azure ring-status-azure/25 hover:bg-status-azure/20 hover:ring-status-azure/40';
    case 'Task':
      return 'bg-status-run/10 text-status-run ring-status-run/25 hover:bg-status-run/20 hover:ring-status-run/40';
    default:
      return 'bg-status-azure/10 text-status-azure ring-status-azure/25 hover:bg-status-azure/20 hover:ring-status-azure/40';
  }
}

// ─── Complete Task Button (isolated to avoid hooks in every card) ─
function CompleteTaskButton({ taskId }: { taskId: string }) {
  const completeTask = useCompleteTask();
  const { data: taskData } = useTask(taskId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const handleConfirm = useCallback(
    ({ cleanupWorktree }: { cleanupWorktree: boolean }) => {
      setIsDialogOpen(false);
      completeTask.mutate({ id: taskId, cleanupWorktree });
    },
    [taskId, completeTask],
  );

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsDialogOpen(true);
        }}
        className="text-status-done hover:bg-status-done/15 ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
      >
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </button>
      <CompleteTaskDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleConfirm}
        hasWorktree={!!taskData?.worktreePath}
        isPending={completeTask.isPending}
      />
    </>
  );
}

function RailPrAutoCompleteButton({
  projectId,
  prId,
  canSet,
}: {
  projectId: string;
  prId: number;
  canSet: boolean;
}) {
  const { data: pr, isLoading } = usePullRequest(projectId, prId);

  if (isLoading) {
    return (
      <span className="text-ink-3 ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading
      </span>
    );
  }

  if (!pr || pr.status !== 'active' || pr.isDraft) {
    return null;
  }

  if (!pr.autoCompleteSetBy && !canSet) {
    return null;
  }

  return <PrAutoComplete pr={pr} projectId={projectId} variant="compact" />;
}

// ─── Main FeedItemCard ───────────────────────────────────────────
export function FeedItemCard({
  item,
  isSelected,
  isSubtask,
  isDraggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  item: FeedItem;
  isSelected?: boolean;
  isSubtask?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = (params as { taskId?: string }).taskId;
  const currentWorkItemId = (params as { workItemId?: string }).workItemId;
  const currentPrId = (params as { prId?: string }).prId;
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
  const hasRunningCommand = runningCommands.length > 0;
  const runningBgJobs = useRunningBackgroundJobsForTask(item.taskId ?? null);
  const pendingCommentCount = useOpenReviewCommentCount(item.taskId ?? '');
  const isDeleting = runningBgJobs.some((j) => j.type === 'task-deletion');
  const isCompleting = runningBgJobs.some((j) => j.type === 'task-completion');
  const hasNonDeleteBgJob =
    runningBgJobs.length > 0 &&
    runningBgJobs.some((j) => j.type !== 'task-deletion');
  const menuRef = useRef<{ toggle: () => void } | null>(null);

  const isTask = item.source === 'task';
  const isRunning = item.attention === 'running';
  const hasUnread = Boolean(item.hasUnread);
  const needsPermission = item.attention === 'needs-permission';
  const hasQuestion = item.attention === 'has-question';
  const needsAttention = needsPermission || hasQuestion;
  const hasChildren = !isSubtask && (item.children?.length ?? 0) > 0;
  const hasPr = isTask && !!item.pullRequestId;
  const prMerged = item.workItemPrStatus === 'completed';
  const prHasConflicts = item.pullRequestMergeStatus === 'conflicts';
  const prApprovalCount = item.approvedBy?.length ?? 0;
  const showRail = isTask && !isSubtask && (hasChildren || hasPr);
  const isPrFocused = hasPr && currentPrId === String(item.pullRequestId);
  const canSetPrAutoComplete =
    hasPr &&
    prApprovalCount > 0 &&
    !prMerged &&
    !prHasConflicts &&
    !item.isDraft &&
    !!item.pullRequestId;
  const showRailPrAutoComplete =
    hasPr && !prMerged && !item.isDraft && !!item.pullRequestId;

  // Complete task (for merged PRs)
  const canComplete =
    isTask && prMerged && !!item.taskId && !item.isCompleted && !isCompleting;

  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      if (
        e &&
        item.source === 'work-item' &&
        isModifiedClick(e) &&
        openExternalUrl(item.workItemUrl)
      ) {
        return;
      }

      if (
        e &&
        item.source === 'pull-request' &&
        isModifiedClick(e) &&
        openExternalUrl(item.pullRequestUrl)
      ) {
        return;
      }

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
    },
    [navigate, item],
  );

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

  const openOverlay = useOverlaysStore((s) => s.open);
  const setDraftProjectId = useNewTaskDraftStore((s) => s.setSelectedProjectId);
  const setDraft = useNewTaskDraftStore((s) => s.setDraft);

  const handleCreateSubtask = useCallback(() => {
    if (!item.taskId) return;
    setDraftProjectId(item.projectId);
    setDraft(item.projectId, { parentTaskId: item.taskId });
    openOverlay('new-task');
    menuRef.current?.toggle();
  }, [item, setDraftProjectId, setDraft, openOverlay]);

  const handlePrClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isModifiedClick(e) && openExternalUrl(item.pullRequestUrl)) {
        return;
      }
      if (item.pullRequestId) {
        navigate({
          to: '/all/prs/$projectId/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
      }
    },
    [navigate, item.projectId, item.pullRequestId, item.pullRequestUrl],
  );

  const handleWorkItemClick = useCallback(
    (e: React.MouseEvent, workItemId: string, workItemUrl?: string) => {
      e.stopPropagation();
      if (isModifiedClick(e) && openExternalUrl(workItemUrl)) {
        return;
      }
      navigate({
        to: '/all/work-items/$projectId/$workItemId',
        params: {
          projectId: item.projectId,
          workItemId,
        },
      });
    },
    [navigate, item.projectId],
  );

  return (
    <Dropdown
      variant="bright"
      trigger={({ triggerRef }) => (
        <div
          ref={triggerRef as React.Ref<HTMLDivElement>}
          className={clsx(
            isDeleting && 'opacity-50',
            showRail && 'border-line-soft border-b',
          )}
        >
          {/* ─── Main row with graph rail ─── */}
          <div
            role="link"
            tabIndex={0}
            data-feed-selected={isSelected ? 'true' : 'false'}
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
              'group/row relative flex cursor-pointer overflow-hidden transition-colors',
              !showRail && 'border-b',
              isRunning
                ? [
                    'feed-running-row border-transparent',
                    hasRunningCommand && 'feed-command-running-row',
                    isSelected && 'feed-running-row-focused',
                    isSelected &&
                      hasRunningCommand &&
                      'feed-command-running-row-focused',
                  ]
                : needsPermission
                  ? 'feed-permission-row border-transparent'
                  : hasQuestion
                    ? 'feed-question-row border-transparent'
                    : hasUnread
                      ? 'feed-unread-row border-transparent'
                      : !showRail && 'border-line-soft',
              isSelected
                ? 'border-l-[3px] border-l-[var(--color-acc)]'
                : 'border-l-[3px] border-l-transparent',
              !isSelected &&
                !isRunning &&
                !needsAttention &&
                !hasUnread &&
                'hover:bg-glass-light',
            )}
            style={{ minHeight: isSubtask ? 36 : 50 }}
          >
            {!isSubtask && <FeedProjectBackgroundLogo item={item} />}
            {hasRunningCommand && (
              <div className="feed-command-running-bottom-border" />
            )}
            {/* ─ Rail column (tasks) ─ */}
            {isTask && !isSubtask && (
              <div className="relative shrink-0" style={{ width: RAIL_W }}>
                {/* Vertical rail line */}
                {showRail && (
                  <div
                    style={{
                      position: 'absolute',
                      left: NODE_X - 0.75,
                      top: 0,
                      bottom: 0,
                      width: 1.5,
                      background: FEED_RAIL_COLOR,
                      opacity: 0.45,
                    }}
                  />
                )}
                {/* Main node */}
                {showRail && <GraphNode attention={item.attention} />}
              </div>
            )}

            {/* ─ Icon column (non-task items) ─ */}
            {!isTask && !isSubtask && (
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ width: RAIL_W }}
              >
                {item.source === 'work-item' &&
                  (item.workItemType === 'Bug' ? (
                    <Bug className="text-status-fail h-3.5 w-3.5" />
                  ) : (
                    <ClipboardList className="text-status-azure h-3.5 w-3.5" />
                  ))}
                {item.source === 'pull-request' && (
                  <GitPullRequest className="text-status-pr h-3.5 w-3.5" />
                )}
                {item.source === 'note' && (
                  <StickyNote className="text-ink-3 h-3.5 w-3.5" />
                )}
              </div>
            )}

            {/* ─ Content column ─ */}
            <div
              className={clsx(
                'flex min-w-0 flex-1 flex-col gap-0.5 transition-[padding] duration-150',
                isSubtask ? 'py-2 pr-3 pl-1' : 'py-2.5 pr-3.5',
                isSelected && 'pl-3',
              )}
            >
              {/* Work item chips row */}
              {item.workItemIds && item.workItemIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pb-0.5">
                  {item.workItemIds.map((wiId, index) => (
                    <WorkItemChip
                      key={wiId}
                      label={`#${wiId}`}
                      type={item.workItemTypes?.[index]}
                      isFocused={currentWorkItemId === wiId}
                      onClick={(e) =>
                        handleWorkItemClick(e, wiId, item.workItemUrls?.[index])
                      }
                    />
                  ))}
                </div>
              )}

              {/* Title */}
              <div className="flex items-start gap-1.5">
                {item.taskType === 'skill-creation' && (
                  <Bot className="text-status-pr mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span
                  className={clsx(
                    'min-w-0 flex-1 truncate leading-snug',
                    isSubtask
                      ? 'text-ink-2 text-[11.5px]'
                      : isSelected
                        ? 'text-ink-0 text-[12.5px] font-medium'
                        : 'text-ink-1 text-[12.5px]',
                  )}
                >
                  {item.title}
                </span>
              </div>

              {/* Bottom row: project + time + status */}
              <div className="flex flex-wrap items-center gap-1.5">
                {!isSubtask && <FeedProjectLabel item={item} />}
                <span className="text-ink-3/80 ml-auto shrink-0 font-mono text-[9.5px]">
                  {formatRelativeTime(item.timestamp)}
                </span>

                {/* PR status badges for work items (non-task) */}
                {item.source === 'work-item' &&
                  item.workItemPrStatus &&
                  item.workItemPrStatus !== 'active' && (
                    <span
                      className={clsx(
                        'flex items-center gap-0.5 text-[10px]',
                        item.workItemPrStatus === 'completed'
                          ? 'text-status-pr'
                          : 'text-ink-3',
                      )}
                    >
                      {item.workItemPrStatus === 'completed' ? (
                        <GitMerge className="h-3 w-3" />
                      ) : (
                        <GitPullRequest className="h-3 w-3" />
                      )}
                      {item.workItemPrStatus === 'completed'
                        ? 'Merged'
                        : 'Abandoned'}
                    </span>
                  )}

                {/* PR thread count */}
                {item.source === 'pull-request' &&
                  (item.activeThreadCount ?? 0) > 0 && (
                    <span className="text-status-pr flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      <span className="text-[10px]">
                        {item.activeThreadCount}
                      </span>
                    </span>
                  )}

                {/* Draft badge (non-task items only, task draft shown in PR rail) */}
                {item.isDraft && item.source !== 'task' && (
                  <span className="border-glass-border text-ink-3 rounded border px-1 py-0 text-[9px]">
                    Draft
                  </span>
                )}

                {/* Work item state badge */}
                {item.source === 'work-item' && item.workItemState && (
                  <span className="bg-status-azure/15 text-status-azure ring-status-azure/30 ml-auto rounded px-1.5 py-0 text-[10px] font-medium ring-1">
                    {item.workItemState}
                  </span>
                )}
              </div>

              {/* Pending message */}
              {item.source === 'task' && item.pendingMessage && (
                <div
                  className={clsx(
                    'flex items-center gap-1 pt-0.5 text-[11px]',
                    hasQuestion ? 'text-status-azure' : 'text-status-run',
                  )}
                >
                  {needsPermission ? (
                    <ShieldQuestion className="h-3 w-3 shrink-0" />
                  ) : (
                    <MessageSquare className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 truncate">
                    {item.pendingMessage}
                  </span>
                </div>
              )}

              {/* Permission/question indicator when no pending message text */}
              {item.source === 'task' &&
                !item.pendingMessage &&
                needsAttention && (
                  <div
                    className={clsx(
                      'flex items-center gap-1 pt-0.5 text-[11px]',
                      hasQuestion ? 'text-status-azure' : 'text-status-run',
                    )}
                  >
                    {needsPermission ? (
                      <>
                        <ShieldQuestion className="h-3 w-3 shrink-0" />
                        <span>Waiting for permission</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span>Waiting for answer</span>
                      </>
                    )}
                  </div>
                )}

              {/* Pending review comments */}
              {item.source === 'task' && pendingCommentCount > 0 && (
                <div className="bg-status-pr/10 ring-status-pr/20 mt-0.5 flex items-center gap-1.5 rounded px-2 py-0.5 ring-1">
                  <MessageSquare className="text-status-pr h-3 w-3 shrink-0" />
                  <span className="text-status-pr text-[11px] font-medium">
                    {pendingCommentCount} pending{' '}
                    {pendingCommentCount === 1 ? 'comment' : 'comments'}
                  </span>
                </div>
              )}

              {/* Running commands */}
              {runningCommands.length > 0 && (
                <div className="bg-status-done/10 ring-status-done/20 mt-0.5 flex items-center gap-1.5 rounded px-2 py-0.5 ring-1">
                  <Terminal className="text-status-done animate-command-running h-3 w-3 shrink-0" />
                  <span className="text-status-done min-w-0 truncate text-[11px]">
                    {runningCommands.map((c) => c.command).join(', ')}
                  </span>
                </div>
              )}

              {/* Background jobs */}
              {hasNonDeleteBgJob && (
                <div className="bg-acc/10 ring-acc/20 mt-0.5 flex items-center gap-1.5 rounded px-2 py-0.5 ring-1">
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
          </div>

          {/* ─── Sub-task rows (branch off main rail) ─── */}
          {hasChildren &&
            item.children!.map((child) => (
              <SubtaskRow
                key={child.id}
                child={child}
                currentWorkItemId={currentWorkItemId}
                isRunning={child.attention === 'running'}
                isSelected={child.taskId === currentTaskId}
              />
            ))}

          {/* ─── PR merge node at bottom ─── */}
          {hasPr && !isSubtask && (
            <div
              className={clsx(
                'relative flex cursor-pointer transition-colors',
                'hover:bg-glass-light',
                isPrFocused
                  ? 'border-l-[3px] border-l-[var(--color-acc)]'
                  : 'border-l-[3px] border-l-transparent',
              )}
              style={{ minHeight: 30 }}
              onClick={handlePrClick}
            >
              <div className="relative shrink-0" style={{ width: RAIL_W }}>
                {/* Rail line from node down to diamond */}
                <div
                  style={{
                    position: 'absolute',
                    left: NODE_X - 0.75,
                    top: 0,
                    bottom: 14,
                    width: 1.5,
                    background: FEED_RAIL_COLOR,
                    opacity: 0.45,
                  }}
                />
                <PrDiamond merged={prMerged} />
              </div>
              <div className="flex flex-1 flex-col gap-1 py-1.5 pr-3.5">
                <div className="text-ink-3 flex items-center gap-1.5 text-[10.5px]">
                  <span
                    className={clsx(
                      'font-mono',
                      prMerged ? 'text-status-done' : 'text-status-pr',
                    )}
                  >
                    {prMerged ? (
                      <GitMerge className="inline h-3 w-3" />
                    ) : (
                      <GitPullRequest className="inline h-3 w-3" />
                    )}{' '}
                    #{item.pullRequestId}
                  </span>
                  <span>{prMerged ? 'merged' : 'open'}</span>
                  {item.isDraft && (
                    <span className="border-glass-border text-ink-3 rounded border px-1 py-0 text-[9px]">
                      Draft
                    </span>
                  )}
                  {prApprovalCount > 0 && (
                    <span
                      className="text-status-done flex items-center gap-0.5"
                      title={item.approvedBy
                        ?.map((reviewer) => reviewer.displayName)
                        .join(', ')}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span className="text-[9.5px]">
                        {prApprovalCount === 1
                          ? 'Approved'
                          : `${prApprovalCount} approvals`}
                      </span>
                    </span>
                  )}
                  {prHasConflicts && (
                    <span className="text-status-fail flex items-center gap-0.5">
                      <XCircle className="h-2.5 w-2.5" />
                      <span className="text-[9.5px]">Conflicts</span>
                    </span>
                  )}
                  {(item.activeThreadCount ?? 0) > 0 && (
                    <span className="text-status-pr flex items-center gap-0.5">
                      <MessageSquare className="h-2.5 w-2.5" />
                      <span className="text-[9.5px]">
                        {item.activeThreadCount}
                      </span>
                    </span>
                  )}
                  {canComplete && <CompleteTaskButton taskId={item.taskId!} />}
                </div>
                {showRailPrAutoComplete && item.pullRequestId && (
                  <RailPrAutoCompleteButton
                    projectId={item.projectId}
                    prId={item.pullRequestId}
                    canSet={canSetPrAutoComplete}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
      dropdownRef={menuRef}
      className="min-w-[180px]"
    >
      <DropdownItem
        onClick={handlePin}
        shortcut="cmd+shift+p"
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
        shortcut="cmd+shift+l"
        icon={<ArrowDownNarrowWide className="text-ink-2" />}
      >
        {isLowPriority ? 'Remove low priority' : 'Mark low priority'}
      </DropdownItem>
      <DropdownItem
        onClick={handleDismiss}
        shortcut="cmd+shift+d"
        icon={<XCircle className="text-ink-2" />}
      >
        Dismiss
      </DropdownItem>
      {item.source === 'task' && item.taskId && (
        <DropdownItem
          onClick={handleCreateSubtask}
          icon={<ListTodo className="text-ink-2" />}
        >
          Create sub-task
        </DropdownItem>
      )}
      <DropdownDivider />
      <DropdownItem
        onClick={handleOpenInProject}
        shortcut="cmd+shift+o"
        icon={<FolderOpen className="text-ink-2" />}
      >
        Open in project
      </DropdownItem>
      <DropdownDivider />
      <DropdownInfo label="Menu shortcut" value="Shift+F10" />
    </Dropdown>
  );
}

// ─── SubtaskRow (renders with branch connector from parent rail) ──
function SubtaskRow({
  child,
  currentWorkItemId,
  isRunning,
  isSelected,
}: {
  child: FeedItem;
  currentWorkItemId?: string;
  isRunning: boolean;
  isSelected?: boolean;
}) {
  const navigate = useNavigate();
  const childRunCommandStatus = useTaskMessagesStore((s) =>
    child.taskId ? s.runCommandRunning[child.taskId] : undefined,
  );
  const childRunningCommands = useMemo(
    () =>
      childRunCommandStatus?.commands.filter((c) => c.status === 'running') ??
      [],
    [childRunCommandStatus],
  );
  const childHasRunningCommand = childRunningCommands.length > 0;

  const handleClick = useCallback(() => {
    if (child.taskId) {
      navigate({
        to: '/all/$taskId',
        params: { taskId: child.taskId },
      });
    }
  }, [navigate, child.taskId]);

  const handleWorkItemClick = useCallback(
    (e: React.MouseEvent, workItemId: string, workItemUrl?: string) => {
      e.stopPropagation();
      if (isModifiedClick(e) && openExternalUrl(workItemUrl)) {
        return;
      }
      navigate({
        to: '/all/work-items/$projectId/$workItemId',
        params: {
          projectId: child.projectId,
          workItemId,
        },
      });
    },
    [navigate, child.projectId],
  );

  const childNeedsPermission = child.attention === 'needs-permission';
  const childHasQuestion = child.attention === 'has-question';
  const childNeedsAttention = childNeedsPermission || childHasQuestion;

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'relative flex cursor-pointer transition-colors',
        isRunning && 'feed-running-row',
        isRunning && childHasRunningCommand && 'feed-command-running-row',
        isRunning && isSelected && 'feed-running-row-focused',
        isRunning &&
          isSelected &&
          childHasRunningCommand &&
          'feed-command-running-row-focused',
        !isRunning && childNeedsPermission && 'feed-permission-row',
        !isRunning && childHasQuestion && 'feed-question-row',
        !isRunning &&
          !childNeedsAttention &&
          !child.hasUnread &&
          !isSelected &&
          'hover:bg-glass-light',
        child.hasUnread &&
          !isRunning &&
          !childNeedsAttention &&
          'feed-unread-row',
        isSelected
          ? 'border-l-[3px] border-l-[var(--color-acc)]'
          : 'border-l-[3px] border-l-transparent',
      )}
      style={{ minHeight: 36 }}
    >
      {childHasRunningCommand && (
        <div className="feed-command-running-bottom-border" />
      )}
      {/* Rail with branch SVG */}
      <div className="relative shrink-0" style={{ width: RAIL_W }}>
        {/* Parent rail continues */}
        <div
          style={{
            position: 'absolute',
            left: NODE_X - 0.75,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: FEED_RAIL_COLOR,
            opacity: 0.45,
          }}
        />
        {/* Branch curve */}
        <svg
          width={RAIL_W}
          height={36}
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        >
          <path
            d={`M ${NODE_X} 0 L ${NODE_X} 12 Q ${NODE_X} 18 ${NODE_X + 7} 18 L ${RAIL_W - 6} 18`}
            stroke={FEED_RAIL_COLOR}
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />
        </svg>
        {/* Sub-task node */}
        <GraphNode attention={child.attention} isSubtask />
      </div>

      {/* Sub-task content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3.5 pl-1">
        <div className="flex items-center gap-1.5">
          <span className="text-ink-2 min-w-0 flex-1 truncate text-[11.5px]">
            {child.title}
          </span>
          <span className="text-ink-4 shrink-0 font-mono text-[9px]">
            {formatRelativeTime(child.timestamp)}
          </span>
        </div>
        {/* Permission/question indicator */}
        {childNeedsAttention && (
          <div
            className={clsx(
              'flex items-center gap-1 pt-0.5 text-[10px]',
              childHasQuestion ? 'text-status-azure' : 'text-status-run',
            )}
          >
            {childNeedsPermission ? (
              <>
                <ShieldQuestion className="h-2.5 w-2.5 shrink-0" />
                <span>Waiting for permission</span>
              </>
            ) : (
              <>
                <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                <span>Waiting for answer</span>
              </>
            )}
          </div>
        )}
        {/* Sub-task work items */}
        {child.workItemIds && child.workItemIds.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {child.workItemIds.map((wiId, index) => (
              <WorkItemChip
                key={wiId}
                label={`#${wiId}`}
                type={child.workItemTypes?.[index]}
                isFocused={currentWorkItemId === wiId}
                onClick={(e) =>
                  handleWorkItemClick(e, wiId, child.workItemUrls?.[index])
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
