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
import { Link, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { GitBranch, Plus } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

import { SortableTaskListItem } from '@/features/task/ui-sortable-task-list-item';
import { useProject, useProjectCurrentBranch } from '@/hooks/use-projects';
import { useProjectTasks, useReorderTasks } from '@/hooks/use-tasks';

import type { Task } from '../../../shared/types';

interface TaskWithMessageCount extends Task {
  messageCount?: number;
}

export const PROJECT_HEADER_HEIGHT = 64;

export function ProjectSidebar() {
  const { projectId, taskId } = useParams({ strict: false });
  const { data: project } = useProject(projectId!);
  const { data: currentBranch } = useProjectCurrentBranch(projectId!);
  const { data: tasks } = useProjectTasks(projectId!);
  const reorderTasks = useReorderTasks();

  // Split tasks into active and completed
  const {
    activeTasks: serverActiveTasks,
    completedTasks: serverCompletedTasks,
  } = useMemo(() => {
    if (!tasks) return { activeTasks: [], completedTasks: [] };
    const active: TaskWithMessageCount[] = [];
    const completed: TaskWithMessageCount[] = [];
    for (const task of tasks) {
      if (task.userCompleted) {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return { activeTasks: active, completedTasks: completed };
  }, [tasks]);

  // Local state for optimistic reordering
  const [localActiveTasks, setLocalActiveTasks] =
    useState<TaskWithMessageCount[]>(serverActiveTasks);
  const [localCompletedTasks, setLocalCompletedTasks] =
    useState<TaskWithMessageCount[]>(serverCompletedTasks);

  // Sync local state when tasks data changes
  useEffect(() => {
    setLocalActiveTasks(serverActiveTasks);
    setLocalCompletedTasks(serverCompletedTasks);
  }, [serverActiveTasks, serverCompletedTasks]);

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

  function handleActiveDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localActiveTasks.findIndex((t) => t.id === active.id);
      const newIndex = localActiveTasks.findIndex((t) => t.id === over.id);

      const reordered = arrayMove(localActiveTasks, oldIndex, newIndex);
      setLocalActiveTasks(reordered);

      // Persist the new order
      reorderTasks.mutate({
        projectId: projectId!,
        activeIds: reordered.map((t) => t.id),
        completedIds: localCompletedTasks.map((t) => t.id),
      });
    }
  }

  function handleCompletedDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localCompletedTasks.findIndex((t) => t.id === active.id);
      const newIndex = localCompletedTasks.findIndex((t) => t.id === over.id);

      const reordered = arrayMove(localCompletedTasks, oldIndex, newIndex);
      setLocalCompletedTasks(reordered);

      // Persist the new order
      reorderTasks.mutate({
        projectId: projectId!,
        activeIds: localActiveTasks.map((t) => t.id),
        completedIds: reordered.map((t) => t.id),
      });
    }
  }

  if (!project) return null;

  const hasTasks =
    localActiveTasks.length > 0 || localCompletedTasks.length > 0;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Project header */}
      <Link
        to="/projects/$projectId/details"
        params={{ projectId: project.id }}
        className={clsx(
          'flex flex-col justify-center gap-1 border-b border-neutral-700 px-4 py-2 transition-colors hover:bg-neutral-800',
        )}
        style={{
          height: PROJECT_HEADER_HEIGHT,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 flex-shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="truncate font-semibold">{project.name}</span>
        </div>
        {currentBranch && (
          <div className="flex items-center gap-1.5 pl-6 text-xs text-neutral-400">
            <GitBranch className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{currentBranch}</span>
          </div>
        )}
      </Link>

      {/* New task button */}
      <div className="border-b border-neutral-700 p-3">
        <Link
          to="/projects/$projectId/tasks/new"
          params={{ projectId: project.id }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Link>
      </div>

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {hasTasks ? (
          <div className="flex flex-col gap-4">
            {/* Active tasks section */}
            {localActiveTasks.length > 0 && (
              <div className="flex flex-col gap-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleActiveDragEnd}
                >
                  <SortableContext
                    items={localActiveTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {localActiveTasks.map((task) => (
                      <SortableTaskListItem
                        key={task.id}
                        task={task}
                        projectId={project.id}
                        isActive={task.id === taskId}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Completed tasks section */}
            {localCompletedTasks.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Completed
                </span>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCompletedDragEnd}
                >
                  <SortableContext
                    items={localCompletedTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {localCompletedTasks.map((task) => (
                      <SortableTaskListItem
                        key={task.id}
                        task={task}
                        projectId={project.id}
                        isActive={task.id === taskId}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No tasks yet
          </div>
        )}
      </div>
    </aside>
  );
}
