import { useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { useProject, useProjectCurrentBranch } from '@/hooks/use-projects';
import { usePullRequests } from '@/hooks/use-pull-requests';
import { useProjectTasks } from '@/hooks/use-tasks';

import { ActionBar } from './action-bar';
import { PrList } from './pr-list';
import { ProjectHeader, PROJECT_HEADER_HEIGHT } from './project-header';
import { TaskList } from './task-list';

export { PROJECT_HEADER_HEIGHT };

type ViewMode = 'tasks' | 'prs';

export function ProjectSidebar() {
  const { projectId, taskId, prId } = useParams({ strict: false });
  const { data: project } = useProject(projectId!);
  const { data: currentBranch } = useProjectCurrentBranch(projectId!);
  const { data: tasks } = useProjectTasks(projectId!);
  const { data: pullRequests, isLoading: isPrsLoading } =
    usePullRequests(projectId!);

  const [viewMode, setViewMode] = useState<ViewMode>('tasks');

  if (!project) return null;

  const hasLinkedRepo = !!project.repoProviderId;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      <ProjectHeader
        project={project}
        currentBranch={currentBranch ?? undefined}
      />

      <ActionBar
        projectId={project.id}
        viewMode={viewMode}
        hasLinkedRepo={hasLinkedRepo}
        onViewModeChange={setViewMode}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {viewMode === 'tasks' ? (
          <TaskList
            projectId={project.id}
            tasks={tasks ?? []}
            activeTaskId={taskId}
          />
        ) : (
          <PrList
            projectId={project.id}
            pullRequests={pullRequests ?? []}
            isLoading={isPrsLoading}
            activePrId={prId}
          />
        )}
      </div>
    </aside>
  );
}
