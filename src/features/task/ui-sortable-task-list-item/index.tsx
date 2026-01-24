import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TaskListItem } from '@/features/task/ui-task-list-item';

import type { Task } from '../../../../shared/types';

interface TaskWithMessageCount extends Task {
  messageCount?: number;
}

export function SortableTaskListItem({
  task,
  projectId,
  isActive,
}: {
  task: TaskWithMessageCount;
  projectId: string;
  isActive?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskListItem task={task} projectId={projectId} isActive={isActive} />
    </div>
  );
}
