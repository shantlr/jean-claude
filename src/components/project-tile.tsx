import { Link } from '@tanstack/react-router';

import { useProjectTasks } from '@/hooks/use-tasks';
import { getInitials } from '@/lib/colors';

import { isTaskUnread } from './task-list-item';

interface ProjectTileProps {
  id: string;
  name: string;
  color: string;
}

export function ProjectTile({ id, name, color }: ProjectTileProps) {
  const initials = getInitials(name);
  const { data: tasks } = useProjectTasks(id);

  const unreadCount = tasks?.filter(isTaskUnread).length ?? 0;

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className="group relative flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 data-[status=active]:ring-2 data-[status=active]:ring-white"
      style={{ backgroundColor: color }}
    >
      {initials}
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
