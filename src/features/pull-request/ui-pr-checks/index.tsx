import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Loader2,
  MinusCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';



import type { AzureDevOpsPolicyEvaluation } from '@/lib/api';

export type EvaluationWithOptimistic = AzureDevOpsPolicyEvaluation & {
  _optimisticQueued: boolean;
};

type EvalStatus = AzureDevOpsPolicyEvaluation['status'];

/**
 * Azure returns "queued" for builds that haven't been triggered yet.
 * We distinguish between truly queued (has a buildId in context)
 * and pending (no build triggered yet).
 */
function isPending(evaluation: EvaluationWithOptimistic) {
  return (
    evaluation.status === 'queued' &&
    !evaluation.context?.buildId &&
    !evaluation._optimisticQueued
  );
}

/** User just clicked Queue — optimistic state before server confirms */
function isOptimisticQueued(evaluation: EvaluationWithOptimistic) {
  return evaluation._optimisticQueued;
}

function getStatusIcon(evaluation: EvaluationWithOptimistic) {
  const cls = 'h-3.5 w-3.5 shrink-0';

  if (isOptimisticQueued(evaluation)) {
    return <Loader2 className={clsx(cls, 'animate-spin text-yellow-400')} />;
  }
  if (isPending(evaluation)) {
    return <Circle className={clsx(cls, 'text-ink-3')} />;
  }
  switch (evaluation.status) {
    case 'approved':
      return <CheckCircle2 className={clsx(cls, 'text-status-done')} />;
    case 'rejected':
      return <XCircle className={clsx(cls, 'text-status-fail')} />;
    case 'running':
      return <Loader2 className={clsx(cls, 'animate-spin text-blue-400')} />;
    case 'queued':
      return <Clock className={clsx(cls, 'text-yellow-400')} />;
    case 'notApplicable':
      return <MinusCircle className={clsx(cls, 'text-ink-3')} />;
    case 'broken':
      return <AlertTriangle className={clsx(cls, 'text-orange-400')} />;
  }
}

function getStatusLabel(evaluation: EvaluationWithOptimistic) {
  if (isOptimisticQueued(evaluation)) return 'Queued';
  if (isPending(evaluation)) return 'Pending';
  switch (evaluation.status) {
    case 'approved':
      return 'Passed';
    case 'rejected':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'queued':
      return 'Queued';
    case 'notApplicable':
      return 'N/A';
    case 'broken':
      return 'Broken';
  }
}

function getStatusColor(evaluation: EvaluationWithOptimistic) {
  if (isOptimisticQueued(evaluation)) return 'text-yellow-400';
  if (isPending(evaluation)) return 'text-ink-3';
  switch (evaluation.status) {
    case 'approved':
      return 'text-status-done';
    case 'rejected':
      return 'text-status-fail';
    case 'running':
      return 'text-blue-400';
    case 'queued':
      return 'text-yellow-400';
    case 'notApplicable':
      return 'text-ink-3';
    case 'broken':
      return 'text-orange-400';
  }
}

/** Only build policies can be queued/re-queued */
function isBuildPolicy(evaluation: EvaluationWithOptimistic) {
  return !!evaluation.configuration.settings.buildDefinitionId;
}

/** Can this check be queued/re-queued? Only for build policies, not if optimistic queued. */
function canQueue(evaluation: EvaluationWithOptimistic) {
  if (!isBuildPolicy(evaluation)) return false;
  if (isOptimisticQueued(evaluation)) return false;
  if (isPending(evaluation)) return true;
  if (evaluation.status === 'rejected' || evaluation.status === 'broken')
    return true;
  if (evaluation.status === 'approved') return true;
  if (evaluation.status === 'notApplicable') return true;
  return false;
}

function getQueueLabel(evaluation: EvaluationWithOptimistic) {
  if (isPending(evaluation)) return 'Queue';
  if (evaluation.status === 'rejected' || evaluation.status === 'broken')
    return 'Retry';
  if (evaluation.status === 'approved') return 'Re-run';
  return 'Queue';
}

function getDisplayName(evaluation: EvaluationWithOptimistic) {
  return (
    evaluation.configuration.settings.displayName ??
    evaluation.configuration.type.displayName ??
    `Policy ${evaluation.configuration.id}`
  );
}

