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
import { useState, useEffect, useMemo } from 'react';

import { SortableTaskListItem } from '@/features/task/ui-sortable-task-list-item';
import { useReorderTasks } from '@/hooks/use-tasks';

import type { Task } from '../../../shared/types';

export function TaskList({
  projectId,
  tasks,
  activeTaskId,
}: {
  projectId: string;
  tasks: Task[];
  activeTaskId?: string;
}) {
  const reorderTasks = useReorderTasks();

  // Split tasks into active and completed
  const { serverActiveTasks, serverCompletedTasks } = useMemo(() => {
    const active: Task[] = [];
    const completed: Task[] = [];
    for (const task of tasks) {
      if (task.userCompleted) {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return { serverActiveTasks: active, serverCompletedTasks: completed };
  }, [tasks]);

  // Local state for optimistic reordering
  const [localActiveTasks, setLocalActiveTasks] =
    useState<Task[]>(serverActiveTasks);
  const [localCompletedTasks, setLocalCompletedTasks] =
    useState<Task[]>(serverCompletedTasks);

  // Sync local state when tasks data changes
  useEffect(() => {
    setLocalActiveTasks(serverActiveTasks);
    setLocalCompletedTasks(serverCompletedTasks);
  }, [serverActiveTasks, serverCompletedTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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

      reorderTasks.mutate({
        projectId,
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

      reorderTasks.mutate({
        projectId,
        activeIds: localActiveTasks.map((t) => t.id),
        completedIds: reordered.map((t) => t.id),
      });
    }
  }

  const hasTasks =
    localActiveTasks.length > 0 || localCompletedTasks.length > 0;

  if (!hasTasks) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No tasks yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Active tasks section */}
      {localActiveTasks.length > 0 && (
        <TaskSection
          tasks={localActiveTasks}
          projectId={projectId}
          activeTaskId={activeTaskId}
          sensors={sensors}
          onDragEnd={handleActiveDragEnd}
        />
      )}

      {/* Completed tasks section */}
      {localCompletedTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Completed
          </span>
          <TaskSection
            tasks={localCompletedTasks}
            projectId={projectId}
            activeTaskId={activeTaskId}
            sensors={sensors}
            onDragEnd={handleCompletedDragEnd}
          />
        </div>
      )}
    </div>
  );
}

function TaskSection({
  tasks,
  projectId,
  activeTaskId,
  sensors,
  onDragEnd,
}: {
  tasks: Task[];
  projectId: string;
  activeTaskId?: string;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskListItem
              key={task.id}
              task={task}
              projectId={projectId}
              isActive={task.id === activeTaskId}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
