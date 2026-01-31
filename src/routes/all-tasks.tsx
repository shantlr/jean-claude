import { createFileRoute, redirect } from '@tanstack/react-router';

import { AllTasksSidebar } from '@/layout/ui-all-tasks-sidebar';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigation';

export const Route = createFileRoute('/all-tasks')({
  beforeLoad: async () => {
    const { lastLocation, setLastLocation } = useNavigationStore.getState();

    // Get the last task ID if we were in All Tasks view
    const lastTaskId =
      lastLocation.type === 'allTasks' ? lastLocation.taskId : null;

    // If we have a last task, validate and redirect to it
    if (lastTaskId) {
      const task = await api.tasks.findById(lastTaskId);
      if (task && !task.userCompleted) {
        // Update lastLocation to track we're in All Tasks with this task
        setLastLocation({ type: 'allTasks', taskId: task.id });
        throw redirect({
          to: '/projects/$projectId/tasks/$taskId',
          params: {
            projectId: task.projectId,
            taskId: task.id,
          },
        });
      }
    }

    // No valid last task, try to get the first active task
    const tasks = await api.tasks.findAllActive();
    if (tasks.length > 0) {
      const firstTask = tasks[0];
      setLastLocation({ type: 'allTasks', taskId: firstTask.id });
      throw redirect({
        to: '/projects/$projectId/tasks/$taskId',
        params: {
          projectId: firstTask.projectId,
          taskId: firstTask.id,
        },
      });
    }

    // No active tasks, stay on /all-tasks and show empty state
    setLastLocation({ type: 'allTasks', taskId: null });
  },
  component: AllTasksLayout,
});

function AllTasksLayout() {
  return (
    <div className="flex h-full overflow-hidden rounded-tl-lg border-t border-l border-neutral-800">
      <AllTasksSidebar />
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        No active tasks across projects
      </div>
    </div>
  );
}
