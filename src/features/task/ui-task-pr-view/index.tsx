import clsx from 'clsx';
import {
  Loader2,
  GitPullRequest,
  Link,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { useMemo, useCallback } from 'react';

import { PrDetail } from '@/features/pull-request/ui-pr-detail';
import { usePullRequests } from '@/hooks/use-pull-requests';
import { useUpdateTask } from '@/hooks/use-tasks';
import type { AzureDevOpsPullRequest } from '@/lib/api';

export function TaskPrView({
  taskId,
  projectId,
  branchName,
  pullRequestId,
  hasRepoLinked,
  onClose,
}: {
  taskId: string;
  projectId: string;
  branchName: string | null;
  pullRequestId: string | null;
  hasRepoLinked: boolean;
  onClose: () => void;
}) {
  // If PR is linked, show the PR detail view
  if (pullRequestId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-sm font-medium text-neutral-300">
            Pull Request #{pullRequestId}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <PrDetail projectId={projectId} prId={Number(pullRequestId)} />
        </div>
      </div>
    );
  }

  // Otherwise show PR linking UI
  return (
    <PrLinkingView
      taskId={taskId}
      projectId={projectId}
      branchName={branchName}
      hasRepoLinked={hasRepoLinked}
      onClose={onClose}
    />
  );
}

function PrLinkingView({
  taskId,
  projectId,
  branchName,
  hasRepoLinked,
  onClose,
}: {
  taskId: string;
  projectId: string;
  branchName: string | null;
  hasRepoLinked: boolean;
  onClose: () => void;
}) {
  const { data: allPrs, isLoading: isPrsLoading } = usePullRequests(
    projectId,
    'all',
  );
  const updateTask = useUpdateTask();

  // Filter PRs that match the branch name
  const matchingPrs = useMemo(() => {
    if (!allPrs || !branchName) return [];

    // sourceRefName is like "refs/heads/feature-branch"
    const branchRef = `refs/heads/${branchName}`;
    return allPrs.filter((pr) => pr.sourceRefName === branchRef);
  }, [allPrs, branchName]);

  const handleLinkPr = useCallback(
    (pr: AzureDevOpsPullRequest) => {
      updateTask.mutate({
        id: taskId,
        data: {
          pullRequestId: pr.id.toString(),
          pullRequestUrl: pr.url,
        },
      });
    },
    [taskId, updateTask],
  );

  if (!hasRepoLinked) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-sm font-medium text-neutral-300">
            Pull Request
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <GitPullRequest className="h-12 w-12 text-neutral-600" />
          <p className="text-neutral-400">
            No repository linked to this project.
          </p>
          <p className="text-sm text-neutral-500">
            Link a repository in project settings to view and manage pull
            requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm font-medium text-neutral-300">
          Link Pull Request
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isPrsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : !branchName ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <GitPullRequest className="h-12 w-12 text-neutral-600" />
            <p className="text-neutral-400">
              No branch associated with this task.
            </p>
            <p className="text-sm text-neutral-500">
              Create a worktree task to enable pull request linking.
            </p>
          </div>
        ) : matchingPrs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <GitPullRequest className="h-12 w-12 text-neutral-600" />
            <p className="text-neutral-400">
              No pull requests found for branch{' '}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-sm">
                {branchName}
              </code>
            </p>
            <p className="text-sm text-neutral-500">
              Create a pull request from the diff view or your git provider.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400">
              Found {matchingPrs.length} pull request
              {matchingPrs.length > 1 ? 's' : ''} for branch{' '}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
                {branchName}
              </code>
            </p>
            <div className="space-y-2">
              {matchingPrs.map((pr) => (
                <PrSuggestionItem
                  key={pr.id}
                  pr={pr}
                  onLink={() => handleLinkPr(pr)}
                  isLinking={updateTask.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrSuggestionItem({
  pr,
  onLink,
  isLinking,
}: {
  pr: AzureDevOpsPullRequest;
  onLink: () => void;
  isLinking: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <GitPullRequest
            className={clsx(
              'h-4 w-4 shrink-0',
              pr.status === 'active'
                ? 'text-green-400'
                : pr.status === 'completed'
                  ? 'text-purple-400'
                  : 'text-red-400',
            )}
          />
          <span className="truncate text-sm font-medium text-neutral-200">
            #{pr.id} {pr.title}
          </span>
          {pr.isDraft && (
            <span className="shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400">
              Draft
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <span>{pr.createdBy.displayName}</span>
          <span>&middot;</span>
          <span>
            {new Date(pr.creationDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <span>&middot;</span>
          <span
            className={clsx(
              pr.status === 'active'
                ? 'text-green-400'
                : pr.status === 'completed'
                  ? 'text-purple-400'
                  : 'text-red-400',
            )}
          >
            {pr.status}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
          title="Open in browser"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={onLink}
          disabled={isLinking}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {isLinking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link className="h-4 w-4" />
          )}
          Link
        </button>
      </div>
    </div>
  );
}
