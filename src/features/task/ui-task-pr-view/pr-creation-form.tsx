import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useRef,
  useState,
} from 'react';
import { Image, Plus, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';


import {
  isVideoFile,
  VideoGifConverter,
} from '@/features/common/ui-video-gif-converter';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import {
  useAddPrFileComments,
  useCreatePullRequest,
} from '@/hooks/use-create-pull-request';
import { useGenerateSummary, useTaskSummary } from '@/hooks/use-task-summary';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import type { FileAnnotation } from '@/lib/api';
import { formatBytes } from '@/lib/format-bytes';
import { Input } from '@/common/ui/input';
import { invalidateFeedResource } from '@/cache/feed-cache';
import { Kbd } from '@/common/ui/kbd';
import type { PromptImagePart } from '@shared/agent-backend-types';
import { Separator } from '@/common/ui/separator';
import { Textarea } from '@/common/ui/textarea';
import { useAiSkillSlotsSetting } from '@/hooks/use-settings';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useCommands } from '@/common/hooks/use-commands';
import { usePrDraftState } from '@/stores/navigation';
import { useProject } from '@/hooks/use-projects';
import { useTask } from '@/hooks/use-tasks';
import { useToastStore } from '@/stores/toasts';
import { useWorktreeStatus } from '@/hooks/use-worktree-diff';



type StagedPrImage = PromptImagePart & { placeholderMarkdown: string };

