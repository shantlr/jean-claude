import clsx from 'clsx';
import { GitMerge, Loader2, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { Dropdown } from '@/common/ui/dropdown';
import {
  useSetAutoComplete,
  useCurrentAzureUser,
  usePullRequestPolicyEvaluations,
  getAllowedMergeStrategies,
  MERGE_STRATEGY_LABELS,
} from '@/hooks/use-pull-requests';
import type { MergeStrategy } from '@/hooks/use-pull-requests';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';

export function PrAutoComplete({
  pr,
  projectId,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
}) {
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const autoCompleteMutation = useSetAutoComplete(projectId, pr.id);
  const { data: evaluations = [] } = usePullRequestPolicyEvaluations(
    projectId,
    pr.id,
  );

  const allowedStrategies = useMemo(
    () => getAllowedMergeStrategies(evaluations),
    [evaluations],
  );

  const currentIdentityId = useMemo(() => {
    if (!currentUser) return null;

    const currentEmail = currentUser.emailAddress.toLowerCase();
    const reviewerIdentity = pr.reviewers.find(
      (reviewer) =>
        !reviewer.isContainer &&
        reviewer.uniqueName.toLowerCase() === currentEmail,
    );

    if (reviewerIdentity) {
      return reviewerIdentity.id;
    }

    if (pr.createdBy.uniqueName.toLowerCase() === currentEmail) {
      return pr.createdBy.id;
    }

    return null;
  }, [pr.reviewers, pr.createdBy, currentUser]);

  const isAutoCompleteSet = !!pr.autoCompleteSetBy;

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
    pr.completionOptions?.transitionWorkItems ?? true,
  );
  const [mergeCommitMessage, setMergeCommitMessage] = useState(
    pr.completionOptions?.mergeCommitMessage ?? '',
  );
  const [showCommitMessage, setShowCommitMessage] = useState(
    !!pr.completionOptions?.mergeCommitMessage,
  );

  const handleEnable = useCallback(() => {
    if (!currentIdentityId) return;
    autoCompleteMutation.mutate({
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
      },
    });
  }, [
    currentIdentityId,
    autoCompleteMutation,
    mergeStrategy,
    deleteSourceBranch,
    transitionWorkItems,
    mergeCommitMessage,
    showCommitMessage,
  ]);

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      autoCompleteMutation.mutate({ enabled: false });
    },
    [autoCompleteMutation],
  );

  if (!currentIdentityId) return null;

  // When auto-complete is already set, show status chip with cancel button
  if (isAutoCompleteSet) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400">
        <GitMerge className="h-3.5 w-3.5" />
        <span>Auto-complete</span>
        {pr.completionOptions && (
          <span className="text-green-400/70">
            ({MERGE_STRATEGY_LABELS[pr.completionOptions.mergeStrategy]})
          </span>
        )}
        <button
          onClick={handleCancel}
          className="ml-1 rounded p-0.5 hover:bg-green-600/30"
          title="Cancel auto-complete"
          disabled={autoCompleteMutation.isPending}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      </div>
    );
  }

  // Show button that opens configuration dropdown
  return (
    <Dropdown
      align="right"
      trigger={
        <button
          className="bg-glass-medium hover:bg-bg-3 text-ink-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          disabled={autoCompleteMutation.isPending}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitMerge className="h-3.5 w-3.5" />
          )}
          Set auto-complete
        </button>
      }
    >
      <div className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-ink-1 mb-3 text-sm font-medium">
          Auto-complete settings
        </h3>

        {/* Merge strategy */}
        <label className="text-ink-2 mb-1 block text-xs">Merge strategy</label>
        <select
          value={mergeStrategy}
          onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
          disabled={allowedStrategies.length <= 1}
          className="bg-bg-2 border-glass-border text-ink-1 mb-3 w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
        >
          {allowedStrategies.map((strategy) => (
            <option key={strategy} value={strategy}>
              {MERGE_STRATEGY_LABELS[strategy]}
            </option>
          ))}
        </select>

        {/* Checkboxes */}
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={deleteSourceBranch}
            onChange={(e) => setDeleteSourceBranch(e.target.checked)}
            className="accent-acc rounded"
          />
          <span className="text-ink-1">Delete source branch</span>
        </label>

        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={transitionWorkItems}
            onChange={(e) => setTransitionWorkItems(e.target.checked)}
            className="accent-acc rounded"
          />
          <span className="text-ink-1">Transition work items</span>
        </label>

        {/* Commit message toggle */}
        <button
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

        {/* Enable button */}
        <button
          onClick={handleEnable}
          disabled={autoCompleteMutation.isPending}
          className={clsx(
            'bg-acc text-ink-0 hover:bg-acc w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            autoCompleteMutation.isPending && 'opacity-50',
          )}
        >
          {autoCompleteMutation.isPending ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            'Enable auto-complete'
          )}
        </button>
      </div>
    </Dropdown>
  );
}
