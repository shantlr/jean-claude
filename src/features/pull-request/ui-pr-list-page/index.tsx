import { Link, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { Loader2, GitPullRequest, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { useProject } from '@/hooks/use-projects';
import { usePullRequests } from '@/hooks/use-pull-requests';

import { PrListItem } from '../ui-pr-list-item';

type PrStatus = 'active' | 'completed' | 'abandoned' | 'all';

export function PrListPage({
  projectId,
  basePath,
}: {
  projectId: string;
  basePath: 'project' | 'all';
}) {
  const params = useParams({ strict: false });
  const currentPrId = params.prId as string | undefined;

  const [status, setStatus] = useState<PrStatus>('active');
  const { data: project } = useProject(projectId);
  const { data: prs = [], isLoading } = usePullRequests(projectId, status);

  // Check if project has repo configured
  const hasRepoConfig = !!(
    project?.repoProviderId &&
    project?.repoProjectId &&
    project?.repoId
  );

  if (!hasRepoConfig) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-neutral-500">
        <GitPullRequest className="h-12 w-12" />
        <p className="text-center">
          This project doesn't have a repository linked.
          <br />
          Link a repository in project settings to view pull requests.
        </p>
        <Link
          to="/projects/$projectId/details"
          params={{ projectId }}
          className="text-blue-400 hover:text-blue-300"
        >
          Go to Project Settings
        </Link>
      </div>
    );
  }

  const backLink =
    basePath === 'all'
      ? { to: '/' as const }
      : { to: '/projects/$projectId' as const, params: { projectId } };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3">
        <Link
          {...backLink}
          className="flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="h-4 w-px bg-neutral-700" />
        <h1 className="text-lg font-semibold">Pull Requests</h1>
        {project?.repoName && (
          <span className="text-sm text-neutral-500">{project.repoName}</span>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-neutral-700 px-4 py-2">
        {(['active', 'completed', 'abandoned', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={clsx(
              'rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors',
              status === s
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-neutral-500">
            <GitPullRequest className="h-8 w-8" />
            <p>No {status === 'all' ? '' : status} pull requests</p>
          </div>
        ) : (
          <div className="space-y-1">
            {prs.map((pr) => (
              <PrListItem
                key={pr.id}
                pr={pr}
                projectId={projectId}
                isActive={currentPrId === String(pr.id)}
                basePath={basePath}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
