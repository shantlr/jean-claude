import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { FormEvent } from 'react';

import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { useCreateTask } from '@/hooks/use-tasks';
import { api } from '@/lib/api';
import { useNewTaskFormStore } from '@/stores/new-task-form';

export const Route = createFileRoute('/projects/$projectId/tasks/new')({
  component: NewTask,
});

function NewTask() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createTask = useCreateTask();

  const { getDraft, setDraft, clearDraft } = useNewTaskFormStore();
  const { name, prompt, useWorktree, interactionMode } = getDraft(projectId);

  async function handleCreateTask(shouldStart: boolean) {
    // Auto-generate name from first line of prompt if empty
    const taskName = name.trim() || prompt.split('\n')[0].slice(0, 50) || 'Untitled task';

    const task = await createTask.mutateAsync({
      id: nanoid(),
      projectId,
      name: taskName,
      prompt,
      status: 'waiting',
      interactionMode,
      updatedAt: new Date().toISOString(),
    });

    // Clear the draft now that we've submitted
    clearDraft(projectId);

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
          onClick={() => navigate({ to: '/projects/$projectId', params: { projectId } })}
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
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
              onChange={(e) => setDraft(projectId, { name: e.target.value })}
              placeholder="Auto-generated from prompt if empty"
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
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setDraft(projectId, { prompt: e.target.value })}
              placeholder="Describe what you want the agent to do..."
              rows={8}
              required
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Use worktree checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="useWorktree"
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setDraft(projectId, { useWorktree: e.target.checked })}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label htmlFor="useWorktree" className="cursor-pointer text-sm text-neutral-300">
              Create git worktree for isolation
            </label>
          </div>

          {/* Submit row with mode selector */}
          <div className="flex items-center gap-3">
            <ModeSelector value={interactionMode} onChange={(mode) => setDraft(projectId, { interactionMode: mode })} />
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
              {createTask.isPending ? 'Creating...' : 'Start'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
