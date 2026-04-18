import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useProjects } from '@/hooks/use-projects';
import { useCurrentVisibleProject } from '@/stores/navigation';

const PROJECT_OVERLAY_GRID_COLUMNS = 3;

const PROJECT_OVERLAY_LG_GRID_CLASS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

export function ProjectOverlay({ onClose }: { onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const { projectId, moveToProject } = useCurrentVisibleProject();

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
    [projects],
  );

  const options = useMemo(
    () => ['all' as const, ...sortedProjects.map((project) => project.id)],
    [sortedProjects],
  );

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option === projectId),
    [options, projectId],
  );

  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex >= 0) {
      setHighlightedIndex(selectedIndex);
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (highlightedIndex >= options.length) {
      setHighlightedIndex(Math.max(0, options.length - 1));
    }
  }, [highlightedIndex, options.length, selectedIndex]);

  const moveHighlight = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (options.length === 0) {
        return;
      }

      setHighlightedIndex((current) => {
        const safeCurrent =
          current >= 0 && current < options.length ? current : 0;

        const rowStart =
          Math.floor(safeCurrent / PROJECT_OVERLAY_GRID_COLUMNS) *
          PROJECT_OVERLAY_GRID_COLUMNS;
        const rowEnd = Math.min(
          rowStart + PROJECT_OVERLAY_GRID_COLUMNS - 1,
          options.length - 1,
        );

        if (direction === 'left') {
          return Math.max(rowStart, safeCurrent - 1);
        }

        if (direction === 'right') {
          return Math.min(rowEnd, safeCurrent + 1);
        }

        if (direction === 'up') {
          const nextIndex = safeCurrent - PROJECT_OVERLAY_GRID_COLUMNS;
          return nextIndex >= 0 ? nextIndex : safeCurrent;
        }

        const nextIndex = safeCurrent + PROJECT_OVERLAY_GRID_COLUMNS;
        return nextIndex < options.length ? nextIndex : safeCurrent;
      });
    },
    [options.length],
  );

  const selectIndex = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) {
        return;
      }

      moveToProject(option);
      onClose();
    },
    [moveToProject, onClose, options],
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
    {
      label: 'Navigate Project Options Up',
      shortcut: 'up',
      handler: () => {
        moveHighlight('up');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Project Options Down',
      shortcut: 'down',
      handler: () => {
        moveHighlight('down');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Project Options Left',
      shortcut: 'left',
      handler: () => {
        moveHighlight('left');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Navigate Project Options Right',
      shortcut: 'right',
      handler: () => {
        moveHighlight('right');
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Select Highlighted Project Option',
      shortcut: 'enter',
      handler: () => {
        selectIndex(highlightedIndex);
      },
      hideInCommandPalette: true,
    },
  ]);

  return (
    <div
      className="bg-bg-0/50 fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="border-glass-border bg-bg-0 flex max-h-[72svh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-ink-0 text-sm font-semibold">Switch Project</h2>
            <p className="text-ink-2 text-xs">
              Choose a project to filter the sidebar task list.
            </p>
          </div>
          <Link
            to="/projects/new"
            onClick={onClose}
            className="border-glass-border text-ink-1 hover:border-glass-border-strong hover:bg-glass-light hover:text-ink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
          >
            <Plus size={12} />
            <span>New Project</span>
          </Link>
        </div>

        <div
          className={clsx(
            'grid gap-3 overflow-y-auto p-4 sm:grid-cols-2',
            PROJECT_OVERLAY_LG_GRID_CLASS[PROJECT_OVERLAY_GRID_COLUMNS] ??
              'lg:grid-cols-3',
          )}
        >
          <button
            type="button"
            onClick={() => selectIndex(0)}
            onMouseEnter={() => setHighlightedIndex(0)}
            className={clsx(
              'rounded-lg border px-3 py-4 text-left transition-colors',
              projectId === 'all'
                ? 'border-acc bg-acc/10'
                : highlightedIndex === 0
                  ? 'border-glass-border-strong bg-bg-1'
                  : 'border-glass-border bg-bg-1/80 hover:border-glass-border-strong hover:bg-glass-light',
              highlightedIndex === 0 && 'ring-1 ring-white/35',
            )}
          >
            <p className="text-ink-2 text-xs">Overview</p>
            <p className="text-ink-0 mt-1 text-sm font-medium">All Projects</p>
          </button>

          {sortedProjects.map((project, index) => {
            const optionIndex = index + 1;

            return (
              <button
                key={project.id}
                type="button"
                onClick={() => selectIndex(optionIndex)}
                onMouseEnter={() => setHighlightedIndex(optionIndex)}
                className={clsx(
                  'rounded-lg border px-3 py-4 text-left transition-colors',
                  projectId === project.id
                    ? 'border-acc bg-acc/10'
                    : highlightedIndex === optionIndex
                      ? 'border-glass-border-strong bg-bg-1'
                      : 'border-glass-border bg-bg-1/80 hover:border-glass-border-strong hover:bg-glass-light',
                  highlightedIndex === optionIndex && 'ring-1 ring-white/35',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <p className="text-ink-0 truncate text-sm font-medium">
                    {project.name}
                  </p>
                </div>
                <p className="text-ink-2 mt-2 truncate text-xs">
                  {project.path}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
