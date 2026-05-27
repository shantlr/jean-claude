import { Edit3, Image, Loader2, Save, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

import { Button } from '@/common/ui/button';
import { Textarea } from '@/common/ui/textarea';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import {
  useCurrentAzureUser,
  useLinkWorkItemToPr,
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
} from '@/lib/api';

import { PrChecks } from '../ui-pr-checks';
import { CIInlinePanel } from '../ui-pr-ci-inline';
import { PrCommentForm } from '../ui-pr-comment-form';
import { PrComments } from '../ui-pr-comments';
import { PrMetaPanel } from '../ui-pr-meta-panel';

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
  isAddingComment,
  bottomPadding = 0,
  fileCount = 0,
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
  isAddingComment?: boolean;
  bottomPadding?: number;
  fileCount?: number;
}) {
  // Track which build is expanded inline in the checks block
  const [expandedBuildId, setExpandedBuildId] = useState<number | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(pr.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!isEditingDescription) {
      setDescriptionDraft(pr.description);
      setDescriptionError(null);
    }
  }, [isEditingDescription, pr.description]);

  const handleExpandCheck = useCallback((buildId: number | null) => {
    setExpandedBuildId(buildId);
  }, []);

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

  const handleSaveDescription = useCallback(() => {
    if (uploadAttachment.isPending) return;

    setDescriptionError(null);
    updateDescription.mutate(descriptionDraft, {
      onSuccess: () => {
        setIsEditingDescription(false);
      },
      onError: (error) => {
        setDescriptionError(error.message);
      },
    });
  }, [descriptionDraft, updateDescription, uploadAttachment.isPending]);

  const handleImageSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;

      let markdownImages: string[];
      try {
        markdownImages = await Promise.all(
          files.map(async (file) => {
            const dataBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result !== 'string') {
                  reject(new Error(`Failed to read ${file.name}`));
                  return;
                }
                resolve(reader.result.split(',')[1] ?? '');
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            const attachment = await uploadAttachment.mutateAsync({
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              dataBase64,
            });
            const alt = file.name.replace(/[[\]()\\]/g, '_');
            return `![${alt}](${attachment.url})`;
          }),
        );
      } catch (error) {
        setDescriptionError(
          error instanceof Error ? error.message : 'Failed to read image',
        );
        event.target.value = '';
        return;
      }

      setDescriptionDraft((current) => {
        const separator = current.trim() ? '\n\n' : '';
        return `${current.trimEnd()}${separator}${markdownImages.join('\n\n')}`;
      });
      event.target.value = '';
    },
    [uploadAttachment],
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
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-5 overflow-hidden p-5">
        {/* Main column */}
        <div
          className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1"
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
                    value={descriptionDraft}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setDescriptionDraft(event.target.value)
                    }
                    rows={10}
                    className="min-h-56 font-mono text-xs"
                    placeholder="Describe the pull request..."
                    disabled={
                      updateDescription.isPending || uploadAttachment.isPending
                    }
                  />
                  {descriptionError && (
                    <p className="text-xs text-red-400">{descriptionError}</p>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
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
                        : 'Add image'}
                    </Button>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => setIsEditingDescription(false)}
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
                      onClick={handleSaveDescription}
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
                />
              ) : (
                <p className="text-ink-3 text-sm italic">No description</p>
              )}
            </div>
          </div>

          {/* Comments */}
          <PrComments
            threads={threads}
            providerId={providerId}
            projectId={projectId}
            prId={prId}
          />

          {/* Comment form */}
          {onAddComment && (
            <PrCommentForm
              onSubmit={onAddComment}
              isSubmitting={isAddingComment}
            />
          )}
        </div>

        {/* Right meta sidebar */}
        <div
          className="min-h-0 min-w-0 overflow-y-auto"
          style={
            bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
          }
        >
          <PrMetaPanel
            pr={pr}
            fileCount={fileCount}
            providerId={providerId}
            workItems={workItems}
            isWorkItemsLoading={isWorkItemsLoading}
            azureProjectId={azureProjectId}
            azureProjectName={azureProjectName}
            onLinkWorkItem={(workItemId) => linkWorkItem.mutate(workItemId)}
            onUnlinkWorkItem={(workItemId) => unlinkWorkItem.mutate(workItemId)}
            isLinkingWorkItem={linkWorkItem.isPending}
            isUnlinkingWorkItem={unlinkWorkItem.isPending}
          />
        </div>
      </div>
    </div>
  );
}
