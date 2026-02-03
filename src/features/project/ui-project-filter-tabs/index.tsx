import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useProjectFilter } from '@/stores/navigation';

import type { Project } from '../../../../shared/types';

export function ProjectFilterTabs({ projects }: { projects: Project[] }) {
  const { projectFilter, setProjectFilter } = useProjectFilter();

  // Sort projects by sortOrder
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
    [projects],
  );

  useCommands('project-filter-tabs', [
    {
      label: 'Next Tab',
      shortcut: 'cmd+right',
      hideInCommandPalette: true,
      handler: () => {
        const currentIndex = sortedProjects.findIndex(
          (p) => p.id === projectFilter,
        );
        const nextIndex =
          currentIndex === -1
            ? 0
            : (currentIndex + 1) % (sortedProjects.length + 1);
        if (nextIndex === sortedProjects.length) {
          setProjectFilter('all');
        } else {
          setProjectFilter(sortedProjects[nextIndex].id);
        }
      },
    },
    {
      label: 'Previous Tab',
      hideInCommandPalette: true,
      shortcut: 'cmd+left',
      handler: () => {
        const currentIndex = sortedProjects.findIndex(
          (p) => p.id === projectFilter,
        );
        const prevIndex =
          currentIndex === -1
            ? sortedProjects.length - 1
            : (currentIndex - 1 + (sortedProjects.length + 1)) %
              (sortedProjects.length + 1);
        if (prevIndex === sortedProjects.length) {
          setProjectFilter('all');
        } else {
          setProjectFilter(sortedProjects[prevIndex].id);
        }
      },
    },
  ]);

  // Scroll to active tab on mount or filter change
  useEffect(() => {
    const activeTab = document.querySelector(
      `[data-project-id="${projectFilter}"]`,
    );
    if (activeTab) {
      activeTab.scrollIntoView({ inline: 'center' });
    }
  }, [projectFilter]);

  return (
    <div className="no-scrollbar mx-2 flex items-center gap-1 overflow-x-auto px-2 py-1">
      {/* Add project button */}
      <Link
        to="/projects/new"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <Plus size={14} />
      </Link>

      {/* All tab */}
      <button
        onClick={() => setProjectFilter('all')}
        data-project-id="all"
        className={clsx(
          'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
          projectFilter === 'all'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
        )}
      >
        All
      </button>

      {/* Separator */}
      <div className="h-4 w-px shrink-0 bg-neutral-700" />

      {/* Project tabs */}
      {sortedProjects.map((project) => (
        <button
          key={project.id}
          onClick={() => setProjectFilter(project.id)}
          data-project-id={project.id}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
            projectFilter === project.id
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
          )}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="max-w-20 truncate">{project.name}</span>
        </button>
      ))}
    </div>
  );
}
