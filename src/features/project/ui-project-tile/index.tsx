import { useRouter, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';

import { getUnreadCount } from '@/features/task/ui-task-list-item';
import { useProjectTasks } from '@/hooks/use-tasks';
import { getInitials } from '@/lib/colors';

interface ProjectTileProps {
  id: string;
  name: string;
  color: string;
}

export function ProjectTile({ id, name, color }: ProjectTileProps) {
  const initials = getInitials(name);
  const { data: tasks } = useProjectTasks(id);

  const unreadCount =
    tasks?.reduce((sum, task) => sum + getUnreadCount(task), 0) ?? 0;
  const router = useRouter();

  const isActive = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith(`/projects/${id}`),
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        router.navigate({
          to: '/projects/$projectId',
          params: { projectId: id },
        });
      }}
      className={clsx(
        'cursor-pointer group relative flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 ',
        {
          'ring-white ring-2': isActive,
        },
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
