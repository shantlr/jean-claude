import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ListTodo } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { WorkItemsBrowser } from '@/features/agent/ui-work-items-browser';
import { PromptTextarea } from '@/features/common/ui-prompt-textarea';
import { useProject, useProjectBranches } from '@/hooks/use-projects';
import { useProjectSkills } from '@/hooks/use-skills';
import { useCreateTaskWithWorktree } from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import { useNewTaskFormStore } from '@/stores/new-task-form';

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

  const [showWorkItems, setShowWorkItems] = useState(false);
  const hasWorkItemsLink =
    !!project?.workItemProviderId && !!project?.workItemProjectId;

  const { draft, setDraft, clearDraft } = useNewTaskFormStore(projectId);
  const {
    name,
    prompt,
    useWorktree,
    sourceBranch,
    interactionMode,
    workItemId,
    workItemUrl,
  } = draft;

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
      useWorktree,
      workItemId,
      workItemUrl,
      sourceBranch: useWorktree ? effectiveSourceBranch : null,
      updatedAt: new Date().toISOString(),
    });

    // Clear the draft now that we've submitted
    clearDraft();

    // Navigate to the task first
    navigate({
      to: '/projects/$projectId/tasks/$taskId',
      params: { projectId, taskId: task.id },
    });

    // Start the agent after navigation if requested
    if (shouldStart) {
      api.agent.start(task.id);
    }
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
        <button
          type="button"
          onClick={() =>
            navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>

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
              maxHeight={400}
              className="min-h-[200px] border-neutral-700 bg-neutral-800 text-white focus:border-neutral-500"
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
                <label
                  htmlFor="sourceBranch"
                  className="mb-1 block text-sm font-medium text-neutral-400"
                >
                  Base branch
                </label>
                <select
                  id="sourceBranch"
                  value={effectiveSourceBranch ?? ''}
                  onChange={(e) =>
                    setDraft({ sourceBranch: e.target.value || null })
                  }
                  disabled={branchesLoading}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none disabled:opacity-50"
                >
                  {branchesLoading ? (
                    <option value="">Loading branches…</option>
                  ) : branches.length === 0 ? (
                    <option value="">No branches found</option>
                  ) : (
                    branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                        {branch === project?.defaultBranch ? ' (default)' : ''}
                      </option>
                    ))
                  )}
                </select>
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
                      workItemId: String(wi.id),
                      workItemUrl: wi.url,
                    });
                    setShowWorkItems(false);
                  }}
                  onClose={() => setShowWorkItems(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowWorkItems(true)}
                  className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  <ListTodo className="h-4 w-4" aria-hidden />
                  {workItemId ? `From AB#${workItemId}` : 'From Work Item'}
                </button>
              )}
            </div>
          )}

          {/* Submit row with mode selector */}
          <div className="flex items-center gap-3">
            <ModeSelector
              value={interactionMode}
              onChange={(mode) => setDraft({ interactionMode: mode })}
            />
            <button
              type="button"
              onClick={handleCreateOnly}
              disabled={createTask.isPending || !prompt.trim()}
              className="cursor-pointer rounded-lg border border-neutral-600 px-4 py-2 font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="submit"
              disabled={createTask.isPending || !prompt.trim()}
              className="cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTask.isPending ? 'Creating…' : 'Start'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
