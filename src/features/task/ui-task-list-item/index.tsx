import { Link } from '@tanstack/react-router';

import { StatusIndicator } from '@/common/ui/status-indicator';
import { formatRelativeTime } from '@/lib/time';

import type { Task } from '../../../../shared/types';

interface TaskListItemProps {
  task: Task;
  projectId: string;
  isActive?: boolean;
}

export function isTaskUnread(task: Task): boolean {
  if (task.status === 'running') return false;
  if (!task.readAt) return true;
  return new Date(task.updatedAt) > new Date(task.readAt);
}

export function TaskListItem({ task, projectId, isActive }: TaskListItemProps) {
  const unread = isTaskUnread(task);

  return (
    <Link
      to="/projects/$projectId/tasks/$taskId"
      params={{ projectId, taskId: task.id }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
    >
      <StatusIndicator status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.name}</span>
          {unread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>
    </Link>
  );
}
