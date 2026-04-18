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
import { useAiSkillSlotsSetting } from '@/hooks/use-settings';
import { useGenerateSummary, useTaskSummary } from '@/hooks/use-task-summary';
import { useTask } from '@/hooks/use-tasks';
import type { FileAnnotation } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { usePrDraftState } from '@/stores/navigation';
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
  const { prDraft, setPrDraft } = usePrDraftState(taskId);
  const [title, setTitle] = useState(prDraft?.title ?? '');
  const [description, setDescription] = useState(prDraft?.description ?? '');
  const [isDraft, setIsDraft] = useState(true);
  const [annotationStates, setAnnotationStates] = useState<
    Array<{ annotation: FileAnnotation; checked: boolean }>
  >([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [formFilledFromSummary, setFormFilledFromSummary] = useState(false);
  const submittedRef = useRef(false);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    setPrDraft({ title: newTitle, description });
  }

  function handleDescriptionChange(newDescription: string) {
    setDescription(newDescription);
    setPrDraft({ title, description: newDescription });
  }

  const { data: existingSummary } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
  const createPr = useCreatePullRequest();
  const addComments = useAddPrFileComments();

  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const addToast = useToastStore((s) => s.addToast);

  // Check if PR description AI slot is configured (allows empty title/description)
  const { data: globalSlots } = useAiSkillSlotsSetting();
  const canAutoGeneratePrDescription = !!(
    project?.aiSkillSlots?.['pr-description'] || globalSlots?.['pr-description']
  );

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

    // Persist draft
    setPrDraft({ title: generatedTitle, description: desc });

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

    const displayTitle = title.trim() || 'AI-generated PR';

    // 1. Create background job
    const jobId = addRunningJob({
      type: 'pr-creation',
      title: `Creating PR: ${displayTitle}`,
      taskId,
      projectId,
      details: {
        title: displayTitle,
        branchName,
      },
    });

    // 2. Clear persisted draft and close the form
    setPrDraft({ title: '', description: '' });
    onSuccess();

    // 3. Fire-and-forget PR creation (backend generates title/description if empty)
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

  // Allow submit when title is provided, OR when AI generation is configured
  const canSubmit = !!title.trim() || canAutoGeneratePrDescription;

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
        <Plus className="text-ink-2 h-5 w-5" />
        <span className="text-ink-1 text-sm font-medium">
          Create Pull Request
        </span>
      </div>
      <Separator />

      {/* Scrollable form content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* AI hint */}
          {canAutoGeneratePrDescription &&
            !title.trim() &&
            !description.trim() && (
              <div className="text-acc-ink flex items-center gap-2 rounded-md bg-blue-950/30 px-3 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Title and description will be generated by AI when left empty
              </div>
            )}

          {/* Title */}
          <div>
            <label
              htmlFor="pr-title"
              className="text-ink-1 mb-1.5 block text-sm font-medium"
            >
              Title
            </label>
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={
                canAutoGeneratePrDescription
                  ? 'Leave empty for AI generation...'
                  : 'Enter PR title...'
              }
              autoComplete="off"
            />
          </div>

          {/* Description with Generate button */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="pr-description"
                className="text-ink-1 text-sm font-medium"
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
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder={
                canAutoGeneratePrDescription
                  ? 'Leave empty for AI generation...'
                  : 'Enter PR description...'
              }
              rows={8}
              autoComplete="off"
            />
          </div>

          {/* Annotations checklist (only shown after summary) */}
          {annotationStates.length > 0 && (
            <div>
              <label className="text-ink-1 mb-2 block text-sm font-medium">
                Comments to Post
              </label>
              <div className="bg-bg-1/50 border-glass-border max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {annotationStates.map((item, index) => (
                  <div
                    key={`${item.annotation.filePath}:${item.annotation.lineNumber}`}
                    className="hover:bg-glass-medium/50 flex cursor-pointer items-start gap-2 rounded p-1.5 transition-colors"
                  >
                    <Checkbox
                      size="sm"
                      checked={item.checked}
                      onChange={() => toggleAnnotation(index)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink-2 truncate font-mono text-xs">
                        {item.annotation.filePath}:{item.annotation.lineNumber}
                      </div>
                      <div className="text-ink-3 mt-0.5 line-clamp-2 text-xs">
                        {item.annotation.explanation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch info */}
          <div className="text-ink-3 text-xs">
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
            <div className="text-ink-3 text-xs">
              Linked to work item AB#{workItemId}
            </div>
          )}

          {/* Summary generation error */}
          {summaryError && (
            <div className="text-status-fail bg-status-fail/50 rounded-md px-3 py-2 text-sm">
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
          disabled={!canSubmit}
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
