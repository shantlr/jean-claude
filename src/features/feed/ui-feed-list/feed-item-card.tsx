import { useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ArrowDownNarrowWide,
  Bot,
  ClipboardList,
  FolderOpen,
  GitMerge,
  GitPullRequest,
  ListTodo,
  Loader2,
  MessageSquare,
  Pin,
  PinOff,
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
import { useNewTaskDraftStore } from '@/stores/new-task-draft';
import { useOverlaysStore } from '@/stores/overlays';
import { useOpenReviewCommentCount } from '@/stores/review-comments';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

// ─── Status color mapping ────────────────────────────────────────
function statusColor(attention: FeedItemAttention): string {
  switch (attention) {
    case 'running':
    case 'needs-permission':
    case 'has-question':
    case 'interrupted':
      return 'var(--color-status-run)';
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

// ─── Rail constants ──────────────────────────────────────────────
const RAIL_W = 32; // rail column width in px
const NODE_X = 16; // center X of main node

// ─── Graph Node (circle) ─────────────────────────────────────────
function GraphNode({
  attention,
  isRunning,
  isSubtask,
}: {
  attention: FeedItemAttention;
  isRunning: boolean;
  isSubtask?: boolean;
}) {
  const color = statusColor(attention);
  const size = isSubtask ? 8 : 11;
  const left = isSubtask ? RAIL_W - 9 : NODE_X - 5;

  return (
    <div
      className={clsx(isRunning && !isSubtask && 'feed-node-pulse')}
      style={{
        position: 'absolute',
        left,
        top: isSubtask ? 14 : 14,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--color-bg-0)',
        border: `2px solid ${color}`,
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
  isFocused,
  onClick,
}: {
  label: string;
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
          : 'bg-status-azure/10 text-status-azure ring-status-azure/25 hover:bg-status-azure/20 hover:ring-status-azure/40',
      )}
    >
      <span className="opacity-70">◈</span>
      {label}
    </button>
  );
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
  const runningBgJobs = useRunningBackgroundJobsForTask(item.taskId ?? null);
  const pendingCommentCount = useOpenReviewCommentCount(item.taskId ?? '');
  const isDeleting = runningBgJobs.some((j) => j.type === 'task-deletion');
  const hasNonDeleteBgJob =
    runningBgJobs.length > 0 &&
    runningBgJobs.some((j) => j.type !== 'task-deletion');
  const menuRef = useRef<{ toggle: () => void } | null>(null);

  const isTask = item.source === 'task';
  const isRunning = item.attention === 'running';
  const hasChildren = !isSubtask && (item.children?.length ?? 0) > 0;
  const hasPr = isTask && !!item.pullRequestId;
  const prMerged = item.workItemPrStatus === 'completed';
  const showRail = isTask && !isSubtask && (hasChildren || hasPr);
  const isPrFocused = hasPr && currentPrId === String(item.pullRequestId);
  const dotColor = statusColor(item.attention);

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
    [navigate, item.projectId, item.pullRequestId],
  );

  const handleWorkItemClick = useCallback(
    (e: React.MouseEvent, workItemId: string) => {
      e.stopPropagation();
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
              'group/row relative flex cursor-pointer transition-colors',
              !showRail && 'border-b',
              isRunning
                ? 'feed-running-row border-transparent'
                : !showRail && 'border-line-soft',
              isSelected
                ? 'border-l-2 border-l-[var(--color-acc)]'
                : 'border-l-2 border-l-transparent',
              !isSelected && !isRunning && 'hover:bg-glass-light',
            )}
            style={{ minHeight: isSubtask ? 36 : 50 }}
          >
            {/* ─ Rail column (tasks) ─ */}
            {isTask && !isSubtask && (
              <div className="relative shrink-0" style={{ width: RAIL_W }}>
                {/* Vertical rail line */}
                {showRail && (
                  <div
                    className={clsx(isRunning && 'feed-running-rail')}
                    style={{
                      position: 'absolute',
                      left: NODE_X - 0.75,
                      top: 0,
                      bottom: 0,
                      width: 1.5,
                      background: dotColor,
                      opacity: 0.5,
                    }}
                  />
                )}
                {/* Main node */}
                <GraphNode attention={item.attention} isRunning={isRunning} />
              </div>
            )}

            {/* ─ Icon column (non-task items) ─ */}
            {!isTask && !isSubtask && (
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ width: RAIL_W }}
              >
                {item.source === 'work-item' && (
                  <ClipboardList className="text-status-azure h-3.5 w-3.5" />
                )}
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
                'flex min-w-0 flex-1 flex-col gap-0.5',
                isSubtask ? 'py-2 pr-3 pl-1' : 'py-2.5 pr-3.5',
              )}
            >
              {/* Work item chips row */}
              {item.workItemIds && item.workItemIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pb-0.5">
                  {item.workItemIds.map((wiId) => (
                    <WorkItemChip
                      key={wiId}
                      label={`#${wiId}`}
                      isFocused={currentWorkItemId === wiId}
                      onClick={(e) => handleWorkItemClick(e, wiId)}
                    />
                  ))}
                </div>
              )}

              {/* Title + time */}
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
                <span className="text-ink-3 mt-0.5 shrink-0 font-mono text-[9.5px]">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>

              {/* Bottom row: project + PR chip + attention indicators */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {!isSubtask && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: item.projectColor || 'var(--color-ink-4)',
                    }}
                  />
                )}
                {!isSubtask && (
                  <span className="text-ink-3 text-[11px]">
                    {item.projectName}
                  </span>
                )}

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
                <div className="text-status-run flex items-center gap-1 pt-0.5 text-[11px]">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">
                    {item.pendingMessage}
                  </span>
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
                parentColor={dotColor}
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
                  ? 'border-l-2 border-l-[var(--color-acc)]'
                  : 'border-l-2 border-l-transparent',
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
                    background: dotColor,
                    opacity: 0.5,
                  }}
                />
                <PrDiamond merged={prMerged} />
              </div>
              <div className="text-ink-3 flex flex-1 items-center gap-1.5 py-1.5 pr-3.5 text-[10.5px]">
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
                {(item.activeThreadCount ?? 0) > 0 && (
                  <span className="text-status-pr flex items-center gap-0.5">
                    <MessageSquare className="h-2.5 w-2.5" />
                    <span className="text-[9.5px]">
                      {item.activeThreadCount}
                    </span>
                  </span>
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
  parentColor,
  isRunning,
  isSelected,
}: {
  child: FeedItem;
  parentColor: string;
  isRunning: boolean;
  isSelected?: boolean;
}) {
  const navigate = useNavigate();
  const childColor = statusColor(child.attention);

  const handleClick = useCallback(() => {
    if (child.taskId) {
      navigate({
        to: '/all/$taskId',
        params: { taskId: child.taskId },
      });
    }
  }, [navigate, child.taskId]);

  const handleWorkItemClick = useCallback(
    (e: React.MouseEvent, workItemId: string) => {
      e.stopPropagation();
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

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'relative flex cursor-pointer transition-colors',
        isRunning && 'feed-running-row',
        !isRunning && !isSelected && 'hover:bg-glass-light',
        isSelected
          ? 'border-l-2 border-l-[var(--color-acc)]'
          : 'border-l-2 border-l-transparent',
      )}
      style={{ minHeight: 36 }}
    >
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
            background: parentColor,
            opacity: 0.5,
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
            stroke={childColor}
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
            className={clsx(isRunning && 'feed-running-branch')}
          />
        </svg>
        {/* Sub-task node */}
        <GraphNode
          attention={child.attention}
          isRunning={isRunning}
          isSubtask
        />
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
        {/* Sub-task work items */}
        {child.workItemIds && child.workItemIds.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {child.workItemIds.map((wiId) => (
              <WorkItemChip
                key={wiId}
                label={`#${wiId}`}
                onClick={(e) => handleWorkItemClick(e, wiId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
