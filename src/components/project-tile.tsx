import { Link } from '@tanstack/react-router';

import { getInitials } from '@/lib/colors';

interface ProjectTileProps {
  id: string;
  name: string;
  color: string;
}

export function ProjectTile({ id, name, color }: ProjectTileProps) {
  const initials = getInitials(name);

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className="group relative flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-all hover:rounded-2xl hover:brightness-110 data-[status=active]:ring-2 data-[status=active]:ring-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </Link>
  );
}
