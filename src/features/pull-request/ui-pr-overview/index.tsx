import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
} from 'react';
import { Edit3, Image, Loader2, Save, X } from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';


import type {
  AzureDevOpsCommentThread,
  AzureDevOpsFileChange,
  AzureDevOpsPullRequestDetails,
} from '@/lib/api';
import {
  type DiffFile,
  FileDiffContent,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import {
  getAllowedMergeStrategies,
  useCurrentAzureUser,
  useLinkWorkItemToPr,
  usePullRequestFileContent,
  usePullRequestPolicyEvaluations,
  usePullRequestWorkItems,
  useRequeuePolicyEvaluation,
  useSetAutoComplete,
  useUnlinkWorkItemFromPr,
  useUpdatePullRequestDescription,
  useUploadPullRequestAttachment,
} from '@/hooks/use-pull-requests';
import {
  isVideoFile,
  VideoGifConverter,
} from '@/features/common/ui-video-gif-converter';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import {
  type MentionDisplayNames,
  normalizeMentionId,
} from '@/lib/azure-devops-mentions';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import { Button } from '@/common/ui/button';
import { formatBytes } from '@/lib/format-bytes';
import type { MentionOption } from '@/common/ui/mention-textarea';
import type { PromptImagePart } from '@shared/agent-backend-types';
import type { PullRequestRepoInfo } from '@/hooks/use-pull-requests';
import { Textarea } from '@/common/ui/textarea';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';



import {
  convertPrThreadsForFile,
  PrInlineCommentThread,
} from '../ui-pr-inline-comment-thread';
import { CIInlinePanel } from '../ui-pr-ci-inline';
import { PrChecks } from '../ui-pr-checks';
import { PrComments } from '../ui-pr-comments';
import { PrMetaPanel } from '../ui-pr-meta-panel';



type PendingDescriptionImage = PromptImagePart & {
  placeholderMarkdown: string;
};

function placeholderToken(placeholderMarkdown: string) {
  return placeholderMarkdown.match(/jc-image:\/\/([^)]+)/)?.[1] ?? null;
}

function placeholderPattern(placeholderMarkdown: string) {
  const token = placeholderToken(placeholderMarkdown);
  return token
    ? new RegExp(`!\\[[^\\]]*\\]\\(jc-image:\\/\\/${token}\\)`, 'g')
    : null;
}

function descriptionPreviewMarkdown(
  markdown: string,
  images: PendingDescriptionImage[],
) {
  return images.reduce((current, image) => {
    const dataUrl = `data:${image.storageMimeType ?? image.mimeType};base64,${image.storageData ?? image.data}`;
    const pattern = placeholderPattern(image.placeholderMarkdown);
    if (!pattern) return current;
    return current.replace(
      pattern,
      image.placeholderMarkdown.replace(/\]\([^)]*\)$/, `](${dataUrl})`),
    );
  }, markdown);
}

