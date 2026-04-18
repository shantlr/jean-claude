import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ListTodo } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
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
    updateWorkItemStatus,
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
      updateWorkItemStatus,
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
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          icon={<ArrowLeft />}
          className="mb-6"
        >
          Back
        </Button>

        <h1 className="mb-6 text-2xl font-bold">New Task</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task name */}
          <div>
            <label
              htmlFor="name"
              className="text-ink-1 mb-1 block text-sm font-medium"
            >
              Name <span className="text-ink-3">(optional)</span>
            </label>
            <Input
              id="name"
              size="md"
              value={name}
              onChange={(e) => setDraft({ name: e.target.value })}
              placeholder="Auto-generated from prompt if empty"
              autoComplete="off"
            />
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="prompt"
              className="text-ink-1 mb-1 block text-sm font-medium"
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
              className="focus:border-glass-border-strong border-glass-border bg-bg-1 text-ink-0 min-h-[200px] rounded-lg border px-3 py-2 focus:ring-1 focus:ring-white/10"
            />
          </div>

          {/* Use worktree checkbox */}
          <div className="space-y-2">
            <Checkbox
              id="useWorktree"
              checked={useWorktree}
              onChange={(checked) => setDraft({ useWorktree: checked })}
              label="Create git worktree for isolation"
            />

            {/* Source branch selector - shown when worktree is checked */}
            {useWorktree && (
              <div className="ml-6">
                <label className="text-ink-2 mb-1 block text-sm font-medium">
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
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWorkItems(true)}
                    icon={<ListTodo />}
                  >
                    {workItemIds?.length
                      ? `From AB#${workItemIds[0]}`
                      : 'From Work Item'}
                  </Button>
                  {workItemIds?.length ? (
                    <div className="ml-1">
                      <Checkbox
                        checked={updateWorkItemStatus}
                        onChange={(checked) =>
                          setDraft({ updateWorkItemStatus: checked })
                        }
                        label="Update linked work item status to Active"
                      />
                    </div>
                  ) : null}
                </div>
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
              variant="secondary"
              size="md"
              onClick={handleCreateOnly}
              loading={createTask.isPending}
              disabled={createTask.isPending || !prompt.trim()}
            >
              Create
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              loading={createTask.isPending}
              disabled={createTask.isPending || !prompt.trim()}
            >
              {createTask.isPending ? 'Creating…' : 'Start'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
