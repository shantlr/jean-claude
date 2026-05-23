import { useNavigate } from '@tanstack/react-router';
import {
  ExternalLink,
  Eye,
  FolderOpen,
  GitPullRequest,
  GitMerge,
  Loader2,
  Plus,
  Send,
  GitBranch,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Chip } from '@/common/ui/chip';
import { UserAvatar } from '@/common/ui/user-avatar';
import { useProject } from '@/hooks/use-projects';
import { usePublishPullRequest } from '@/hooks/use-pull-requests';
import { getEditorLabel, useEditorSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { formatRelativeTime } from '@/lib/time';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useNewTaskFormStore } from '@/stores/new-task-form';

import { PrAutoComplete } from '../ui-pr-auto-complete';
import { PrVoteDropdown } from '../ui-pr-vote-dropdown';

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
  const publishMutation = usePublishPullRequest(projectId, pr.id);
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

  return (
    <>
      {/* Top bar — breadcrumb + actions */}
      <div className="border-glass-border/50 flex h-[52px] shrink-0 items-center gap-2.5 border-b px-5">
        {/* Breadcrumb */}
        <div className="text-ink-3 flex min-w-0 items-center gap-1.5 text-xs">
          {project && (
            <>
              <span className="text-ink-2 font-medium">{project.name}</span>
              {project.repoProjectName && (
                <>
                  <span className="text-ink-4">·</span>
                  <span>{project.repoProjectName}</span>
                  {project.repoName && (
                    <>
                      <span className="text-ink-4">/</span>
                      <span className="text-ink-1">{project.repoName}</span>
                    </>
                  )}
                </>
              )}
              <span className="text-ink-4">/</span>
            </>
          )}
          <span>Pull requests</span>
          <span className="text-ink-4">/</span>
          <span className="text-ink-1 font-mono">#{pr.id}</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleCreateTaskFromPrBranch}
          className="bg-acc/15 text-acc-ink border-acc/30 hover:bg-acc/25 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </button>
        {pr.status === 'active' && (
          <button
            onClick={handleReview}
            disabled={isCreating}
            className="bg-acc text-ink-0 hover:bg-acc/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Review
          </button>
        )}

        <div className="bg-glass-border mx-1 h-4 w-px" />

        {/* External links */}
        {project?.path && (
          <button
            onClick={handleOpenInEditor}
            className="border-glass-border bg-bg-1 hover:bg-bg-2 flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
          </button>
        )}
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="border-glass-border bg-bg-1 hover:bg-bg-2 flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Azure DevOps
        </a>
      </div>

      {/* Header — status + title + meta */}
      <div className="border-glass-border/50 border-b px-5 py-5">
        <div className="flex items-start gap-3.5">
          {/* Status pill */}
          <div className="mt-0.5 shrink-0">
            {getStatusBadge(pr.status, pr.isDraft)}
          </div>

          <div className="min-w-0 flex-1">
            {/* Title */}
            <h1 className="text-ink-0 font-mono text-xl leading-tight font-semibold tracking-tight break-words">
              {pr.title}
            </h1>

            {/* Meta row */}
            <div className="text-ink-3 mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs">
              {/* Author */}
              <div className="flex items-center gap-1.5">
                <UserAvatar
                  name={pr.createdBy.displayName}
                  imageUrl={
                    pr.createdBy.imageUrl && project?.repoProviderId
                      ? encodeProxyUrl(
                          project.repoProviderId,
                          pr.createdBy.imageUrl,
                        )
                      : pr.createdBy.imageUrl
                  }
                  size="sm"
                />
                <span className="text-ink-1">{pr.createdBy.displayName}</span>
              </div>

              <span className="text-ink-4">·</span>

              {/* Branch */}
              <div className="flex items-center gap-1.5 font-mono text-[11.5px]">
                <GitBranch className="h-3 w-3" />
                <span className="text-ink-1">{sourceBranch}</span>
                <ArrowRight className="text-ink-4 h-3 w-3" />
                <span className="bg-status-done/15 text-status-done rounded px-1.5 py-0.5">
                  {targetBranch}
                </span>
              </div>

              <span className="text-ink-4">·</span>

              {/* Age */}
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>{formatRelativeTime(pr.creationDate)}</span>
              </div>

              {/* Vote/autocomplete controls */}
              {pr.status === 'active' && !pr.isDraft && (
                <>
                  <div className="flex-1" />
                  <PrVoteDropdown pr={pr} projectId={projectId} />
                  <PrAutoComplete pr={pr} projectId={projectId} />
                </>
              )}

              {/* Publish button for drafts */}
              {pr.isDraft && pr.status === 'active' && (
                <>
                  <div className="flex-1" />
                  <button
                    onClick={() => publishMutation.mutate()}
                    disabled={publishMutation.isPending}
                    className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {publishMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Publish
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
