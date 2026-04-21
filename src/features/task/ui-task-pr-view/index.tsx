import clsx from 'clsx';
import {
  Loader2,
  GitPullRequest,
  Link,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { useMemo, useCallback } from 'react';

import { Button } from '@/common/ui/button';
import { Separator } from '@/common/ui/separator';
import { PrDetail } from '@/features/pull-request/ui-pr-detail';
import { useProject } from '@/hooks/use-projects';
import { usePullRequests } from '@/hooks/use-pull-requests';
import { useTask, useUpdateTask } from '@/hooks/use-tasks';
import type { AzureDevOpsPullRequest } from '@/lib/api';

import { PrCreationForm } from './pr-creation-form';

export function TaskPrView({
  taskId,
  projectId,
  onClose,
  bottomPadding = 0,
}: {
  taskId: string;
  projectId: string;
  onClose: () => void;
  bottomPadding?: number;
}) {
  const { data: task } = useTask(taskId);
  const { data: project } = useProject(projectId);

  // If PR is linked, show the PR detail view
  if (task?.pullRequestId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            icon={<ArrowLeft />}
          >
            Back
          </Button>
          <span className="text-ink-1 text-sm font-medium">
            Pull Request #{task.pullRequestId}
          </span>
        </div>
        <Separator />
        <div className="min-h-0 flex-1">
          <PrDetail
            projectId={projectId}
            prId={Number(task.pullRequestId)}
            bottomPadding={bottomPadding}
          />
        </div>
      </div>
    );
  }

  // Otherwise show PR linking UI
  return (
    <PrLinkingView
      taskId={taskId}
      projectId={projectId}
      task={task}
      project={project}
      onClose={onClose}
      bottomPadding={bottomPadding}
    />
  );
}

function PrLinkingView({
  taskId,
  projectId,
  task,
  project,
  onClose,
  bottomPadding = 0,
}: {
  taskId: string;
  projectId: string;
  task:
    | {
        branchName: string | null;
        name: string | null;
        prompt: string;
        sourceBranch: string | null;
        workItemIds: string[] | null;
      }
    | undefined;
  project:
    | {
        repoProviderId: string | null;
        repoProjectId: string | null;
        repoId: string | null;
        defaultBranch: string | null;
      }
    | undefined;
  onClose: () => void;
  bottomPadding?: number;
}) {
  const { data: allPrs, isLoading: isPrsLoading } = usePullRequests(
    projectId,
    'all',
  );
  const updateTask = useUpdateTask();

  const branchName = task?.branchName ?? null;
  const hasRepoLinked = !!project?.repoProviderId;
  const canCreatePr =
    !!branchName &&
    !!project?.repoProviderId &&
    !!project?.repoProjectId &&
    !!project?.repoId;

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
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            icon={<ArrowLeft />}
          >
            Back
          </Button>
          <span className="text-ink-1 text-sm font-medium">Pull Request</span>
        </div>
        <Separator />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <GitPullRequest className="text-ink-4 h-12 w-12" />
          <p className="text-ink-2">No repository linked to this project.</p>
          <p className="text-ink-3 text-sm">
            Link a repository in project settings to view and manage pull
            requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          onClick={onClose}
          className="text-ink-2 hover:text-ink-1 hover:bg-glass-medium flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-ink-1 text-sm font-medium">
          {!isPrsLoading && matchingPrs.length === 0 && canCreatePr
            ? 'Create Pull Request'
            : 'Link Pull Request'}
        </span>
      </div>
      <Separator />

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        {isPrsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
          </div>
        ) : !branchName ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <GitPullRequest className="text-ink-4 h-12 w-12" />
            <p className="text-ink-2">No branch associated with this task.</p>
            <p className="text-ink-3 text-sm">
              Create a worktree task to enable pull request linking.
            </p>
          </div>
        ) : matchingPrs.length === 0 ? (
          canCreatePr ? (
            <PrCreationForm
              taskId={taskId}
              projectId={projectId}
              onSuccess={onClose}
              onCancel={onClose}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <GitPullRequest className="text-ink-4 h-12 w-12" />
              <p className="text-ink-2">
                No pull requests found for branch{' '}
                <code className="bg-bg-1 rounded px-1.5 py-0.5 font-mono text-sm">
                  {branchName}
                </code>
              </p>
              <p className="text-ink-3 text-sm">
                Create a pull request from the diff view or your git provider.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-ink-2 text-sm">
              Found {matchingPrs.length} pull request
              {matchingPrs.length > 1 ? 's' : ''} for branch{' '}
              <code className="bg-bg-1 rounded px-1.5 py-0.5 font-mono text-xs">
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
    <div className="bg-bg-1/50 border-glass-border flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <GitPullRequest
            className={clsx(
              'h-4 w-4 shrink-0',
              pr.status === 'active'
                ? 'text-status-done'
                : pr.status === 'completed'
                  ? 'text-acc-ink'
                  : 'text-status-fail',
            )}
          />
          <span className="text-ink-1 truncate text-sm font-medium">
            #{pr.id} {pr.title}
          </span>
          {pr.isDraft && (
            <span className="text-ink-2 bg-glass-medium shrink-0 rounded px-1.5 py-0.5 text-xs">
              Draft
            </span>
          )}
        </div>
        <div className="text-ink-3 mt-1 flex items-center gap-2 text-xs">
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
                ? 'text-status-done'
                : pr.status === 'completed'
                  ? 'text-acc-ink'
                  : 'text-status-fail',
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
          className="text-ink-2 hover:text-ink-1 hover:bg-glass-medium rounded p-1.5 transition-colors"
          title="Open in browser"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <Button
          onClick={onLink}
          disabled={isLinking}
          loading={isLinking}
          variant="primary"
          size="sm"
          icon={<Link />}
        >
          Link
        </Button>
      </div>
    </div>
  );
}
