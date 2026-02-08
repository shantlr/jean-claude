import { useRouter } from '@tanstack/react-router';
import clsx from 'clsx';
import { AlertCircle, GitPullRequest, MessageSquare } from 'lucide-react';

import { NumberKey } from '@/common/context/keyboard-bindings/types';
import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { Kbd } from '@/common/ui/kbd';
import { StatusIndicator } from '@/features/task/ui-status-indicator';
import type { TaskWithProject } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { TaskStatus } from '@shared/types';

function getUnreadCount(task: {
  status: string;
  messageCount?: number;
  lastReadIndex: number;
}): number {
  if (task.status === 'running') return 0;
  const messageCount = task.messageCount ?? 0;
  if (messageCount === 0) return 0;
  return Math.max(0, messageCount - 1 - task.lastReadIndex);
}

export function TaskSummaryCard({
  task,
  index,
  projectName,
  isSelected,
}: {
  task: TaskWithProject;
  index?: number;
  projectName: string;
  isSelected?: boolean;
}) {
  const router = useRouter();
  const unreadCount = getUnreadCount(task);
  const taskState = useTaskMessagesStore((s) => s.tasks[task.id]);
  const { projectId } = useCurrentVisibleProject();
  const hasPendingPermission = !!taskState?.pendingPermission;
  const hasPendingQuestion = !!taskState?.pendingQuestion;
  const needsAttention = hasPendingPermission || hasPendingQuestion;

  const displayNumber = index !== undefined ? index + 1 : undefined;
  const displayName = task.name ?? task.prompt.split('\n')[0].slice(0, 30);

  // Build tooltip with shortcut hint for tasks 1-9
  const shortcutHint =
    displayNumber !== undefined && displayNumber <= 9
      ? `${formatKeyForDisplay(`cmd+${displayNumber as unknown as NumberKey}`)}`
      : '';
  const cardTitle = `${shortcutHint}${displayName}`;

  const handleNavigate = () => {
    // If we're in "all" view, stay in all view
    if (projectId === 'all') {
      router.navigate({
        to: '/all/$taskId',
        params: { taskId: task.id },
      });
    } else {
      // Otherwise navigate to project-specific route
      router.navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: {
          projectId: task.projectId,
          taskId: task.id,
        },
      });
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      title={cardTitle}
      onClick={handleNavigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNavigate();
        }
      }}
      className={clsx(
        'flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 transition-colors',
        hasPendingPermission
          ? isSelected
            ? 'permission-border-selected'
            : 'permission-border'
          : hasPendingQuestion
            ? isSelected
              ? 'question-border-selected'
              : 'question-border'
            : task.status === 'running'
              ? isSelected
                ? 'running-border-selected'
                : 'running-border'
              : isSelected
                ? 'border border-blue-500 bg-neutral-700'
                : 'border border-transparent hover:bg-neutral-800',
      )}
    >
      {/* Top row: status, name, number badge */}
      <div className="flex items-center gap-1">
        <StatusIndicator status={task.status as TaskStatus} />
        {task.pullRequestId && (
          <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-green-500" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {displayName}
        </span>
        {displayNumber !== undefined && displayNumber <= 9 && (
          <Kbd
            shortcut={`cmd+${displayNumber.toString() as '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'}`}
            className="mr-0.5"
          />
        )}
        {needsAttention ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        ) : unreadCount > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </div>

      {/* Bottom row: project tag, time */}
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="truncate">{projectName}</span>
        <span className="ml-auto shrink-0">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>

      {/* Pending message row */}
      {task.pendingMessage && (
        <div className="flex items-center gap-1 text-xs text-amber-400">
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.pendingMessage}</span>
        </div>
      )}
    </div>
  );
}
