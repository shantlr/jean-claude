import { useNavigate } from '@tanstack/react-router';
import {
  ExternalLink,
  Eye,
  FolderOpen,
  GitPullRequest,
  GitMerge,
  Loader2,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { UserAvatar, getVoteLabel } from '@/common/ui/user-avatar';
import { useProject } from '@/hooks/use-projects';
import { getEditorLabel, useEditorSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';
import { useBackgroundJobsStore } from '@/stores/background-jobs';

function getStatusBadge(
  status: AzureDevOpsPullRequestDetails['status'],
  isDraft: boolean,
) {
  if (isDraft) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-300">
        <GitPullRequest className="h-3 w-3" />
        Draft
      </span>
    );
  }
  switch (status) {
    case 'active':
      return (
        <span className="flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400">
          <GitPullRequest className="h-3 w-3" />
          Open
        </span>
      );
    case 'completed':
      return (
        <span className="flex items-center gap-1 rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
          <GitMerge className="h-3 w-3" />
          Merged
        </span>
      );
    case 'abandoned':
      return (
        <span className="flex items-center gap-1 rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400">
          <GitPullRequest className="h-3 w-3" />
          Closed
        </span>
      );
  }
}

function getBranchName(refName: string) {
  return refName.replace('refs/heads/', '');
}

export function PrHeader({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const navigate = useNavigate();
  const { data: project } = useProject(projectId);
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const { data: editorSetting } = useEditorSetting();
  const [isCreating, setIsCreating] = useState(false);

  const handleOpenInEditor = useCallback(() => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  }, [project?.path]);

  const handleReview = useCallback(async () => {
    setIsCreating(true);
    const jobId = addRunningJob({
      type: 'pr-review-creation',
      title: `Creating review for PR #${pr.id}`,
      projectId,
      details: { pullRequestId: pr.id },
    });

    try {
      const task = await api.tasks.createPrReview({
        projectId,
        pullRequestId: pr.id,
      });
      markJobSucceeded(jobId);
      void navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: { projectId, taskId: task.id },
      });
    } catch (error) {
      markJobFailed(
        jobId,
        error instanceof Error ? error.message : 'Failed to create review task',
      );
      setIsCreating(false);
    }
  }, [
    pr.id,
    projectId,
    navigate,
    addRunningJob,
    markJobSucceeded,
    markJobFailed,
  ]);

  // Filter out group reviewers (isContainer) - only show individual users
  const reviewers = pr.reviewers.filter((r) => !r.isContainer);

  return (
    <div className="border-b border-neutral-700 p-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">#{pr.id}</span>
            <div className="flex">{getStatusBadge(pr.status, pr.isDraft)}</div>
            <div className="grow" />
            {pr.status === 'active' && (
              <button
                onClick={handleReview}
                disabled={isCreating}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Review
              </button>
            )}
            {project?.path && (
              <button
                onClick={handleOpenInEditor}
                className="flex items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-600"
              >
                <FolderOpen className="h-4 w-4" />
                Open in{' '}
                {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
              </button>
            )}
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-600"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Azure DevOps
            </a>
          </div>

          {/* TITLE */}
          <h1 className="text-lg font-semibold text-neutral-100">{pr.title}</h1>

          <div className="flex w-full items-center gap-x-4 text-neutral-400">
            <div className="flex items-center gap-1">
              <span className="text-neutral-500">by</span>
              <span>{pr.createdBy.displayName}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-blue-400">
                {getBranchName(pr.sourceRefName)}
              </span>
              <span className="text-neutral-500">→</span>
              <span className="font-mono text-green-400">
                {getBranchName(pr.targetRefName)}
              </span>
            </div>
            <div className="grow">{formatRelativeTime(pr.creationDate)}</div>

            <div className="flex justify-end -space-x-1">
              {reviewers.map((reviewer) => (
                <UserAvatar
                  key={reviewer.uniqueName}
                  name={reviewer.displayName}
                  title={`${reviewer.displayName} - ${getVoteLabel(reviewer.voteStatus)}`}
                  size="md"
                  vote={reviewer.voteStatus}
                  variant="border"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
