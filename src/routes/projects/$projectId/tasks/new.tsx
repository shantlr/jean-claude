import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ListTodo } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import { BackendSelector } from '@/features/agent/ui-backend-selector';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { WorkItemsBrowser } from '@/features/agent/ui-work-items-browser';
import { PromptTextarea } from '@/features/common/ui-prompt-textarea';
import { useProject, useProjectBranches } from '@/hooks/use-projects';
import { useBackendsSetting, useCompletionSetting } from '@/hooks/use-settings';
import { useProjectSkills } from '@/hooks/use-skills';
import { useCreateTaskWithWorktree } from '@/hooks/use-tasks';
import { useNewTaskFormStore } from '@/stores/new-task-form';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { normalizeInteractionModeForBackend } from '@shared/types';

export const Route = createFileRoute('/projects/$projectId/tasks/new')({
  component: NewTask,
});

function NewTask() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createTask = useCreateTaskWithWorktree();
  const { data: project } = useProject(projectId);
  const { data: branches = [], isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const { data: skills = [] } = useProjectSkills(projectId);

  const { data: completionSetting } = useCompletionSetting();
  const [showWorkItems, setShowWorkItems] = useState(false);
  const hasWorkItemsLink =
    !!project?.workItemProviderId && !!project?.workItemProjectId;

  const { draft, hasDraft, setDraft, clearDraft } =
    useNewTaskFormStore(projectId);
  const {
    name,
    prompt,
    useWorktree,
    sourceBranch,
    interactionMode,
    modelPreference,
    agentBackend,
    workItemIds,
    workItemUrls,
  } = draft;

  // Sync draft backend with project→global default on mount
  const { data: backendsSetting } = useBackendsSetting();
  const resolvedDefaultBackend =
    project?.defaultAgentBackend ?? backendsSetting?.defaultBackend;
  const effectiveAgentBackend =
    agentBackend ??
    (resolvedDefaultBackend &&
    backendsSetting?.enabledBackends.includes(resolvedDefaultBackend)
      ? resolvedDefaultBackend
      : backendsSetting?.enabledBackends[0]) ??
    'claude-code';

  useEffect(() => {
    if (!backendsSetting || !project || hasDraft) return;

    const resolved =
      project.defaultAgentBackend ?? backendsSetting.defaultBackend;
    if (!backendsSetting.enabledBackends.includes(resolved)) return;

    setDraft({
      agentBackend: resolved,
      interactionMode: normalizeInteractionModeForBackend({
        backend: resolved,
        mode: interactionMode,
      }),
    });
  }, [backendsSetting, hasDraft, interactionMode, project, setDraft]);

  const handleBackendChange = (backend: AgentBackendType) => {
    setDraft({
      agentBackend: backend,
      interactionMode: normalizeInteractionModeForBackend({
        backend,
        mode: interactionMode,
      }),
    });
  };

  // Determine the effective source branch (draft value or project default)
  const effectiveSourceBranch =
    sourceBranch ?? project?.defaultBranch ?? branches[0] ?? null;

  async function handleCreateTask(shouldStart: boolean) {
    // Pass null if name is empty - will trigger auto-generation when agent starts
    const taskName = name.trim() || null;

    const task = await createTask.mutateAsync({
      id: nanoid(),
      projectId,
      name: taskName,
      prompt,
      status: 'waiting',
      interactionMode,
      modelPreference,
      agentBackend: effectiveAgentBackend,
      useWorktree,
      workItemIds,
      workItemUrls,
      sourceBranch: useWorktree ? effectiveSourceBranch : null,
      updatedAt: new Date().toISOString(),
      autoStart: shouldStart,
    });

    // Clear the draft now that we've submitted
    clearDraft();

    // Navigate to the task
    navigate({
      to: '/projects/$projectId/tasks/$taskId',
      params: { projectId, taskId: task.id },
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await handleCreateTask(true);
  }

  async function handleCreateOnly() {
    await handleCreateTask(false);
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-xl">
        <Button
          type="button"
          onClick={() =>
            navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <h1 className="mb-6 text-2xl font-bold">New Task</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task name */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name <span className="text-neutral-500">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setDraft({ name: e.target.value })}
              placeholder="Auto-generated from prompt if empty"
              autoComplete="off"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="prompt"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Prompt
            </label>
            <PromptTextarea
              id="prompt"
              value={prompt}
              onChange={(value) => setDraft({ prompt: value })}
              placeholder="Describe what you want the agent to do... (type / for commands)"
              skills={skills}
              showCommands={false}
              projectRoot={project?.path ?? null}
              enableFilePathAutocomplete
              enableCompletion={completionSetting?.enabled ?? false}
              projectId={projectId}
              maxHeight={400}
              className="min-h-[200px] rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-neutral-500 focus:ring-1 focus:ring-white/10"
            />
          </div>

          {/* Use worktree checkbox */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="useWorktree"
                type="checkbox"
                checked={useWorktree}
                onChange={(e) => setDraft({ useWorktree: e.target.checked })}
                className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
              />
              <label
                htmlFor="useWorktree"
                className="cursor-pointer text-sm text-neutral-300"
              >
                Create git worktree for isolation
              </label>
            </div>

            {/* Source branch selector - shown when worktree is checked */}
            {useWorktree && (
              <div className="ml-6">
                <label className="mb-1 block text-sm font-medium text-neutral-400">
                  Base branch
                </label>
                <Select
                  value={
                    branchesLoading
                      ? ''
                      : (effectiveSourceBranch ?? branches[0] ?? '')
                  }
                  options={
                    branchesLoading
                      ? [{ value: '', label: 'Loading branches…' }]
                      : branches.length === 0
                        ? [{ value: '', label: 'No branches found' }]
                        : branches.map((branch) => ({
                            value: branch,
                            label:
                              branch +
                              (branch === project?.defaultBranch
                                ? ' (default)'
                                : ''),
                          }))
                  }
                  onChange={(value) =>
                    setDraft({ sourceBranch: value || null })
                  }
                  disabled={branchesLoading}
                  className="w-full justify-between"
                />
              </div>
            )}
          </div>

          {/* Work Items */}
          {hasWorkItemsLink && (
            <div>
              {showWorkItems ? (
                <WorkItemsBrowser
                  localProjectId={projectId}
                  providerId={project!.workItemProviderId!}
                  projectId={project!.workItemProjectId!}
                  projectName={project!.workItemProjectName!}
                  onSelect={(wi) => {
                    setDraft({
                      name: wi.fields.title.slice(0, 100),
                      prompt:
                        `[AB#${wi.id}] ${wi.fields.title}\n\n${wi.fields.description ?? ''}`.trim(),
                      workItemIds: [String(wi.id)],
                      workItemUrls: [wi.url],
                    });
                    setShowWorkItems(false);
                  }}
                  onClose={() => setShowWorkItems(false)}
                />
              ) : (
                <Button
                  type="button"
                  onClick={() => setShowWorkItems(true)}
                  className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  <ListTodo className="h-4 w-4" aria-hidden />
                  {workItemIds?.length
                    ? `From AB#${workItemIds[0]}`
                    : 'From Work Item'}
                </Button>
              )}
            </div>
          )}

          {/* Submit row with mode selector */}
          <div className="flex items-center gap-3">
            <ModeSelector
              value={interactionMode}
              onChange={(mode) => setDraft({ interactionMode: mode })}
              backend={effectiveAgentBackend}
            />
            <ModelSelector
              value={modelPreference}
              onChange={(model) => setDraft({ modelPreference: model })}
            />
            <BackendSelector
              value={effectiveAgentBackend}
              onChange={handleBackendChange}
            />
            <Button
              type="button"
              onClick={handleCreateOnly}
              loading={createTask.isPending}
              disabled={createTask.isPending || !prompt.trim()}
              className="cursor-pointer rounded-lg border border-neutral-600 px-4 py-2 font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </Button>
            <Button
              type="submit"
              loading={createTask.isPending}
              disabled={createTask.isPending || !prompt.trim()}
              className="cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTask.isPending ? 'Creating…' : 'Start'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
