import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useProjects } from '@/hooks/use-projects';
import { useProjectFilter } from '@/stores/navigation';

export function ProjectOverlay({ onClose }: { onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const { projectFilter, setProjectFilter } = useProjectFilter();

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
    [projects],
  );

  useCommands('project-overlay', [
    {
      label: 'Close Project Overlay',
      shortcut: 'escape',
      handler: () => {
        onClose();
      },
      hideInCommandPalette: true,
    },
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[72svh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Switch Project</h2>
            <p className="text-xs text-neutral-400">
              Choose a project to filter the sidebar task list.
            </p>
          </div>
          <Link
            to="/projects/new"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
          >
            <Plus size={12} />
            <span>New Project</span>
          </Link>
        </div>

        <div className="grid gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setProjectFilter('all');
              onClose();
            }}
            className={clsx(
              'rounded-lg border px-3 py-4 text-left transition-colors',
              projectFilter === 'all'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-700 bg-neutral-800/80 hover:border-neutral-600 hover:bg-neutral-800',
            )}
          >
            <p className="text-xs text-neutral-400">Overview</p>
            <p className="mt-1 text-sm font-medium text-white">All Projects</p>
          </button>

          {sortedProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                setProjectFilter(project.id);
                onClose();
              }}
              className={clsx(
                'rounded-lg border px-3 py-4 text-left transition-colors',
                projectFilter === project.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-neutral-700 bg-neutral-800/80 hover:border-neutral-600 hover:bg-neutral-800',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <p className="truncate text-sm font-medium text-white">
                  {project.name}
                </p>
              </div>
              <p className="mt-2 truncate text-xs text-neutral-400">
                {project.path}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
