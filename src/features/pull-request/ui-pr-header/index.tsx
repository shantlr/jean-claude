import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
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
  Edit3,
  Save,
  X,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { Input } from '@/common/ui/input';
import { UserAvatar } from '@/common/ui/user-avatar';
import { useProject } from '@/hooks/use-projects';
import {
  useCurrentAzureUser,
  usePublishPullRequest,
  useUpdatePullRequestTitle,
} from '@/hooks/use-pull-requests';
import {
  getEditorLabel,
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  useEditorSetting,
} from '@/hooks/use-settings';
import { invalidateFeedItems } from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { formatRelativeTime } from '@/lib/time';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useNewTaskFormStore } from '@/stores/new-task-form';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference, ThinkingEffort } from '@shared/types';

import { PrAutoComplete } from '../ui-pr-auto-complete';
import { PrReviewSetupDialog } from '../ui-pr-review-setup-dialog';
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
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const { setDraft: setNewTaskDraft } = useNewTaskFormStore(projectId);
  const { data: editorSetting } = useEditorSetting();
  const publishMutation = usePublishPullRequest(projectId, pr.id);
  const updateTitle = useUpdatePullRequestTitle(projectId, pr.id);
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const [isCreating, setIsCreating] = useState(false);
  const [isReviewSetupOpen, setIsReviewSetupOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(pr.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const sourceBranch = getBranchName(pr.sourceRefName);
  const targetBranch = getBranchName(pr.targetRefName);
  const currentUserEmail = currentUser?.emailAddress.toLowerCase();
  const ownerEmail = pr.createdBy.uniqueName.toLowerCase();
  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();
  const canEditTitle =
    !!currentUser &&
    (currentUser.identityId === pr.createdBy.id ||
      currentUser.id === pr.createdBy.id ||
      currentUserEmail === ownerEmail);
  const defaultReviewBackend = useMemo<AgentBackendType>(
    () =>
      (project?.defaultAgentBackend as AgentBackendType | null) ??
      backendsSetting?.defaultBackend ??
      'claude-code',
    [backendsSetting?.defaultBackend, project?.defaultAgentBackend],
  );
  const defaultReviewModel = useMemo<ModelPreference>(
    () =>
      getDefaultModelForBackend({
        backend: defaultReviewBackend,
        project,
        backendDefaultModels: backendDefaultModelsSetting,
      }),
    [backendDefaultModelsSetting, defaultReviewBackend, project],
  );

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(pr.title);
      setTitleError(null);
    }
  }, [isEditingTitle, pr.title]);

  const handleOpenInEditor = useCallback(() => {
    if (project?.path) {
      api.shell.openInEditor(project.path);
    }
  }, [project?.path]);

  const handleReview = useCallback(
    async (selection: {
      agentBackend: AgentBackendType;
      modelPreference: ModelPreference;
      thinkingEffort: ThinkingEffort;
    }) => {
      setIsReviewSetupOpen(false);
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
          agentBackend: selection.agentBackend,
          modelPreference: selection.modelPreference,
          thinkingEffort: selection.thinkingEffort,
        });
        markJobSucceeded(jobId, { taskId: task.id, projectId });
        invalidateFeedItems(queryClient);
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['tasks', 'allActive'] });
        queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
        setIsCreating(false);

        if (!window.location.pathname.startsWith('/all')) {
          void navigate({
            to: '/projects/$projectId/tasks/$taskId',
            params: { projectId, taskId: task.id },
          });
        }
      } catch (error) {
        markJobFailed(
          jobId,
          error instanceof Error
            ? error.message
            : 'Failed to create review task',
        );
        setIsCreating(false);
      }
    },
    [
      pr.id,
      projectId,
      navigate,
      queryClient,
      addRunningJob,
      markJobSucceeded,
      markJobFailed,
    ],
  );

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

  const handleSaveTitle = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const nextTitle = titleDraft.trim();
      if (!nextTitle) {
        setTitleError('Title is required');
        return;
      }

      setTitleError(null);
      updateTitle.mutate(nextTitle, {
        onSuccess: () => {
          setIsEditingTitle(false);
        },
        onError: (error) => {
          setTitleError(error.message);
        },
      });
    },
    [titleDraft, updateTitle],
  );

  return (
    <>
      <PrReviewSetupDialog
        isOpen={isReviewSetupOpen}
        onClose={() => setIsReviewSetupOpen(false)}
        onConfirm={handleReview}
        prId={pr.id}
        prTitle={pr.title}
        defaultBackend={defaultReviewBackend}
        defaultModel={defaultReviewModel}
        defaultThinkingEffort="default"
        isCreating={isCreating}
      />

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
            onClick={() => setIsReviewSetupOpen(true)}
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
          <div className="mt-0.5 flex shrink-0 flex-wrap gap-1.5">
            {getStatusBadge(pr.status, pr.isDraft)}
            {pr.mergeStatus === 'conflicts' && (
              <Chip
                size="sm"
                color="red"
                pill
                icon={<AlertTriangle />}
                title="Azure DevOps reports merge conflicts for this pull request"
              >
                Merge conflicts
              </Chip>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* Title */}
            {isEditingTitle ? (
              <form className="space-y-2" onSubmit={handleSaveTitle}>
                <div className="flex items-start gap-2">
                  <Input
                    value={titleDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setTitleDraft(event.target.value)
                    }
                    className="font-mono text-base font-semibold"
                    disabled={updateTitle.isPending}
                    autoFocus
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    icon={
                      updateTitle.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )
                    }
                    disabled={updateTitle.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<X className="h-3.5 w-3.5" />}
                    onClick={() => setIsEditingTitle(false)}
                    disabled={updateTitle.isPending}
                  >
                    Cancel
                  </Button>
                </div>
                {titleError && (
                  <p className="text-xs text-red-400">{titleError}</p>
                )}
              </form>
            ) : (
              <div className="flex items-start gap-2">
                <h1 className="text-ink-0 min-w-0 font-mono text-xl leading-tight font-semibold tracking-tight break-words">
                  {pr.title}
                </h1>
                {canEditTitle && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<Edit3 className="h-3.5 w-3.5" />}
                    onClick={() => setIsEditingTitle(true)}
                    className="mt-0.5 shrink-0"
                  >
                    Edit
                  </Button>
                )}
              </div>
            )}

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
