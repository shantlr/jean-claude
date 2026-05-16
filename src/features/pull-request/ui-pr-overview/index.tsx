import { useCallback, useState, useMemo, useEffect, useRef } from 'react';

import { Separator } from '@/common/ui/separator';
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
import { PrCommentForm } from '../ui-pr-comment-form';
import { PrComments } from '../ui-pr-comments';
import { PipelineDetailsPane } from '../ui-pr-pipeline-pane';

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
}) {
  // Track which build is open in the pipeline details pane
  const [selectedBuildId, setSelectedBuildId] = useState<number | null>(null);

  const handleCheckClick = useCallback((buildId: number) => {
    setSelectedBuildId((prev) => (prev === buildId ? null : buildId));
  }, []);

  const handlePaneClose = useCallback(() => {
    setSelectedBuildId(null);
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
  // (status changed from queued-without-context to running/approved/rejected/etc)
  const prevEvaluationsRef = useRef(evaluations);
  useEffect(() => {
    if (queuedIds.size === 0) return;
    setQueuedIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        const evaluation = evaluations.find((e) => e.evaluationId === id);
        if (!evaluation) {
          // Evaluation disappeared — remove from tracking
          next.delete(id);
        } else if (
          evaluation.status !== 'queued' ||
          !!evaluation.context?.buildId
        ) {
          // Status changed from pending to something real — remove from tracking
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
            // Remove from optimistic set on failure
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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex-1 overflow-y-auto p-4"
          style={
            bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
          }
        >
          <div className="max-w-3xl min-w-0">
            {/* Checks */}
            <PrChecks
              evaluations={evaluationsWithOptimistic}
              isLoading={isChecksLoading}
              onRequeue={handleRequeue}
              onQueueAll={handleQueueAll}
              isRequeuing={requeueMutation.isPending}
              onCheckClick={providerId ? handleCheckClick : undefined}
              selectedBuildId={selectedBuildId}
            />

            {/* Description */}
            <h2 className="text-ink-2 mb-4 text-sm font-medium">Description</h2>
            {pr.description.trim() ? (
              <AzureMarkdownContent
                markdown={pr.description}
                providerId={providerId}
                className="text-ink-1 text-sm"
              />
            ) : (
              <p className="text-ink-3 text-sm italic">No description</p>
            )}

            {/* Comments */}
            <div className="mt-8">
              <PrComments
                threads={threads}
                providerId={providerId}
                projectId={projectId}
                prId={prId}
              />
            </div>
          </div>
        </div>

        {/* Add comment form */}
        {onAddComment && (
          <>
            <Separator />
            <div className="p-4">
              <PrCommentForm
                onSubmit={onAddComment}
                isSubmitting={isAddingComment}
              />
            </div>
          </>
        )}
      </div>

      {/* Pipeline details pane */}
      {selectedBuildId != null && providerId && azureProjectId && (
        <PipelineDetailsPane
          providerId={providerId}
          azureProjectId={azureProjectId}
          buildId={selectedBuildId}
          onClose={handlePaneClose}
        />
      )}
    </div>
  );
}
