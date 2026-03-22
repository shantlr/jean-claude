import { useNavigate } from '@tanstack/react-router';
import {
  ExternalLink,
  Eye,
  FolderOpen,
  GitPullRequest,
  GitMerge,
  Loader2,
  Plus,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Chip } from '@/common/ui/chip';
import { Separator } from '@/common/ui/separator';
import { UserAvatar, getVoteLabel } from '@/common/ui/user-avatar';
import { useProject } from '@/hooks/use-projects';
import { getEditorLabel, useEditorSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { formatRelativeTime } from '@/lib/time';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useNewTaskFormStore } from '@/stores/new-task-form';

function getStatusBadge(
  status: AzureDevOpsPullRequestDetails['status'],
  isDraft: boolean,
) {
  if (isDraft) {
    return (
      <Chip size="sm" color="neutral" pill icon={<GitPullRequest />}>
        Draft
      </Chip>
    );
  }
  switch (status) {
    case 'active':
      return (
        <Chip size="sm" color="green" pill icon={<GitPullRequest />}>
          Open
        </Chip>
      );
    case 'completed':
      return (
        <Chip size="sm" color="purple" pill icon={<GitMerge />}>
          Merged
        </Chip>
      );
    case 'abandoned':
      return (
        <Chip size="sm" color="red" pill icon={<GitPullRequest />}>
          Closed
        </Chip>
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
  const { setDraft: setNewTaskDraft } = useNewTaskFormStore(projectId);
  const { data: editorSetting } = useEditorSetting();
  const [isCreating, setIsCreating] = useState(false);
  const sourceBranch = getBranchName(pr.sourceRefName);
  const targetBranch = getBranchName(pr.targetRefName);

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

  const handleCreateTaskFromPrBranch = useCallback(() => {
    setNewTaskDraft({
      useWorktree: true,
      sourceBranch,
      prompt: `Review PR #${pr.id}: ${pr.title}`,
    });

    void navigate({
      to: '/projects/$projectId/tasks/new',
      params: { projectId },
    });
  }, [navigate, pr.id, pr.title, projectId, setNewTaskDraft, sourceBranch]);

  // Filter out group reviewers (isContainer) - only show individual users
  const reviewers = pr.reviewers.filter((r) => !r.isContainer);

  return (
    <>
      <div className="p-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {project && (
              <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="font-medium text-neutral-400">
                  {project.name}
                </span>
                {project.repoProjectName && (
                  <>
                    <span>·</span>
                    <span>
                      {project.repoProjectName}
                      {project.repoName && (
                        <span className="text-neutral-600">
                          {' / '}
                          {project.repoName}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">#{pr.id}</span>
              <div className="flex">
                {getStatusBadge(pr.status, pr.isDraft)}
              </div>
              <div className="grow" />
              <button
                onClick={handleCreateTaskFromPrBranch}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
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
            <h1 className="text-lg font-semibold text-neutral-100">
              {pr.title}
            </h1>

            <div className="flex w-full items-center gap-x-4 text-neutral-400">
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">by</span>
                <span>{pr.createdBy.displayName}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-blue-400">{sourceBranch}</span>
                <span className="text-neutral-500">→</span>
                <span className="font-mono text-green-400">{targetBranch}</span>
              </div>
              <div className="grow">{formatRelativeTime(pr.creationDate)}</div>

              <div className="flex justify-end -space-x-1">
                {reviewers.map((reviewer) => {
                  const avatarUrl =
                    reviewer.imageUrl && project?.repoProviderId
                      ? encodeProxyUrl(
                          project.repoProviderId,
                          reviewer.imageUrl,
                        )
                      : reviewer.imageUrl;
                  return (
                    <UserAvatar
                      key={reviewer.uniqueName}
                      name={reviewer.displayName}
                      imageUrl={avatarUrl}
                      title={`${reviewer.displayName} - ${getVoteLabel(reviewer.voteStatus)}`}
                      size="md"
                      vote={reviewer.voteStatus}
                      variant="border"
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Separator />
    </>
  );
}
