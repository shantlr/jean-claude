import { Link } from '@tanstack/react-router';
import { Plus, Settings } from 'lucide-react';

import { useProjects } from '@/hooks/use-projects';

import { ProjectTile } from './project-tile';

export function MainSidebar() {
  const { data: projects } = useProjects();

  return (
    <aside className="flex h-full w-[86px] flex-col border-r border-neutral-800 bg-neutral-900">
      {/* Project tiles */}
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-3 pb-3 pt-12">
        {projects?.map((project) => (
          <ProjectTile
            key={project.id}
            id={project.id}
            name={project.name}
            color={project.color}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center gap-2 border-t border-neutral-800 px-3 py-3">
        {/* Add project button */}
        <Link
          to="/projects/new"
          className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-neutral-600 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </Link>

        {/* Settings button */}
        <Link
          to="/settings"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white data-[status=active]:bg-neutral-800 data-[status=active]:text-white"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </aside>
  );
}