function getNormalizedDisplayName(evaluation: EvaluationWithOptimistic) {
  return getDisplayName(evaluation).trim().toLowerCase();
}

function getVisibleEvaluations(evaluations: EvaluationWithOptimistic[]) {
  const hasRequiredReviewers = evaluations.some(
    (evaluation) =>
      getNormalizedDisplayName(evaluation) === 'required reviewers',
  );

  return evaluations.filter((evaluation) => {
    const name = getNormalizedDisplayName(evaluation);

    if (name === 'require a merge strategy') return false;
    if (hasRequiredReviewers && name === 'minimum number of reviewers') {
      return false;
    }

    return true;
  });
}

function isRequiredCheck(evaluation: EvaluationWithOptimistic) {
  return evaluation.configuration.isBlocking;
}

function getSummary(evaluations: EvaluationWithOptimistic[]) {
  const required = evaluations.filter(isRequiredCheck);
  const passed = required.filter((e) => e.status === 'approved').length;
  const failed = required.filter((e) => e.status === 'rejected').length;
  const running = required.filter(
    (e) =>
      e.status === 'running' ||
      (e.status === 'queued' && !!e.context?.buildId) ||
      e._optimisticQueued,
  ).length;

  return { total: required.length, passed, failed, running };
}

export function PrChecks({
  evaluations,
  isLoading,
  onRequeue,
  onQueueAll,
  isRequeuing,
  onCheckClick,
  selectedBuildId,
  expandedBuildId,
  onExpandCheck,
  renderExpanded,
  ignoredAutoCompletePolicyIds,
  onIgnoreOptionalPolicy,
  isIgnoringOptionalPolicy,
}: {
  evaluations: EvaluationWithOptimistic[];
  isLoading?: boolean;
  onRequeue?: (evaluationId: string) => void;
  onQueueAll?: (ids: string[]) => void;
  isRequeuing?: boolean;
  onCheckClick?: (buildId: number) => void;
  selectedBuildId?: number | null;
  expandedBuildId?: number | null;
  onExpandCheck?: (buildId: number | null) => void;
  renderExpanded?: (buildId: number) => ReactNode;
  ignoredAutoCompletePolicyIds?: Set<number>;
  onIgnoreOptionalPolicy?: (configId: number) => void;
  isIgnoringOptionalPolicy?: boolean;
}) {
  const visibleEvaluations = useMemo(
    () => getVisibleEvaluations(evaluations),
    [evaluations],
  );

  const sorted = useMemo(() => {
    const order: Record<EvalStatus, number> = {
      rejected: 0,
      broken: 1,
      running: 2,
      queued: 3,
      approved: 4,
      notApplicable: 5,
    };
    return [...visibleEvaluations].sort((a, b) => {
      if (isRequiredCheck(a) !== isRequiredCheck(b)) {
        return isRequiredCheck(a) ? -1 : 1;
      }
      if (a._optimisticQueued !== b._optimisticQueued)
        return a._optimisticQueued ? -1 : 1;
      const aPending = isPending(a);
      const bPending = isPending(b);
      if (aPending !== bPending) return aPending ? -1 : 1;
      return order[a.status] - order[b.status];
    });
  }, [visibleEvaluations]);

  const summary = useMemo(
    () => getSummary(visibleEvaluations),
    [visibleEvaluations],
  );

  const queueableIds = useMemo(
    () =>
      visibleEvaluations.filter((e) => canQueue(e)).map((e) => e.evaluationId),
    [visibleEvaluations],
  );

  const handleQueueAll = useCallback(() => {
    if (onQueueAll) {
      onQueueAll(queueableIds);
    } else if (onRequeue) {
      for (const id of queueableIds) {
        onRequeue(id);
      }
    }
  }, [onQueueAll, onRequeue, queueableIds]);

  // Split into active (non-passed) and passed groups
  const { active, passed } = useMemo(() => {
    const a: typeof sorted = [];
    const p: typeof sorted = [];
    for (const e of sorted) {
      if (e.status === 'approved' && !e._optimisticQueued) {
        p.push(e);
      } else {
        a.push(e);
      }
    }
    return { active: a, passed: p };
  }, [sorted]);

  // Passed checks collapsed by default
  const [showPassed, setShowPassed] = useState(false);

  if (isLoading) {
    return (
      <div className="border-glass-border bg-bg-1 flex items-center justify-center rounded-lg border p-6">
        <Loader2 className="text-ink-3 h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (visibleEvaluations.length === 0) {
    return null;
  }

  const allPassed = summary.failed === 0 && summary.running === 0;

  return (
    <div className="border-glass-border bg-bg-1 overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="border-glass-border/50 flex items-center gap-2 border-b px-3 py-2">
        {allPassed ? (
          <CheckCircle2 className="text-status-done h-4 w-4 shrink-0" />
        ) : summary.failed > 0 ? (
          <XCircle className="text-status-fail h-4 w-4 shrink-0" />
        ) : (
          <ShieldCheck className="text-ink-2 h-4 w-4 shrink-0" />
        )}
        <span className="text-ink-0 text-[13px] font-medium">
          {allPassed ? 'All checks passed' : 'Some checks failed'}
        </span>
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 font-mono text-[10.5px]',
            allPassed
              ? 'bg-status-done/15 text-status-done'
              : summary.failed > 0
                ? 'bg-status-fail/15 text-status-fail'
                : 'bg-glass-medium text-ink-3',
          )}
        >
          {summary.passed}/{summary.total}
        </span>
        <div className="flex-1" />
        {queueableIds.length > 1 && (onQueueAll || onRequeue) && (
          <button
            type="button"
            onClick={handleQueueAll}
            disabled={isRequeuing}
            className="text-ink-2 hover:text-ink-1 flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            Queue all
          </button>
        )}
      </div>

      {/* Active (non-passed) check rows */}
      <div>
        {active.map((evaluation, i) => {
          const buildId = evaluation.context?.buildId;
          const isExpanded = buildId != null && buildId === expandedBuildId;

          return (
            <CheckRow
              key={evaluation.evaluationId}
              evaluation={evaluation}
              onRequeue={onRequeue}
              isAnyRequeuing={isRequeuing}
              onCheckClick={onCheckClick}
              selectedBuildId={selectedBuildId}
              isExpanded={isExpanded}
              onToggleExpand={
                buildId != null && onExpandCheck
                  ? () => onExpandCheck(isExpanded ? null : (buildId ?? null))
                  : undefined
              }
              hasBorderTop={i > 0}
              expandedContent={
                isExpanded && buildId != null && renderExpanded
                  ? renderExpanded(buildId)
                  : null
              }
              ignoredAutoCompletePolicyIds={ignoredAutoCompletePolicyIds}
              onIgnoreOptionalPolicy={onIgnoreOptionalPolicy}
              isIgnoringOptionalPolicy={isIgnoringOptionalPolicy}
            />
          );
        })}
      </div>

      {/* Passed checks — collapsed by default */}
      {passed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className={clsx(
              'flex w-full items-center gap-2 border-t border-white/5 px-3 py-1.5 transition-colors',
              'text-ink-3 hover:bg-white/[0.03]',
            )}
          >
            <CheckCircle2 className="text-status-done h-3.5 w-3.5 shrink-0" />
            <span className="text-[12.5px]">
              {passed.length} passed {passed.length === 1 ? 'check' : 'checks'}
            </span>
            <div className="flex-1" />
            <span className="shrink-0">
              {showPassed ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </span>
          </button>

          {showPassed &&
            passed.map((evaluation, i) => {
              const buildId = evaluation.context?.buildId;
              const isExpanded = buildId != null && buildId === expandedBuildId;

              return (
                <CheckRow
                  key={evaluation.evaluationId}
                  evaluation={evaluation}
                  onRequeue={onRequeue}
                  isAnyRequeuing={isRequeuing}
                  onCheckClick={onCheckClick}
                  selectedBuildId={selectedBuildId}
                  isExpanded={isExpanded}
                  onToggleExpand={
                    buildId != null && onExpandCheck
                      ? () =>
                          onExpandCheck(isExpanded ? null : (buildId ?? null))
                      : undefined
                  }
                  hasBorderTop={i > 0 || active.length > 0}
                  expandedContent={
                    isExpanded && buildId != null && renderExpanded
                      ? renderExpanded(buildId)
                      : null
                  }
                  ignoredAutoCompletePolicyIds={ignoredAutoCompletePolicyIds}
                  onIgnoreOptionalPolicy={onIgnoreOptionalPolicy}
                  isIgnoringOptionalPolicy={isIgnoringOptionalPolicy}
                />
              );
            })}
        </>
      )}
    </div>
  );
}

