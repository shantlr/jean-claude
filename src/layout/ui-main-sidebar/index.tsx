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
import { useState, useEffect } from 'react';

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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        router.navigate({ to: '/all-tasks' });
      }}
      className={clsx(
        'cursor-pointer group relative flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-700 text-neutral-300 transition-all hover:bg-neutral-600 hover:text-white',
        {
          'ring-white ring-2': isActive,
        },
      )}
    >
      <LayoutList className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
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
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-3 pb-3 pt-12">
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
      <div className="flex flex-col items-center gap-2 bg-neutral-800 px-3 py-3 m-2 rounded-xl">
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
