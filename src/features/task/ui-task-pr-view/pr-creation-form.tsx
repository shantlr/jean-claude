import { Loader2, Sparkles, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  useCreatePullRequest,
  usePushBranch,
  useAddPrFileComments,
} from '@/hooks/use-create-pull-request';
import { useProject } from '@/hooks/use-projects';
import { useGenerateSummary, useTaskSummary } from '@/hooks/use-task-summary';
import { useTask, useUpdateTask } from '@/hooks/use-tasks';
import type { FileAnnotation } from '@/lib/api';

export function PrCreationForm({
  taskId,
  projectId,
  onSuccess,
  onCancel,
}: {
  taskId: string;
  projectId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { data: task } = useTask(taskId);
  const { data: project } = useProject(projectId);

  // Derive values from task and project
  const taskName = task?.name ?? null;
  const taskPrompt = task?.prompt ?? '';
  const branchName = task?.branchName ?? '';
  const workItemId = task?.workItemIds?.[0] ?? null;
  const targetBranch = task?.sourceBranch ?? project?.defaultBranch ?? 'main';
  const repoProviderId = project?.repoProviderId ?? '';
  const repoProjectId = project?.repoProjectId ?? '';
  const repoId = project?.repoId ?? '';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDraft, setIsDraft] = useState(true);
  const [annotationStates, setAnnotationStates] = useState<
    Array<{ annotation: FileAnnotation; checked: boolean }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [formFilledFromSummary, setFormFilledFromSummary] = useState(false);

  const { data: existingSummary } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
  const pushBranch = usePushBranch();
  const createPr = useCreatePullRequest();
  const addComments = useAddPrFileComments();
  const updateTask = useUpdateTask();

  const isPending =
    pushBranch.isPending ||
    createPr.isPending ||
    addComments.isPending ||
    updateTask.isPending;

  // Helper to populate form from a summary
  function fillFormFromSummary(summary: {
    summary: { whatIDid: string; keyDecisions: string };
    annotations: FileAnnotation[];
  }) {
    // Populate title
    const generatedTitle = taskName ?? taskPrompt.split('\n')[0].slice(0, 100);
    setTitle(generatedTitle);

    // Populate description
    const workItemRef = workItemId ? `AB#${workItemId}\n\n` : '';
    const desc = `${workItemRef}## What I Did\n${summary.summary.whatIDid}\n\n## Key Decisions\n${summary.summary.keyDecisions}`;
    setDescription(desc);

    // Populate annotations
    if (summary.annotations) {
      setAnnotationStates(
        summary.annotations.map((annotation) => ({
          annotation,
          checked: true,
        })),
      );
    }

    setFormFilledFromSummary(true);
  }

  async function handleFillFromSummary() {
    setError(null);

    // If we already have a summary, use it to fill the form
    if (existingSummary) {
      fillFormFromSummary(existingSummary);
      return;
    }

    // Otherwise, generate a new summary
    try {
      const summary = await generateSummary.mutateAsync(taskId);
      fillFormFromSummary(summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate summary',
      );
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      // Step 1: Push branch
      await pushBranch.mutateAsync(taskId);

      // Step 2: Create PR
      const result = await createPr.mutateAsync({
        providerId: repoProviderId,
        projectId: repoProjectId,
        repoId,
        sourceBranch: branchName,
        targetBranch,
        title,
        description,
        isDraft,
      });

      // Step 3: Post comments for checked annotations
      const checkedAnnotations = annotationStates
        .filter((a) => a.checked)
        .map((a) => ({
          filePath: a.annotation.filePath,
          line: a.annotation.lineNumber,
          content: `jean-claude: ${a.annotation.explanation}`,
        }));

      if (checkedAnnotations.length > 0) {
        await addComments.mutateAsync({
          providerId: repoProviderId,
          projectId: repoProjectId,
          repoId,
          pullRequestId: result.id,
          comments: checkedAnnotations,
        });
      }

      // Step 4: Save PR info to task
      await updateTask.mutateAsync({
        id: taskId,
        data: {
          pullRequestId: String(result.id),
          pullRequestUrl: result.url,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    }
  }

  function toggleAnnotation(index: number) {
    setAnnotationStates((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  const hasSummary = !!(generateSummary.data ?? existingSummary);

  // Button label logic:
  // - If generating: "Generating..."
  // - If form already filled from summary: "Filled"
  // - If summary exists but form not filled: "Fill from Summary"
  // - If no summary: "Generate Summary"
  const getSummaryButtonLabel = () => {
    if (generateSummary.isPending) return 'Generating...';
    if (formFilledFromSummary) return 'Filled';
    if (hasSummary) return 'Fill from Summary';
    return 'Generate Summary';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
        <Plus className="h-5 w-5 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200">
          Create Pull Request
        </span>
      </div>

      {/* Scrollable form content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="pr-title"
              className="mb-1.5 block text-sm font-medium text-neutral-300"
            >
              Title
            </label>
            <input
              id="pr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter PR title..."
              autoComplete="off"
              className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/50 focus:outline-none"
            />
          </div>

          {/* Description with Generate button */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="pr-description"
                className="text-sm font-medium text-neutral-300"
              >
                Description
              </label>
              <button
                type="button"
                onClick={handleFillFromSummary}
                disabled={generateSummary.isPending || formFilledFromSummary}
                className="flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generateSummary.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {getSummaryButtonLabel()}
              </button>
            </div>
            <textarea
              id="pr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter PR description..."
              rows={8}
              autoComplete="off"
              className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-500/50 focus:outline-none"
            />
          </div>

          {/* Annotations checklist (only shown after summary) */}
          {annotationStates.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-300">
                Comments to Post
              </label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-800/50 p-2">
                {annotationStates.map((item, index) => (
                  <label
                    key={`${item.annotation.filePath}:${item.annotation.lineNumber}`}
                    className="flex cursor-pointer items-start gap-2 rounded p-1.5 transition-colors hover:bg-neutral-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleAnnotation(index)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-neutral-400">
                        {item.annotation.filePath}:{item.annotation.lineNumber}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                        {item.annotation.explanation}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Branch info */}
          <div className="text-xs text-neutral-500">
            <span className="font-mono">{branchName}</span>
            <span className="mx-2">&rarr;</span>
            <span className="font-mono">{targetBranch}</span>
          </div>

          {/* Draft checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="isDraft"
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label
              htmlFor="isDraft"
              className="cursor-pointer text-sm text-neutral-300"
            >
              Create as draft
            </label>
          </div>

          {/* Work item reference */}
          {workItemId && (
            <div className="text-xs text-neutral-500">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer with buttons */}
      <div className="flex gap-2 border-t border-neutral-700 p-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 cursor-pointer rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !title.trim()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {isPending ? 'Creating...' : 'Create PR'}
        </button>
      </div>
    </div>
  );
}
