import { useRouter, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import type { KeyboardEvent } from 'react';

import { getUnreadCount } from '@/features/task/ui-task-list-item';
import { useProjectTasks } from '@/hooks/use-tasks';
import { getInitials } from '@/lib/colors';

export function ProjectTile({
  id,
  name,
  color,
}: {
  id: string;
  name: string;
  color: string;
}) {
  const initials = getInitials(name);
  const { data: tasks } = useProjectTasks(id);

  const unreadCount =
    tasks?.reduce((sum, task) => sum + getUnreadCount(task), 0) ?? 0;
  const router = useRouter();

  const isActive = useRouterState({
    select: (state) => state.location.pathname.startsWith(`/projects/${id}`),
  });

  const handleClick = () => {
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: id },
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${name} project${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'group relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl text-sm font-bold text-white transition-transform hover:brightness-110',
        {
          'ring-2 ring-white': isActive,
        },
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold"
          aria-hidden
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
