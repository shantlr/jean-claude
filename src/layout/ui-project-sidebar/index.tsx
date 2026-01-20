import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { TaskListItem } from '@/features/task/ui-task-list-item';
import { useProject } from '@/hooks/use-projects';
import { useProjectTasks } from '@/hooks/use-tasks';

export function ProjectSidebar() {
  const { projectId, taskId } = useParams({ strict: false });
  const { data: project } = useProject(projectId!);
  const { data: tasks } = useProjectTasks(projectId!);

  if (!project) return null;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Project header */}
      <Link
        to="/projects/$projectId/details"
        params={{ projectId: project.id }}
        className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3 transition-colors hover:bg-neutral-800"
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <span className="truncate font-semibold">{project.name}</span>
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
      <div className="flex-1 overflow-y-auto p-2">
        {tasks && tasks.length > 0 ? (
          <div className="flex flex-col gap-1">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                projectId={project.id}
                isActive={task.id === taskId}
              />
            ))}
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