function CheckRow({
  evaluation,
  onRequeue,
  isAnyRequeuing,
  onCheckClick,
  selectedBuildId,
  isExpanded,
  onToggleExpand,
  hasBorderTop,
  expandedContent,
  ignoredAutoCompletePolicyIds,
  onIgnoreOptionalPolicy,
  isIgnoringOptionalPolicy,
}: {
  evaluation: EvaluationWithOptimistic;
  onRequeue?: (evaluationId: string) => void;
  isAnyRequeuing?: boolean;
  onCheckClick?: (buildId: number) => void;
  selectedBuildId?: number | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  hasBorderTop?: boolean;
  expandedContent?: ReactNode;
  ignoredAutoCompletePolicyIds?: Set<number>;
  onIgnoreOptionalPolicy?: (configId: number) => void;
  isIgnoringOptionalPolicy?: boolean;
}) {
  const name = getDisplayName(evaluation);
  const showQueue = canQueue(evaluation) && onRequeue;
  const queueLabel = getQueueLabel(evaluation);
  const isOptional = !isRequiredCheck(evaluation);
  const isIgnoredForAutoComplete = ignoredAutoCompletePolicyIds?.has(
    evaluation.configuration.id,
  );
  const canIgnoreForAutoComplete =
    isOptional &&
    isBuildPolicy(evaluation) &&
    !!onIgnoreOptionalPolicy &&
    !isIgnoredForAutoComplete;

  const buildId = evaluation.context?.buildId;
  const isClickable = !!onToggleExpand || (!!buildId && !!onCheckClick);
  const isSelected = buildId != null && buildId === selectedBuildId;

  const handleRowClick = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else if (isClickable && buildId && onCheckClick) {
      onCheckClick(buildId);
    }
  };

  return (
    <>
      <div
        className={clsx(
          'flex items-center gap-2.5 px-3 py-1.5 transition-colors',
          hasBorderTop && 'border-t border-white/5',
          isClickable && 'cursor-pointer',
          isExpanded
            ? 'bg-acc/8 border-l-acc border-l-2 pl-2.5'
            : isSelected
              ? 'bg-glass-medium'
              : isClickable && 'hover:bg-white/[0.03]',
        )}
        onClick={handleRowClick}
      >
        {/* Status icon */}
        <span className="shrink-0">{getStatusIcon(evaluation)}</span>

        {/* Name */}
        <span
          className={clsx(
            'min-w-0 flex-1 truncate text-[13px]',
            isExpanded ? 'text-ink-0 font-medium' : 'text-ink-1',
          )}
        >
          {name}
        </span>

        {/* Optional badge */}
        {isOptional && (
          <span className="border-glass-border text-ink-4 shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wider uppercase">
            Optional
          </span>
        )}

        {canIgnoreForAutoComplete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIgnoreOptionalPolicy(evaluation.configuration.id);
            }}
            disabled={isIgnoringOptionalPolicy}
            className="text-status-pr hover:bg-status-pr/15 shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            Ignore for auto-complete
          </button>
        )}

        {isOptional &&
          isBuildPolicy(evaluation) &&
          isIgnoredForAutoComplete && (
            <span className="text-status-done bg-status-done/10 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
              Ignored
            </span>
          )}

        {/* Status label */}
        <span
          className={clsx(
            'min-w-[52px] shrink-0 text-right text-xs font-medium',
            getStatusColor(evaluation),
          )}
        >
          {getStatusLabel(evaluation)}
        </span>

        {/* Queue action button */}
        {showQueue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequeue(evaluation.evaluationId);
            }}
            disabled={isAnyRequeuing}
            className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11.5px] transition-colors disabled:opacity-50"
          >
            {isPending(evaluation) || evaluation.status === 'notApplicable' ? (
              <Play className="h-3 w-3" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {queueLabel}
          </button>
        )}

        {/* Expand chevron */}
        {onToggleExpand && (
          <span className="text-ink-3 ml-0.5 shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </span>
        )}
      </div>

      {/* Expanded inline content */}
      {expandedContent && (
        <div className="bg-acc/4 border-t border-white/5 px-3.5 pt-3 pb-3.5">
          {expandedContent}
        </div>
      )}
    </>
  );
}