function placeholderPattern(placeholderMarkdown: string) {
  const token = placeholderMarkdown.match(/jc-image:\/\/([^)]+)/)?.[1];
  return token
    ? new RegExp(`!\\[[^\\]]*\\]\\(jc-image:\\/\\/${token}\\)`, 'g')
    : null;
}

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
  const [commitUnstaged, setCommitUnstaged] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [formFilledFromSummary, setFormFilledFromSummary] = useState(false);
  const [stagedImages, setStagedImages] = useState<StagedPrImage[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTokenCounterRef = useRef(0);
  const submittedRef = useRef(false);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const { data: worktreeStatus } = useWorktreeStatus(taskId);
  const hasUncommittedChanges = worktreeStatus?.hasUncommittedChanges ?? false;

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      setPrDraft({ title: newTitle, description });
    },
    [description, setPrDraft],
  );

  const updateDescription = useCallback(
    (updater: string | ((current: string) => string)) => {
      setDescription((current) => {
        const next = typeof updater === 'function' ? updater(current) : updater;
        setPrDraft({ title, description: next });
        return next;
      });
    },
    [setPrDraft, title],
  );

  const handleDescriptionChange = useCallback(
    (newDescription: string) => {
      updateDescription(newDescription);
    },
    [updateDescription],
  );

  const insertDescriptionMarkdown = useCallback(
    (markdown: string) => {
      const textarea = descriptionRef.current;
      if (!textarea) {
        updateDescription(
          (current) => `${current}${current ? '\n\n' : ''}${markdown}`,
        );
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      updateDescription(
        (current) =>
          `${current.slice(0, start)}${markdown}${current.slice(end)}`,
      );
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + markdown.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [updateDescription],
  );

  const stageDescriptionImage = useCallback(
    (image: PromptImagePart) => {
      if (stagedImages.length >= MAX_IMAGES) {
        addToast({
          type: 'error',
          message: `Only ${MAX_IMAGES} images or GIFs can be attached.`,
        });
        return;
      }

      imageTokenCounterRef.current += 1;
      const token = imageTokenCounterRef.current;
      const fileName = image.filename || `image-${token}.png`;
      const safeAltText = fileName.replace(/[[\]()\\]/g, '_');
      const placeholderMarkdown = `![${safeAltText}](jc-image://${token})`;

      insertDescriptionMarkdown(placeholderMarkdown);
      setStagedImages((current) => [
        ...current,
        { ...image, placeholderMarkdown },
      ]);
    },
    [addToast, insertDescriptionMarkdown, stagedImages.length],
  );

  const removeStagedImage = useCallback(
    (index: number) => {
      const image = stagedImages[index];
      if (!image) return;
      updateDescription((current) =>
        current.replace(image.placeholderMarkdown, ''),
      );
      setStagedImages((current) => current.filter((_, i) => i !== index));
    },
    [stagedImages, updateDescription],
  );

  const stageImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      if (imageFiles.length === 0 && !nextVideoFile) return;

      const allowed = MAX_IMAGES - stagedImages.length;
      if (allowed <= 0) return;

      try {
        await Promise.all(
          imageFiles
            .slice(0, allowed)
            .map((file) =>
              processImageFile(file, stageDescriptionImage, (message) =>
                addToast({ type: 'error', message }),
              ),
            ),
        );
        if (nextVideoFile && allowed > imageFiles.length) {
          setVideoFile(nextVideoFile);
        }
      } catch (error) {
        addToast({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to stage image',
        });
      }
    },
    [addToast, stageDescriptionImage, stagedImages.length],
  );

  const handleImageSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      await stageImageFiles(Array.from(event.target.files ?? []));
      event.target.value = '';
    },
    [stageImageFiles],
  );

  const handleDescriptionPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files);
      if (
        files.some(
          (file) => file.type.startsWith('image/') || isVideoFile(file),
        )
      ) {
        event.preventDefault();
        void stageImageFiles(files);
      }
    },
    [stageImageFiles],
  );

  const handleDescriptionDrop = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.dataTransfer.files);
      if (
        files.some(
          (file) => file.type.startsWith('image/') || isVideoFile(file),
        )
      ) {
        event.preventDefault();
        void stageImageFiles(files);
      }
    },
    [stageImageFiles],
  );

  const handleDescriptionDragOver = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      if (Array.from(event.dataTransfer.types).includes('Files')) {
        event.preventDefault();
      }
    },
    [],
  );

  const { data: existingSummary } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
  const createPr = useCreatePullRequest();
  const addComments = useAddPrFileComments();

  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
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
    const descriptionToCreate = description;
    const imagesToUpload = stagedImages;

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
        description: descriptionToCreate,
        isDraft,
        commitUnstaged: hasUncommittedChanges ? commitUnstaged : undefined,
      })
      .then(async (result) => {
        let warningMessage = result.editorCloseWarning ?? null;

        if (imagesToUpload.length > 0) {
          try {
            let updatedDescription = descriptionToCreate;
            for (const image of imagesToUpload) {
              const attachment =
                await api.azureDevOps.uploadPullRequestAttachment({
                  providerId: repoProviderId,
                  projectId: repoProjectId,
                  repoId,
                  pullRequestId: result.id,
                  fileName: image.filename || 'image.png',
                  mimeType: image.storageMimeType ?? image.mimeType,
                  dataBase64: image.storageData ?? image.data,
                });
              const pattern = placeholderPattern(image.placeholderMarkdown);
              updatedDescription = pattern
                ? updatedDescription.replace(
                    pattern,
                    image.placeholderMarkdown.replace(
                      /\([^)]*\)$/,
                      `(${attachment.url})`,
                    ),
                  )
                : updatedDescription;
            }
            await api.azureDevOps.updatePullRequestDescription({
              providerId: repoProviderId,
              projectId: repoProjectId,
              repoId,
              pullRequestId: result.id,
              description: updatedDescription,
            });
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ['pull-request', projectId, result.id],
              }),
              queryClient.invalidateQueries({
                queryKey: ['pull-requests', projectId],
              }),
              queryClient.invalidateQueries({
                queryKey: ['all-projects-pull-requests'],
              }),
              queryClient.invalidateQueries({ queryKey: ['tasks', taskId] }),
            ]);
            invalidateFeedResource(queryClient, 'pullRequests');
          } catch {
            warningMessage = warningMessage
              ? `${warningMessage}\nPR created, but attachments could not be uploaded.`
              : 'PR created, but attachments could not be uploaded.';
          }
        }

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
            void api.preferenceMemory
              .recordEvidence({
                source: 'pr-file-comment',
                taskId,
                projectId,
                comments: checkedAnnotations.map((annotation) => ({
                  body: annotation.content,
                  filePath: annotation.filePath,
                  lineStart: annotation.line,
                  pullRequestId: result.id,
                })),
                context: {
                  repoId,
                  azureProjectId: repoProjectId,
                  pullRequestTitle: displayTitle,
                  pullRequestUrl: result.url,
                },
              })
              .catch((error: unknown) => {
                console.warn('Failed to record preference evidence', error);
              });
          } catch {
            // Comments are best-effort; don't fail the job
            addToast({
              type: 'error',
              message: 'PR created, but some comments could not be posted',
            });
          }
        }

        markJobSucceeded(jobId, {
          warningMessage,
        });
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
  // Block submit if uncommitted changes exist and checkbox not checked
  const canSubmit =
    (!!title.trim() || canAutoGeneratePrDescription) &&
    (!hasUncommittedChanges || commitUnstaged);

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
              ref={descriptionRef}
              id="pr-description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onPaste={handleDescriptionPaste}
              onDrop={handleDescriptionDrop}
              onDragOver={handleDescriptionDragOver}
              placeholder={
                canAutoGeneratePrDescription
                  ? 'Leave empty for AI generation...'
                  : 'Enter PR description...'
              }
              rows={8}
              autoComplete="off"
            />
            {stagedImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stagedImages.map((image, index) => (
                  <div
                    key={`${image.filename ?? 'img'}-${index}`}
                    className="group relative"
                  >
                    <img
                      src={`data:${image.storageMimeType ?? image.mimeType};base64,${image.storageData ?? image.data}`}
                      alt={image.filename || 'Attached image'}
                      title={
                        image.sizeBytes
                          ? formatBytes(image.sizeBytes)
                          : undefined
                      }
                      className="h-10 w-10 rounded border border-white/10 object-cover"
                    />
                    {image.sizeBytes && (
                      <span className="absolute right-0 bottom-0 left-0 rounded-b bg-black/70 px-0.5 text-center font-mono text-[8px] leading-3 text-white">
                        {formatBytes(image.sizeBytes)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStagedImage(index)}
                      className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                      aria-label="Remove image"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleImageSelection}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              icon={<Image className="h-3.5 w-3.5" />}
              onClick={() => imageInputRef.current?.click()}
            >
              Add image/GIF
            </Button>
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

          {/* Checkboxes */}
          <div className="flex flex-col gap-3">
            <Checkbox
              checked={isDraft}
              onChange={setIsDraft}
              label="Create as draft"
            />

            {hasUncommittedChanges && (
              <Checkbox
                checked={commitUnstaged}
                onChange={setCommitUnstaged}
                label="Commit unstaged changes before creating PR"
              />
            )}
          </div>

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
      <VideoGifConverter
        file={videoFile}
        onAttach={stageDescriptionImage}
        onClose={() => setVideoFile(null)}
      />
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