export function PrOverview({
  pr,
  projectId,
  prId,
  providerId,
  azureProjectId,
  repoId: _repoId,
  azureProjectName,
  threads = [],
  onAddComment,
  onUploadImage,
  isAddingComment,
  bottomPadding = 0,
  fileCount = 0,
  files = [],
  mentionOptions = [],
  onSearchMentions,
  repoInfo,
  readOnly = false,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
  prId: number;
  providerId?: string;
  azureProjectId?: string;
  repoId?: string;
  azureProjectName?: string;
  threads?: AzureDevOpsCommentThread[];
  onAddComment?: (content: string) => void;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
  isAddingComment?: boolean;
  bottomPadding?: number;
  fileCount?: number;
  files?: AzureDevOpsFileChange[];
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  repoInfo?: PullRequestRepoInfo;
  readOnly?: boolean;
}) {
  const [filePreview, setFilePreview] = useState<{
    filePath: string;
    lineStart: number;
    lineEnd: number;
  } | null>(null);
  const [filePreviewWidth, setFilePreviewWidth] = useState(560);
  // Track which build is expanded inline in the checks block
  const [expandedBuildId, setExpandedBuildId] = useState<number | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(pr.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [pendingDescriptionImages, setPendingDescriptionImages] = useState<
    PendingDescriptionImage[]
  >([]);
  const [descriptionVideoFile, setDescriptionVideoFile] = useState<File | null>(
    null,
  );
  const pendingDescriptionImagesRef = useRef<PendingDescriptionImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionImageTokenCounterRef = useRef(0);

  const { data: currentUser } = useCurrentAzureUser(projectId, repoInfo);
  const updateDescription = useUpdatePullRequestDescription(
    projectId,
    prId,
    repoInfo,
  );
  const uploadAttachment = useUploadPullRequestAttachment(
    projectId,
    prId,
    repoInfo,
  );

  const currentUserEmail = currentUser?.emailAddress.toLowerCase();
  const ownerEmail = pr.createdBy.uniqueName.toLowerCase();
  const canEditDescription =
    !readOnly &&
    !!currentUser &&
    (currentUser.identityId === pr.createdBy.id ||
      currentUser.id === pr.createdBy.id ||
      currentUserEmail === ownerEmail);

  const mentionDisplayNames = useMemo(() => {
    const names: MentionDisplayNames = {};
    const addName = (
      id: string | undefined,
      displayName: string | undefined,
    ) => {
      if (id && displayName) names[normalizeMentionId(id)] = displayName;
    };

    addName(pr.createdBy.id, pr.createdBy.displayName);
    for (const reviewer of pr.reviewers) {
      addName(reviewer.id, reviewer.displayName);
    }
    addName(currentUser?.id, currentUser?.displayName);
    addName(currentUser?.identityId, currentUser?.displayName);
    for (const thread of threads) {
      for (const comment of thread.comments) {
        addName(comment.author.id, comment.author.displayName);
      }
    }

    return names;
  }, [currentUser, pr.createdBy, pr.reviewers, threads]);

  // Debounce draft for preview to avoid re-rendering markdown+GIFs on every keystroke
  const debouncedDescriptionDraft = useDebouncedValue(descriptionDraft, 300);
  const previewDescriptionDraft = useMemo(
    () =>
      descriptionPreviewMarkdown(
        debouncedDescriptionDraft,
        pendingDescriptionImages,
      ),
    [debouncedDescriptionDraft, pendingDescriptionImages],
  );

  useEffect(() => {
    if (!isEditingDescription) {
      startTransition(() => setDescriptionDraft(pr.description));
      startTransition(() => setDescriptionError(null));
      pendingDescriptionImagesRef.current = [];
      startTransition(() => setPendingDescriptionImages([]));
    }
  }, [isEditingDescription, pr.description]);

  const handleExpandCheck = useCallback((buildId: number | null) => {
    setExpandedBuildId(buildId);
  }, []);

  const {
    containerRef: previewResizeContainerRef,
    isDragging: isPreviewDragging,
    handleMouseDown: handlePreviewResizeMouseDown,
  } = useHorizontalResize({
    initialWidth: filePreviewWidth,
    minWidth: 320,
    maxWidthFraction: 0.75,
    direction: 'left',
    onWidthChange: setFilePreviewWidth,
  });

  // Track which evaluations were recently queued by the user
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());

  // Poll faster when there are active/queued builds
  const hasActiveBuilds = queuedIds.size > 0;

  const { data: evaluations = [], isLoading: isChecksLoading } =
    usePullRequestPolicyEvaluations(
      projectId,
      prId,
      {
        refetchInterval: hasActiveBuilds ? 10_000 : false,
      },
      repoInfo,
    );

  const { data: workItems = [], isLoading: isWorkItemsLoading } =
    usePullRequestWorkItems(projectId, prId, repoInfo);

  const linkWorkItem = useLinkWorkItemToPr(projectId, prId, repoInfo);
  const unlinkWorkItem = useUnlinkWorkItemFromPr(projectId, prId, repoInfo);

  // Clear queued IDs when the server confirms they're no longer pending
  const prevEvaluationsRef = useRef(evaluations);
  useEffect(() => {
    if (queuedIds.size === 0) return;
    startTransition(() => setQueuedIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        const evaluation = evaluations.find((e) => e.evaluationId === id);
        if (!evaluation) {
          next.delete(id);
        } else if (
          evaluation.status !== 'queued' ||
          !!evaluation.context?.buildId
        ) {
          next.delete(id);
        }
      }
      if (next.size === prev.size) return prev;
      return next;
    }));
    prevEvaluationsRef.current = evaluations;
  }, [evaluations, queuedIds]);

  const requeueMutation = useRequeuePolicyEvaluation(projectId, prId, repoInfo);
  const autoCompleteMutation = useSetAutoComplete(projectId, prId, repoInfo);

  const handleRequeue = useCallback(
    (evaluationId: string) => {
      setQueuedIds((prev) => new Set(prev).add(evaluationId));
      requeueMutation.mutate(
        { evaluationId },
        {
          onError: () => {
            setQueuedIds((prev) => {
              const next = new Set(prev);
              next.delete(evaluationId);
              return next;
            });
          },
        },
      );
    },
    [requeueMutation],
  );

  const handleQueueAll = useCallback(
    (ids: string[]) => {
      setQueuedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      for (const id of ids) {
        requeueMutation.mutate(
          { evaluationId: id },
          {
            onError: () => {
              setQueuedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            },
          },
        );
      }
    },
    [requeueMutation],
  );

  const ignoredAutoCompletePolicyIds = useMemo(
    () => new Set(pr.completionOptions?.autoCompleteIgnoreConfigIds ?? []),
    [pr.completionOptions?.autoCompleteIgnoreConfigIds],
  );

  const handleIgnoreOptionalPolicy = useCallback(
    (configId: number) => {
      if (!pr.autoCompleteSetBy) return;

      autoCompleteMutation.mutate({
        enabled: true,
        autoCompleteSetById: pr.autoCompleteSetBy.id,
        completionOptions: {
          mergeStrategy:
            pr.completionOptions?.mergeStrategy ??
            getAllowedMergeStrategies(evaluations)[0] ??
            'noFastForward',
          deleteSourceBranch: pr.completionOptions?.deleteSourceBranch ?? true,
          transitionWorkItems:
            pr.completionOptions?.transitionWorkItems ?? false,
          mergeCommitMessage: pr.completionOptions?.mergeCommitMessage,
          autoCompleteIgnoreConfigIds: Array.from(
            new Set([
              ...(pr.completionOptions?.autoCompleteIgnoreConfigIds ?? []),
              configId,
            ]),
          ),
        },
      });
    },
    [
      autoCompleteMutation,
      evaluations,
      pr.autoCompleteSetBy,
      pr.completionOptions,
    ],
  );

  const handleSaveDescription = useCallback(async () => {
    if (uploadAttachment.isPending) return;

    setDescriptionError(null);

    try {
      let finalDescription = descriptionDraft;

      for (const image of pendingDescriptionImages) {
        const pattern = placeholderPattern(image.placeholderMarkdown);
        if (!pattern || !finalDescription.match(pattern)) continue;
        const fileName = image.filename || 'image.png';
        const attachment = await uploadAttachment.mutateAsync({
          fileName,
          mimeType: image.mimeType || 'application/octet-stream',
          dataBase64: image.data,
        });
        finalDescription = finalDescription.replace(pattern, (match) =>
          match.replace(/\([^)]*\)$/, `(${attachment.url})`),
        );
      }

      if (finalDescription.includes('jc-image://')) {
        setDescriptionError(
          'Remove incomplete image placeholders before saving.',
        );
        return;
      }

      await updateDescription.mutateAsync(finalDescription);
      pendingDescriptionImagesRef.current = [];
      setPendingDescriptionImages([]);
      setDescriptionDraft(finalDescription);
      setIsEditingDescription(false);
    } catch (error) {
      setDescriptionError(
        error instanceof Error ? error.message : 'Failed to save description',
      );
    }
  }, [
    descriptionDraft,
    pendingDescriptionImages,
    updateDescription,
    uploadAttachment,
  ]);

  const insertDescriptionMarkdown = useCallback((markdown: string) => {
    const textarea = descriptionTextareaRef.current;
    if (!textarea) {
      setDescriptionDraft((current) => {
        const separator = current.trim() ? '\n\n' : '';
        return `${current.trimEnd()}${separator}${markdown}`;
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setDescriptionDraft(
      (current) => `${current.slice(0, start)}${markdown}${current.slice(end)}`,
    );
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }, []);

  const stageDescriptionImage = useCallback(
    (image: PromptImagePart) => {
      if (pendingDescriptionImagesRef.current.length >= MAX_IMAGES) {
        setDescriptionError(
          `Only ${MAX_IMAGES} images or GIFs can be attached.`,
        );
        return;
      }

      descriptionImageTokenCounterRef.current += 1;
      const token = descriptionImageTokenCounterRef.current;
      const fileName = image.filename || `image-${token}.png`;
      const safeAltText = fileName.replace(/[[\]()\\]/g, '_');
      const placeholderMarkdown = `![${safeAltText}](jc-image://${token})`;

      insertDescriptionMarkdown(placeholderMarkdown);
      const nextImages = [
        ...pendingDescriptionImagesRef.current,
        { ...image, placeholderMarkdown },
      ];
      pendingDescriptionImagesRef.current = nextImages;
      setPendingDescriptionImages(nextImages);
    },
    [insertDescriptionMarkdown],
  );

  const stageDescriptionImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const videoFile = files.find(isVideoFile);
      if (imageFiles.length === 0 && !videoFile) return;
      const allowed = MAX_IMAGES - pendingDescriptionImages.length;
      if (allowed <= 0) return;
      if (videoFile && allowed > imageFiles.length) {
        setDescriptionVideoFile(videoFile);
      }

      setDescriptionError(null);
      try {
        await Promise.all(
          imageFiles.slice(0, allowed).map(
            (file) =>
              new Promise<void>((resolve, reject) => {
                void processImageFile(
                  file,
                  (image) => {
                    stageDescriptionImage(image);
                    resolve();
                  },
                  reject,
                ).catch(reject);
              }),
          ),
        );
      } catch (error) {
        setDescriptionError(
          error instanceof Error ? error.message : 'Failed to stage image',
        );
      }
    },
    [pendingDescriptionImages.length, stageDescriptionImage],
  );

  const handleImageSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      await stageDescriptionImageFiles(files);
      event.target.value = '';
    },
    [stageDescriptionImageFiles],
  );

  const handleDescriptionPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files);
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const hasVideo = files.some(isVideoFile);
      if (imageFiles.length === 0 && !hasVideo) return;
      event.preventDefault();
      void stageDescriptionImageFiles(files);
    },
    [stageDescriptionImageFiles],
  );

  const handleDescriptionDrop = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.dataTransfer.files);
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const hasVideo = files.some(isVideoFile);
      if (imageFiles.length === 0 && !hasVideo) return;
      event.preventDefault();
      void stageDescriptionImageFiles(files);
    },
    [stageDescriptionImageFiles],
  );

  const handleDescriptionDragOver = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      if (
        Array.from(event.dataTransfer.items).some(
          (item) => item.kind === 'file',
        )
      ) {
        event.preventDefault();
      }
    },
    [],
  );

  const handleDescriptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSaveDescription();
      }
    },
    [handleSaveDescription],
  );

  // Merge optimistic queued state with server data
  const evaluationsWithOptimistic = useMemo(
    () =>
      evaluations.map((e) => {
        if (queuedIds.has(e.evaluationId) && !e.context?.buildId) {
          return { ...e, _optimisticQueued: true as const };
        }
        return { ...e, _optimisticQueued: false as const };
      }),
    [evaluations, queuedIds],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={previewResizeContainerRef}
        className={clsx(
          'grid min-h-0 flex-1 overflow-hidden',
          filePreview
            ? 'grid-cols-[minmax(0,1fr)_auto] gap-0 py-5 pr-0 pl-5'
            : 'grid-cols-[1fr_280px] gap-5 p-5',
          isPreviewDragging && 'select-none',
        )}
      >
        {/* Main column */}
        <div
          className={clsx(
            'min-h-0 min-w-0 space-y-4 overflow-y-auto',
            filePreview ? 'pr-0' : 'pr-1',
          )}
          style={
            bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
          }
        >
          {/* Checks */}
          <PrChecks
            evaluations={evaluationsWithOptimistic}
            isLoading={isChecksLoading}
            onRequeue={readOnly ? undefined : handleRequeue}
            onQueueAll={readOnly ? undefined : handleQueueAll}
            isRequeuing={requeueMutation.isPending}
            expandedBuildId={providerId ? expandedBuildId : undefined}
            onExpandCheck={providerId ? handleExpandCheck : undefined}
            renderExpanded={
              providerId && azureProjectId
                ? (buildId) => (
                    <CIInlinePanel
                      providerId={providerId}
                      azureProjectId={azureProjectId}
                      buildId={buildId}
                      onClose={() => setExpandedBuildId(null)}
                    />
                  )
                : undefined
            }
            ignoredAutoCompletePolicyIds={ignoredAutoCompletePolicyIds}
            onIgnoreOptionalPolicy={
              !readOnly && pr.autoCompleteSetBy
                ? handleIgnoreOptionalPolicy
                : undefined
            }
            isIgnoringOptionalPolicy={autoCompleteMutation.isPending}
          />

          {/* Description */}
          <div className="border-glass-border bg-bg-1 overflow-hidden rounded-lg border">
            <div className="border-glass-border/50 flex items-center gap-2.5 border-b px-3.5 py-2.5">
              <span className="text-ink-0 text-[13px] font-medium">
                Description
              </span>
              <div className="flex-1" />
              <span className="text-ink-3 text-[11.5px]">
                by {pr.createdBy.displayName}
              </span>
              {canEditDescription && !isEditingDescription && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Edit3 className="h-3.5 w-3.5" />}
                  onClick={() => setIsEditingDescription(true)}
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="p-4">
              {isEditingDescription ? (
                <div className="space-y-3">
                  <Textarea
                    ref={descriptionTextareaRef}
                    value={descriptionDraft}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setDescriptionDraft(event.target.value)
                    }
                    onPaste={handleDescriptionPaste}
                    onDrop={handleDescriptionDrop}
                    onDragOver={handleDescriptionDragOver}
                    onKeyDown={handleDescriptionKeyDown}
                    rows={10}
                    className="min-h-56 font-mono text-xs"
                    placeholder="Describe the pull request..."
                    disabled={
                      updateDescription.isPending || uploadAttachment.isPending
                    }
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleImageSelection}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Image className="h-3.5 w-3.5" />}
                      onClick={() => imageInputRef.current?.click()}
                      disabled={
                        updateDescription.isPending ||
                        uploadAttachment.isPending
                      }
                    >
                      {uploadAttachment.isPending
                        ? 'Uploading...'
                        : 'Add image/GIF'}
                    </Button>
                    <span className="text-ink-4 text-[11px]">
                      Cmd+Enter to save
                    </span>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => {
                        pendingDescriptionImagesRef.current = [];
                        setPendingDescriptionImages([]);
                        setIsEditingDescription(false);
                      }}
                      disabled={
                        updateDescription.isPending ||
                        uploadAttachment.isPending
                      }
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={
                        updateDescription.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => void handleSaveDescription()}
                      disabled={
                        updateDescription.isPending ||
                        uploadAttachment.isPending
                      }
                    >
                      Save
                    </Button>
                  </div>
                  {previewDescriptionDraft.trim() && (
                    <div className="border-glass-border/60 bg-bg-2/60 rounded-md border p-3">
                      <div className="text-ink-4 mb-2 text-[10px] font-medium tracking-wide uppercase">
                        Preview
                      </div>
                      <AzureMarkdownContent
                        markdown={previewDescriptionDraft}
                        providerId={providerId}
                        className="text-ink-1 text-sm"
                        imageClassName="max-h-[360px] object-contain"
                        enableImageModal
                        mentionDisplayNames={mentionDisplayNames}
                      />
                    </div>
                  )}
                  {descriptionError && (
                    <p className="text-xs text-red-400">{descriptionError}</p>
                  )}
                  {pendingDescriptionImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pendingDescriptionImages.map((image, index) => (
                        <div
                          key={`${image.filename ?? 'img'}-${index}`}
                          className="relative"
                        >
                          <img
                            src={`data:${image.storageMimeType ?? image.mimeType};base64,${image.storageData ?? image.data}`}
                            alt={image.filename || 'Attached image'}
                            title={
                              image.sizeBytes
                                ? formatBytes(image.sizeBytes)
                                : undefined
                            }
                            className="h-8 w-8 rounded border border-white/10 object-cover"
                          />
                          {image.sizeBytes && (
                            <span className="absolute right-0 bottom-0 left-0 rounded-b bg-black/70 px-0.5 text-center font-mono text-[7px] leading-3 text-white">
                              {formatBytes(image.sizeBytes)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : pr.description.trim() ? (
                <AzureMarkdownContent
                  markdown={pr.description}
                  providerId={providerId}
                  className="text-ink-1 text-sm"
                  imageClassName="max-h-[520px] object-contain"
                  enableImageModal
                  mentionDisplayNames={mentionDisplayNames}
                />
              ) : (
                <p className="text-ink-3 text-sm italic">No description</p>
              )}
              <VideoGifConverter
                file={descriptionVideoFile}
                onAttach={stageDescriptionImage}
                onClose={() => setDescriptionVideoFile(null)}
              />
            </div>
          </div>

          {/* Comments */}
          <PrComments
            threads={threads}
            providerId={providerId}
            projectId={projectId}
            prId={prId}
            onAddComment={onAddComment}
            onUploadImage={onUploadImage}
            isAddingComment={isAddingComment}
            onOpenFilePreview={setFilePreview}
            mentionDisplayNames={mentionDisplayNames}
            mentionOptions={mentionOptions}
            onSearchMentions={onSearchMentions}
            readOnly={readOnly}
            repoInfo={repoInfo}
          />
        </div>

        {/* Right sidebar */}
        <div
          className={clsx(
            'relative min-h-0 min-w-0 overflow-y-auto',
            filePreview && 'pl-3',
          )}
          style={{
            width: filePreview ? filePreviewWidth : undefined,
            ...(bottomPadding > 0 ? { paddingBottom: bottomPadding } : {}),
          }}
        >
          {filePreview && (
            <div
              onMouseDown={handlePreviewResizeMouseDown}
              className={clsx(
                'hover:bg-acc/50 absolute top-0 left-0 h-full w-1 cursor-col-resize transition-colors',
                isPreviewDragging && 'bg-acc/50',
              )}
            />
          )}
          <div
            className={clsx('h-full min-h-0', filePreview ? 'pr-0' : undefined)}
          >
            {filePreview ? (
              <PrFilePreviewPane
                projectId={projectId}
                prId={prId}
                filePath={filePreview.filePath}
                lineStart={filePreview.lineStart}
                lineEnd={filePreview.lineEnd}
                scrollToLine={filePreview.lineStart}
                threads={threads}
                files={files}
                providerId={providerId}
                mentionDisplayNames={mentionDisplayNames}
                mentionOptions={mentionOptions}
                onSearchMentions={onSearchMentions}
                onClose={() => setFilePreview(null)}
                repoInfo={repoInfo}
                readOnly={readOnly}
              />
            ) : (
              <PrMetaPanel
                pr={pr}
                fileCount={fileCount}
                providerId={providerId}
                workItems={workItems}
                isWorkItemsLoading={isWorkItemsLoading}
                azureProjectId={azureProjectId}
                azureProjectName={azureProjectName}
                onLinkWorkItem={
                  readOnly
                    ? undefined
                    : (workItemId) => linkWorkItem.mutate(workItemId)
                }
                onUnlinkWorkItem={
                  readOnly
                    ? undefined
                    : (workItemId) => unlinkWorkItem.mutate(workItemId)
                }
                isLinkingWorkItem={linkWorkItem.isPending}
                isUnlinkingWorkItem={unlinkWorkItem.isPending}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrFilePreviewPane({
  projectId,
  prId,
  filePath,
  lineStart,
  lineEnd,
  scrollToLine,
  threads,
  files,
  providerId,
  mentionDisplayNames,
  mentionOptions,
  onSearchMentions,
  onClose,
  repoInfo,
  readOnly,
}: {
  projectId: string;
  prId: number;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  scrollToLine: number;
  threads: AzureDevOpsCommentThread[];
  files: AzureDevOpsFileChange[];
  providerId?: string;
  mentionDisplayNames: MentionDisplayNames;
  mentionOptions: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onClose: () => void;
  repoInfo?: PullRequestRepoInfo;
  readOnly: boolean;
}) {
  const { data: headContent = '', isLoading: isHeadLoading } =
    usePullRequestFileContent(projectId, prId, filePath, 'head', repoInfo);
  const { data: baseContent = '', isLoading: isBaseLoading } =
    usePullRequestFileContent(projectId, prId, filePath, 'base', repoInfo);

  const file = useMemo<DiffFile>(() => {
    const change = files.find(
      (candidate) =>
        candidate.path === filePath ||
        candidate.path === stripLeadingSlash(filePath),
    );
    return {
      path: filePath,
      status: change ? normalizeAzureChangeType(change.changeType) : 'modified',
      originalPath: change?.originalPath,
    };
  }, [filePath, files]);

  const fileThreads = useMemo(
    () => convertPrThreadsForFile(threads, filePath),
    [threads, filePath],
  );

  return (
    <div className="border-glass-border bg-bg-1 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className="border-glass-border/60 flex items-center gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-ink-0 truncate text-xs font-medium">
            File diff preview
          </div>
          <div className="text-ink-3 truncate font-mono text-[11px]">
            {filePath}:
            {lineStart === lineEnd ? lineStart : `${lineStart}-${lineEnd}`}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <FileDiffContent
          file={file}
          oldContent={baseContent}
          newContent={headContent}
          isLoading={isHeadLoading || isBaseLoading}
          headerClassName="hidden"
          threads={fileThreads}
          renderThread={(thread) => (
            <PrInlineCommentThread
              thread={thread}
              projectId={projectId}
              prId={prId}
              providerId={providerId}
              mentionDisplayNames={mentionDisplayNames}
              mentionOptions={mentionOptions}
              onSearchMentions={onSearchMentions}
              readOnly={readOnly}
            />
          )}
          scrollToLine={scrollToLine}
        />
      </div>
    </div>
  );
}

function stripLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}
