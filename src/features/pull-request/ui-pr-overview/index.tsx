import clsx from 'clsx';
import { Edit3, Image, Loader2, Save, X } from 'lucide-react';
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

import { Button } from '@/common/ui/button';
import type { MentionOption } from '@/common/ui/mention-textarea';
import { Textarea } from '@/common/ui/textarea';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import {
  FileDiffContent,
  normalizeAzureChangeType,
  type DiffFile,
} from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  useCurrentAzureUser,
  useLinkWorkItemToPr,
  usePullRequestFileContent,
  usePullRequestPolicyEvaluations,
  usePullRequestWorkItems,
  useRequeuePolicyEvaluation,
  useUnlinkWorkItemFromPr,
  useUpdatePullRequestDescription,
  useUploadPullRequestAttachment,
} from '@/hooks/use-pull-requests';
import type {
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommentThread,
  AzureDevOpsFileChange,
} from '@/lib/api';
import {
  normalizeMentionId,
  type MentionDisplayNames,
} from '@/lib/azure-devops-mentions';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import type { PromptImagePart } from '@shared/agent-backend-types';

import { PrChecks } from '../ui-pr-checks';
import { CIInlinePanel } from '../ui-pr-ci-inline';
import { PrComments } from '../ui-pr-comments';
import {
  convertPrThreadsForFile,
  PrInlineCommentThread,
} from '../ui-pr-inline-comment-thread';
import { PrMetaPanel } from '../ui-pr-meta-panel';
import { isVideoFile, VideoGifConverter } from '../ui-video-gif-converter';

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

  const { data: currentUser } = useCurrentAzureUser(projectId);
  const updateDescription = useUpdatePullRequestDescription(projectId, prId);
  const uploadAttachment = useUploadPullRequestAttachment(projectId, prId);

  const currentUserEmail = currentUser?.emailAddress.toLowerCase();
  const ownerEmail = pr.createdBy.uniqueName.toLowerCase();
  const canEditDescription =
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

  const previewDescriptionDraft = useMemo(
    () =>
      descriptionPreviewMarkdown(descriptionDraft, pendingDescriptionImages),
    [descriptionDraft, pendingDescriptionImages],
  );

  useEffect(() => {
    if (!isEditingDescription) {
      setDescriptionDraft(pr.description);
      setDescriptionError(null);
      pendingDescriptionImagesRef.current = [];
      setPendingDescriptionImages([]);
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
    usePullRequestPolicyEvaluations(projectId, prId, {
      refetchInterval: hasActiveBuilds ? 10_000 : false,
    });

  const { data: workItems = [], isLoading: isWorkItemsLoading } =
    usePullRequestWorkItems(projectId, prId);

  const linkWorkItem = useLinkWorkItemToPr(projectId, prId);
  const unlinkWorkItem = useUnlinkWorkItemFromPr(projectId, prId);

  // Clear queued IDs when the server confirms they're no longer pending
  const prevEvaluationsRef = useRef(evaluations);
  useEffect(() => {
    if (queuedIds.size === 0) return;
    setQueuedIds((prev) => {
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
    });
    prevEvaluationsRef.current = evaluations;
  }, [evaluations, queuedIds]);

  const requeueMutation = useRequeuePolicyEvaluation(projectId, prId);

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
            onRequeue={handleRequeue}
            onQueueAll={handleQueueAll}
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
                    rows={10}
                    className="min-h-56 font-mono text-xs"
                    placeholder="Describe the pull request..."
                    disabled={
                      updateDescription.isPending || uploadAttachment.isPending
                    }
                  />
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
                onLinkWorkItem={(workItemId) => linkWorkItem.mutate(workItemId)}
                onUnlinkWorkItem={(workItemId) =>
                  unlinkWorkItem.mutate(workItemId)
                }
                isLinkingWorkItem={linkWorkItem.isPending}
                isUnlinkingWorkItem={unlinkWorkItem.isPending}
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
}) {
  const { data: headContent = '', isLoading: isHeadLoading } =
    usePullRequestFileContent(projectId, prId, filePath, 'head');
  const { data: baseContent = '', isLoading: isBaseLoading } =
    usePullRequestFileContent(projectId, prId, filePath, 'base');

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
