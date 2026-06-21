import { Circle, GitMerge, Loader2, Play, X } from 'lucide-react';
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';

import {
  getAllowedMergeStrategies,
  MERGE_STRATEGY_LABELS,
  useCurrentAzureUser,
  usePullRequestPolicyEvaluations,
  useRequeuePolicyEvaluation,
  useSetAutoComplete,
} from '@/hooks/use-pull-requests';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';
import { Checkbox } from '@/common/ui/checkbox';
import type { MergeStrategy } from '@/hooks/use-pull-requests';
import { Modal } from '@/common/ui/modal';



import { getCurrentIdentityId } from '../utils-pr-current-user';

export function PrAutoComplete({
  pr,
  projectId,
  variant = 'default',
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
  variant?: 'default' | 'compact';
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const autoCompleteMutation = useSetAutoComplete(projectId, pr.id);
  const requeueMutation = useRequeuePolicyEvaluation(projectId, pr.id);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(() => new Set());
  const { data: evaluations = [] } = usePullRequestPolicyEvaluations(
    projectId,
    pr.id,
    { refetchInterval: isModalOpen && queuedIds.size > 0 ? 3_000 : false },
  );
  const previousEvaluationsRef = useRef(evaluations);

  const allowedStrategies = useMemo(
    () => getAllowedMergeStrategies(evaluations),
    [evaluations],
  );

  const currentIdentityId = useMemo(() => {
    return getCurrentIdentityId({
      reviewers: pr.reviewers,
      createdBy: pr.createdBy,
      currentUser,
    });
  }, [pr.reviewers, pr.createdBy, currentUser]);

  const isAutoCompleteSet = !!pr.autoCompleteSetBy;

  useEffect(() => {
    if (previousEvaluationsRef.current === evaluations) return;
    setQueuedIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        const evaluation = evaluations.find((e) => e.evaluationId === id);
        if (
          !evaluation ||
          evaluation.status !== 'queued' ||
          evaluation.context?.buildId
        ) {
          next.delete(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
    previousEvaluationsRef.current = evaluations;
  }, [evaluations]);

  const pendingCi = useMemo(
    () =>
      evaluations.filter(
        (evaluation) =>
          !!evaluation.configuration.settings.buildDefinitionId &&
          evaluation.status === 'queued' &&
          !evaluation.context?.buildId,
      ),
    [evaluations],
  );
  const optionalPolicyConfigIds = useMemo(
    () =>
      evaluations
        .filter((evaluation) => !evaluation.configuration.isBlocking)
        .map((evaluation) => evaluation.configuration.id),
    [evaluations],
  );

  const pendingCiCount = pendingCi.length;

  // Form state for the popover
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>(
    pr.completionOptions?.mergeStrategy ??
      allowedStrategies[0] ??
      'noFastForward',
  );
  const [deleteSourceBranch, setDeleteSourceBranch] = useState(
    pr.completionOptions?.deleteSourceBranch ?? true,
  );
  const [transitionWorkItems, setTransitionWorkItems] = useState(
    pr.completionOptions?.transitionWorkItems ?? false,
  );
  const [mergeCommitMessage, setMergeCommitMessage] = useState(
    pr.completionOptions?.mergeCommitMessage ?? '',
  );
  const [showCommitMessage, setShowCommitMessage] = useState(
    !!pr.completionOptions?.mergeCommitMessage,
  );
  const [ignoreOptionalPolicies, setIgnoreOptionalPolicies] = useState(
    !!pr.completionOptions?.autoCompleteIgnoreConfigIds?.length,
  );

  const resetForm = useCallback(() => {
    setMergeStrategy(
      pr.completionOptions?.mergeStrategy ??
        allowedStrategies[0] ??
        'noFastForward',
    );
    setDeleteSourceBranch(pr.completionOptions?.deleteSourceBranch ?? true);
    setTransitionWorkItems(pr.completionOptions?.transitionWorkItems ?? false);
    setMergeCommitMessage(pr.completionOptions?.mergeCommitMessage ?? '');
    setShowCommitMessage(!!pr.completionOptions?.mergeCommitMessage);
    setIgnoreOptionalPolicies(
      !!pr.completionOptions?.autoCompleteIgnoreConfigIds?.length,
    );
  }, [allowedStrategies, pr.completionOptions]);

  useEffect(() => {
    if (!allowedStrategies.includes(mergeStrategy)) {
      startTransition(() => setMergeStrategy(allowedStrategies[0] ?? 'noFastForward'));
    }
  }, [allowedStrategies, mergeStrategy]);

  const handleEnable = useCallback(() => {
    if (!currentIdentityId) return;
    autoCompleteMutation.mutate(
      {
        enabled: true,
        autoCompleteSetById: currentIdentityId,
        completionOptions: {
          mergeStrategy,
          deleteSourceBranch,
          transitionWorkItems,
          mergeCommitMessage:
            showCommitMessage && mergeCommitMessage
              ? mergeCommitMessage
              : undefined,
          autoCompleteIgnoreConfigIds:
            ignoreOptionalPolicies && optionalPolicyConfigIds.length > 0
              ? optionalPolicyConfigIds
              : undefined,
        },
      },
      { onSuccess: () => setIsModalOpen(false) },
    );
  }, [
    currentIdentityId,
    autoCompleteMutation,
    mergeStrategy,
    deleteSourceBranch,
    transitionWorkItems,
    mergeCommitMessage,
    showCommitMessage,
    ignoreOptionalPolicies,
    optionalPolicyConfigIds,
  ]);

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      autoCompleteMutation.mutate({ enabled: false });
    },
    [autoCompleteMutation],
  );

  const handleQueueCi = useCallback(
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

  const handleQueueAllCi = useCallback(() => {
    for (const evaluation of pendingCi) {
      if (!queuedIds.has(evaluation.evaluationId)) {
        handleQueueCi(evaluation.evaluationId);
      }
    }
  }, [handleQueueCi, pendingCi, queuedIds]);

  // When auto-complete is already set, show status chip with cancel button
  if (isAutoCompleteSet) {
    const activeClassName =
      variant === 'compact'
        ? 'text-status-done bg-status-done/10 ring-status-done/20 ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1'
        : 'flex items-center gap-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400';
    const activeMutedClassName =
      variant === 'compact' ? 'text-status-done/70' : 'text-green-400/70';
    const cancelClassName =
      variant === 'compact'
        ? 'ml-0.5 rounded p-0.5 hover:bg-status-done/20'
        : 'ml-1 rounded p-0.5 hover:bg-green-600/30';

    return (
      <div className={activeClassName}>
        <GitMerge className="h-3.5 w-3.5" />
        <span>Auto-complete</span>
        {pr.completionOptions && (
          <span className={activeMutedClassName}>
            ({MERGE_STRATEGY_LABELS[pr.completionOptions.mergeStrategy]})
          </span>
        )}
        {variant !== 'compact' && (
          <button
            onClick={handleCancel}
            className={cancelClassName}
            title="Cancel auto-complete"
            disabled={autoCompleteMutation.isPending}
          >
            {autoCompleteMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    );
  }

  if (!currentIdentityId) return null;

  const triggerClassName =
    variant === 'compact'
      ? 'text-status-pr hover:bg-status-pr/15 ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50'
      : 'bg-glass-medium hover:bg-bg-3 text-ink-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';

  // Show button that opens configuration modal
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          resetForm();
          setIsModalOpen(true);
        }}
        className={triggerClassName}
        disabled={autoCompleteMutation.isPending}
      >
        {autoCompleteMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <GitMerge className="h-3.5 w-3.5" />
        )}
        Set auto-complete
      </button>
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Set auto-complete"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-bg-2 border-glass-border rounded-lg border p-3">
            <div className="text-ink-1 mb-1 text-sm font-medium">#{pr.id}</div>
            <p className="text-ink-3 line-clamp-2 text-xs">{pr.title}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-ink-1 text-sm font-medium">Pending CI</h3>
              {pendingCiCount > 1 && (
                <button
                  type="button"
                  onClick={handleQueueAllCi}
                  disabled={requeueMutation.isPending}
                  className="text-status-pr hover:bg-status-pr/15 flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                >
                  <Play className="h-3 w-3" />
                  Run all
                </button>
              )}
            </div>
            {pendingCiCount === 0 ? (
              <div className="border-glass-border bg-glass-light text-ink-3 rounded-lg border px-3 py-2 text-xs">
                No pending CI needs to be run.
              </div>
            ) : (
              <div className="border-glass-border overflow-hidden rounded-lg border">
                {pendingCi.map((evaluation) => {
                  const isQueued = queuedIds.has(evaluation.evaluationId);
                  const name =
                    evaluation.configuration.settings.displayName ??
                    evaluation.configuration.type.displayName ??
                    `Policy ${evaluation.configuration.id}`;
                  return (
                    <div
                      key={evaluation.evaluationId}
                      className="border-glass-border/60 flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                    >
                      {isQueued ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />
                      ) : (
                        <Circle className="text-ink-3 h-3.5 w-3.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-ink-1 truncate text-xs font-medium">
                          {name}
                        </div>
                        <div className="text-ink-4 text-[10.5px]">
                          {isQueued ? 'Queued' : 'Not run yet'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQueueCi(evaluation.evaluationId)}
                        disabled={isQueued || requeueMutation.isPending}
                        className="bg-glass-medium hover:bg-bg-3 text-ink-1 flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" />
                        Run
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-glass-border rounded-lg border p-3">
            <h3 className="text-ink-1 mb-3 text-sm font-medium">
              Completion options
            </h3>
            <label className="text-ink-2 mb-1 block text-xs">
              Merge strategy
            </label>
            <select
              value={mergeStrategy}
              onChange={(e) =>
                setMergeStrategy(e.target.value as MergeStrategy)
              }
              disabled={allowedStrategies.length <= 1}
              className="bg-bg-2 border-glass-border text-ink-1 mb-3 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
            >
              {allowedStrategies.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {MERGE_STRATEGY_LABELS[strategy]}
                </option>
              ))}
            </select>

            <Checkbox
              checked={deleteSourceBranch}
              onChange={setDeleteSourceBranch}
              label="Delete source branch"
              className="mb-2 text-xs"
            />

            <Checkbox
              checked={transitionWorkItems}
              onChange={setTransitionWorkItems}
              label="Transition work items"
              className="mb-3 text-xs"
            />

            {optionalPolicyConfigIds.length > 0 && (
              <Checkbox
                checked={ignoreOptionalPolicies}
                onChange={setIgnoreOptionalPolicies}
                label="Ignore optional policies"
                className="mb-3 text-xs"
              />
            )}

            <button
              type="button"
              onClick={() => setShowCommitMessage(!showCommitMessage)}
              className="text-acc-ink mb-2 text-xs hover:underline"
            >
              {showCommitMessage ? 'Hide' : 'Custom'} merge commit message
            </button>

            {showCommitMessage && (
              <textarea
                value={mergeCommitMessage}
                onChange={(e) => setMergeCommitMessage(e.target.value)}
                placeholder={pr.title}
                rows={3}
                className="bg-bg-2 border-glass-border text-ink-1 placeholder:text-ink-4 mb-3 w-full resize-none rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEnable}
              disabled={autoCompleteMutation.isPending}
              className={clsx(
                'bg-acc text-ink-0 hover:bg-acc rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                autoCompleteMutation.isPending && 'opacity-50',
              )}
            >
              {autoCompleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Enable auto-complete'
              )}
            </button>
          </div>

          {autoCompleteMutation.error && (
            <p className="text-xs text-red-400">
              {autoCompleteMutation.error.message}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
