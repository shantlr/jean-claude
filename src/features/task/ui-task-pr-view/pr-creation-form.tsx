import { Sparkles, Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { Separator } from '@/common/ui/separator';
import { Textarea } from '@/common/ui/textarea';
import {
  useCreatePullRequest,
  useAddPrFileComments,
} from '@/hooks/use-create-pull-request';
import { useProject } from '@/hooks/use-projects';
import { useGenerateSummary, useTaskSummary } from '@/hooks/use-task-summary';
import { useTask } from '@/hooks/use-tasks';
import type { FileAnnotation } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useToastStore } from '@/stores/toasts';

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
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [formFilledFromSummary, setFormFilledFromSummary] = useState(false);
  const submittedRef = useRef(false);

  const { data: existingSummary } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
  const createPr = useCreatePullRequest();
  const addComments = useAddPrFileComments();

  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const addToast = useToastStore((s) => s.addToast);

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
    setSummaryError(null);

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
      setSummaryError(
        err instanceof Error ? err.message : 'Failed to generate summary',
      );
    }
  }

  function handleCreate() {
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Collect checked annotations before closing
    const checkedAnnotations = annotationStates
      .filter((a) => a.checked)
      .map((a) => ({
        filePath: a.annotation.filePath,
        line: a.annotation.lineNumber,
        content: `jean-claude: ${a.annotation.explanation}`,
      }));

    // 1. Create background job
    const jobId = addRunningJob({
      type: 'pr-creation',
      title: `Creating PR: ${title}`,
      taskId,
      projectId,
      details: {
        title,
        branchName,
      },
    });

    // 2. Close the form immediately
    onSuccess();

    // 3. Fire-and-forget PR creation
    void createPr
      .mutateAsync({
        taskId,
        title,
        description,
        isDraft,
      })
      .then(async (result) => {
        // Post comments for checked annotations
        if (checkedAnnotations.length > 0) {
          try {
            await addComments.mutateAsync({
              providerId: repoProviderId,
              projectId: repoProjectId,
              repoId,
              pullRequestId: result.id,
              comments: checkedAnnotations,
            });
          } catch {
            // Comments are best-effort; don't fail the job
            addToast({
              type: 'error',
              message: 'PR created, but some comments could not be posted',
            });
          }
        }

        markJobSucceeded(jobId);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Failed to create PR';
        markJobFailed(jobId, message);
        addToast({ type: 'error', message });
      });
  }

  function toggleAnnotation(index: number) {
    setAnnotationStates((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  const canSubmit = !!title.trim();

  useCommands('pr-creation-form', [
    canSubmit && {
      label: 'Submit PR',
      shortcut: 'cmd+enter',
      handler: () => {
        handleCreate();
      },
      hideInCommandPalette: true,
    },
  ]);

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
      <div className="flex items-center gap-2 px-4 py-3">
        <Plus className="h-5 w-5 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200">
          Create Pull Request
        </span>
      </div>
      <Separator />

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
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter PR title..."
              autoComplete="off"
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
              <Button
                type="button"
                onClick={handleFillFromSummary}
                disabled={generateSummary.isPending || formFilledFromSummary}
                loading={generateSummary.isPending}
                variant="secondary"
                size="sm"
                icon={!generateSummary.isPending ? <Sparkles /> : undefined}
              >
                {getSummaryButtonLabel()}
              </Button>
            </div>
            <Textarea
              id="pr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter PR description..."
              rows={8}
              autoComplete="off"
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
                  <div
                    key={`${item.annotation.filePath}:${item.annotation.lineNumber}`}
                    className="flex cursor-pointer items-start gap-2 rounded p-1.5 transition-colors hover:bg-neutral-700/50"
                  >
                    <Checkbox
                      size="sm"
                      checked={item.checked}
                      onChange={() => toggleAnnotation(index)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-neutral-400">
                        {item.annotation.filePath}:{item.annotation.lineNumber}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                        {item.annotation.explanation}
                      </div>
                    </div>
                  </div>
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
          <Checkbox
            checked={isDraft}
            onChange={setIsDraft}
            label="Create as draft"
          />

          {/* Work item reference */}
          {workItemId && (
            <div className="text-xs text-neutral-500">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Summary generation error */}
          {summaryError && (
            <div className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {summaryError}
            </div>
          )}
        </div>
      </div>

      {/* Footer with buttons */}
      <Separator />
      <div className="flex gap-2 p-4">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim()}
          variant="primary"
          className="flex-1"
        >
          <span className="flex items-center gap-1.5">
            Create PR <Kbd shortcut="cmd+enter" />
          </span>
        </Button>
      </div>
    </div>
  );
}
