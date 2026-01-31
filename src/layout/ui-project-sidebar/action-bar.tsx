import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus, ArrowLeft } from 'lucide-react';

type ViewMode = 'tasks' | 'prs';

export function ActionBar({
  projectId,
  viewMode,
  hasLinkedRepo,
  onViewModeChange,
}: {
  projectId: string;
  viewMode: ViewMode;
  hasLinkedRepo: boolean;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="border-b border-neutral-700 p-3">
      <div className="flex gap-2">
        {viewMode === 'tasks' ? (
          <Link
            to="/projects/$projectId/tasks/new"
            params={{ projectId }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Link>
        ) : (
          <button
            onClick={() => onViewModeChange('tasks')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
        {hasLinkedRepo && (
          <button
            onClick={() => onViewModeChange('prs')}
            className={clsx(
              'rounded-lg px-4 py-2 font-medium transition-colors',
              viewMode === 'prs'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600',
            )}
          >
            PRs
          </button>
        )}
      </div>
    </div>
  );
}
