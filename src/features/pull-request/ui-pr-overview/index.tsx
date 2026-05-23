import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import {
  usePullRequestPolicyEvaluations,
  useRequeuePolicyEvaluation,
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
  threads?: AzureDevOpsCommentThread[];
  onAddComment?: (content: string) => void;
  isAddingComment?: boolean;
  bottomPadding?: number;
  fileCount?: number;
}) {
  // Track which build is expanded inline in the checks block
  const [expandedBuildId, setExpandedBuildId] = useState<number | null>(null);

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
    <div className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        <div className="grid grid-cols-[1fr_280px] gap-5 p-5">
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-4">
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
              </div>
              <div className="p-4">
                {pr.description.trim() ? (
                  <AzureMarkdownContent
                    markdown={pr.description}
                    providerId={providerId}
                    className="text-ink-1 text-sm"
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
          <PrMetaPanel pr={pr} fileCount={fileCount} providerId={providerId} />
        </div>
      </div>
    </div>
  );
}
