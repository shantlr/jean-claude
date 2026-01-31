import { Link } from '@tanstack/react-router';
import { GitBranch } from 'lucide-react';

import type { Project } from '../../../shared/types';

export const PROJECT_HEADER_HEIGHT = 64;

export function ProjectHeader({
  project,
  currentBranch,
}: {
  project: Project;
  currentBranch?: string;
}) {
  return (
    <Link
      to="/projects/$projectId/details"
      params={{ projectId: project.id }}
      className="flex flex-col justify-center gap-1 border-b border-neutral-700 px-4 py-2 transition-colors hover:bg-neutral-800"
      style={{ height: PROJECT_HEADER_HEIGHT }}
    >
      <div className="flex items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <span className="truncate font-semibold">{project.name}</span>
      </div>
      {currentBranch && (
        <div className="flex items-center gap-1.5 pl-6 text-xs text-neutral-400">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{currentBranch}</span>
        </div>
      )}
    </Link>
  );
}
