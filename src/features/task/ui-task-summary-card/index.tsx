import { useRouter } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertCircle,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Terminal,
} from 'lucide-react';

import { NumberKey } from '@/common/context/keyboard-bindings/types';
import { formatKeyForDisplay } from '@/common/context/keyboard-bindings/utils';
import { Kbd } from '@/common/ui/kbd';
import { StatusIndicator } from '@/features/task/ui-status-indicator';
import type { TaskWithProject } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useCurrentVisibleProject } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';
import type { TaskStatus } from '@shared/types';

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
  const isDeleting = useBackgroundJobsStore((state) =>
    state.jobs.some(
      (job) =>
        job.status === 'running' &&
        job.type === 'task-deletion' &&
        job.taskId === task.id,
    ),
  );
  const { projectId } = useCurrentVisibleProject();

  // Check if any loaded step for this task has a pending permission or question
  // TODO(multi-step): This is a linear scan over all cached steps. Consider a
  // reverse mapping (stepId→taskId) or memoized selector if step count grows.
  const hasPendingPermission = useTaskMessagesStore((s) =>
    Object.values(s.steps).some(
      (step) => step.pendingPermission?.taskId === task.id,
    ),
  );
  const hasPendingQuestion = useTaskMessagesStore((s) =>
    Object.values(s.steps).some(
      (step) => step.pendingQuestion?.taskId === task.id,
    ),
  );
  const needsAttention = hasPendingPermission || hasPendingQuestion;
  const hasRunningCommand = useTaskMessagesStore(
    (s) => s.runCommandRunning[task.id] ?? false,
  );

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
        'flex cursor-pointer flex-col gap-1.5 rounded-lg px-3.5 py-2.5 transition-all duration-200 ease-out',
        'sidebar-card-enter',
        isDeleting && 'opacity-50',
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
              : task.hasUnread && task.status === 'completed'
                ? isSelected
                  ? 'completed-unread-border-selected'
                  : 'completed-unread-border'
                : isSelected
                  ? 'border border-blue-500 bg-neutral-800 shadow-sm'
                  : 'border border-transparent hover:translate-x-0.5 hover:bg-neutral-800/70',
      )}
    >
      {/* Top row: status, name, number badge */}
      <div className="flex items-center gap-1">
        {isDeleting ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-neutral-400" />
        ) : (
          <StatusIndicator status={task.status as TaskStatus} />
        )}
        {task.pullRequestId && (
          <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-green-500" />
        )}
        {hasRunningCommand && (
          <span title="Command running">
            <Terminal className="animate-command-running h-3.5 w-3.5 shrink-0 text-green-500" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
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
        ) : null}
      </div>

      {/* Bottom row: project tag, time */}
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span className="truncate">{projectName}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatRelativeTime(task.updatedAt)}
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
