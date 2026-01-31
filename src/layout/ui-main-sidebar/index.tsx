import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import { LayoutList, Plus, Settings } from 'lucide-react';
import { useState, useEffect, type KeyboardEvent } from 'react';

import { getUnreadCount } from '@/features/task/ui-task-list-item';
import { useProjects, useReorderProjects } from '@/hooks/use-projects';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useNavigationStore } from '@/stores/navigation';

import { SortableProjectTile } from './sortable-project-tile';

function AllTasksTile() {
  const { data: tasks } = useAllActiveTasks();
  const router = useRouter();
  const lastLocation = useNavigationStore((s) => s.lastLocation);

  const isActive = useRouterState({
    select: (state) =>
      state.location.pathname === '/all-tasks' ||
      lastLocation.type === 'allTasks',
  });

  const unreadCount =
    tasks?.reduce((sum, task) => sum + getUnreadCount(task), 0) ?? 0;

  const handleClick = () => {
    router.navigate({ to: '/all-tasks' });
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
      aria-label={`All tasks${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'group relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-neutral-700 text-neutral-300 transition-colors hover:bg-neutral-600 hover:text-white',
        {
          'ring-2 ring-white': isActive,
        },
      )}
    >
      <LayoutList className="h-5 w-5" aria-hidden />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white"
          aria-hidden
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}

export function MainSidebar() {
  const { data: projects } = useProjects();
  const reorderProjects = useReorderProjects();

  // Local state for optimistic reordering
  const [localProjects, setLocalProjects] = useState(projects ?? []);

  // Sync local state when projects data changes
  useEffect(() => {
    if (projects) {
      setLocalProjects(projects);
    }
  }, [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localProjects.findIndex((p) => p.id === active.id);
      const newIndex = localProjects.findIndex((p) => p.id === over.id);

      const reordered = arrayMove(localProjects, oldIndex, newIndex);
      setLocalProjects(reordered);

      // Persist the new order
      const orderedIds = reordered.map((p) => p.id);
      reorderProjects.mutate(orderedIds);
    }
  }

  return (
    <aside className="flex h-full w-[86px] flex-col">
      {/* Project tiles */}
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-3 pt-12 pb-3">
        <AllTasksTile />
        <div className="my-1 h-px w-8 bg-neutral-700" />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localProjects.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {localProjects.map((project) => (
              <SortableProjectTile
                key={project.id}
                id={project.id}
                name={project.name}
                color={project.color}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="m-2 flex flex-col items-center gap-2 rounded-xl bg-neutral-800 px-3 py-3">
        {/* Add project button */}
        <Link
          to="/projects/new"
          aria-label="Add new project"
          className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-neutral-600 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-white"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Link>

        {/* Settings button */}
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white data-[status=active]:bg-neutral-800 data-[status=active]:text-white"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
