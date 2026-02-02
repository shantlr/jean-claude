import { useRouter } from '@tanstack/react-router';
import { AlertCircle, GitBranch, GitPullRequest } from 'lucide-react';

import { ToggleableStatusIndicator } from '@/features/task/ui-status-indicator';
import { useToggleTaskUserCompleted } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';
import { getBranchFromWorktreePath } from '@/lib/worktree';
import { useTaskMessagesStore } from '@/stores/task-messages';

import type { Task } from '../../../../shared/types';

interface TaskWithMessageCount extends Task {
  messageCount?: number;
}

export function getUnreadCount(task: {
  status: string;
  messageCount?: number;
  lastReadIndex: number;
}): number {
  if (task.status === 'running') return 0;
  const messageCount = task.messageCount ?? 0;
  if (messageCount === 0) return 0;
  return Math.max(0, messageCount - 1 - task.lastReadIndex);
}

export function TaskListItem({
  task,
  projectId,
  isActive,
  projectName,
  projectColor,
}: {
  task: TaskWithMessageCount;
  projectId: string;
  isActive?: boolean;
  projectName?: string;
  projectColor?: string;
}) {
  const unreadCount = getUnreadCount(task);
  const taskState = useTaskMessagesStore((s) => s.tasks[task.id]);
  const toggleUserCompleted = useToggleTaskUserCompleted();
  const needsAttention =
    taskState?.pendingPermission || taskState?.pendingQuestion;

  const router = useRouter();

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => {
        router.navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: {
            projectId,
            taskId: task.id,
          },
        });
      }}
      className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 transition-colors ${
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <ToggleableStatusIndicator
          status={task.status}
          isChecked={task.userCompleted}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            toggleUserCompleted.mutate(task.id);
          }}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {task.name ?? task.prompt.split('\n')[0].slice(0, 50)}
          </span>
          {projectName && projectColor && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: projectColor }}
              />
              <span className="truncate">{projectName}</span>
            </div>
          )}
        </div>
        {needsAttention && (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        )}
        {unreadCount > 0 && !needsAttention && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
      {task.worktreePath && (
        <span
          className="flex items-center gap-1 text-xs text-neutral-500"
          title={getBranchFromWorktreePath(task.worktreePath)}
        >
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {getBranchFromWorktreePath(task.worktreePath)}
          </span>
        </span>
      )}
      {task.pullRequestUrl && (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <GitPullRequest className="h-3 w-3 shrink-0" />
          <span className="truncate">PR #{task.pullRequestId}</span>
        </span>
      )}
      <span className="text-xs text-neutral-500">
        {formatRelativeTime(task.createdAt)}
      </span>
    </div>
  );
}
