import { LayoutList } from 'lucide-react';

import { TaskListItem } from '@/features/task/ui-task-list-item';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useNavigationStore } from '@/stores/navigation';

export const ALL_TASKS_HEADER_HEIGHT = 64;

export function AllTasksSidebar() {
  const { data: tasks } = useAllActiveTasks();
  const lastLocation = useNavigationStore((s) => s.lastLocation);
  const activeTaskId =
    lastLocation.type === 'allTasks' ? lastLocation.taskId : null;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-neutral-700 px-4"
        style={{ height: ALL_TASKS_HEADER_HEIGHT }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-700">
          <LayoutList className="h-4 w-4 text-neutral-300" />
        </div>
        <span className="font-semibold">All Tasks</span>
      </div>

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tasks && tasks.length > 0 ? (
          <div className="flex flex-col gap-1">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                projectId={task.projectId}
                isActive={task.id === activeTaskId}
                projectName={task.projectName}
                projectColor={task.projectColor}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No active tasks
          </div>
        )}
      </div>
    </aside>
  );
}
