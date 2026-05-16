import clsx from 'clsx';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  MinusCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Circle,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';

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
  if (isOptimisticQueued(evaluation)) {
    return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
  }
  if (isPending(evaluation)) {
    return <Circle className="text-ink-3 h-4 w-4" />;
  }
  switch (evaluation.status) {
    case 'approved':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case 'rejected':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    case 'queued':
      return <Clock className="h-4 w-4 text-yellow-400" />;
    case 'notApplicable':
      return <MinusCircle className="text-ink-3 h-4 w-4" />;
    case 'broken':
      return <AlertTriangle className="h-4 w-4 text-orange-400" />;
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
      return 'Not applicable';
    case 'broken':
      return 'Broken';
  }
}

function getStatusColor(evaluation: EvaluationWithOptimistic) {
  if (isOptimisticQueued(evaluation)) return 'text-yellow-400';
  if (isPending(evaluation)) return 'text-ink-3';
  switch (evaluation.status) {
    case 'approved':
      return 'text-green-400';
    case 'rejected':
      return 'text-red-400';
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
  // Already optimistically queued — don't show button
  if (isOptimisticQueued(evaluation)) return false;
  // Pending (Azure says "queued" but no build triggered) — allow queue
  if (isPending(evaluation)) return true;
  // Failed/broken — allow retry
  if (evaluation.status === 'rejected' || evaluation.status === 'broken')
    return true;
  // Passed — allow re-run
  if (evaluation.status === 'approved') return true;
  // Not applicable — allow queue
  if (evaluation.status === 'notApplicable') return true;
  // Running or truly queued — no action
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

function getSummary(evaluations: EvaluationWithOptimistic[]) {
  const required = evaluations.filter((e) => e.isBlocking);
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
}: {
  evaluations: EvaluationWithOptimistic[];
  isLoading?: boolean;
  onRequeue?: (evaluationId: string) => void;
  onQueueAll?: (ids: string[]) => void;
  isRequeuing?: boolean;
  onCheckClick?: (buildId: number) => void;
  selectedBuildId?: number | null;
}) {
  const [expanded, setExpanded] = useState(true);

  const sorted = useMemo(() => {
    const order: Record<EvalStatus, number> = {
      rejected: 0,
      broken: 1,
      running: 2,
      queued: 3,
      approved: 4,
      notApplicable: 5,
    };
    return [...evaluations].sort((a, b) => {
      // Blocking first
      if (a.isBlocking !== b.isBlocking) return a.isBlocking ? -1 : 1;
      // Optimistic queued sort with running
      if (a._optimisticQueued !== b._optimisticQueued)
        return a._optimisticQueued ? -1 : 1;
      // Pending (queued but not triggered) sort after running but before approved
      const aPending = isPending(a);
      const bPending = isPending(b);
      if (aPending !== bPending) return aPending ? -1 : 1;
      // Then by status
      return order[a.status] - order[b.status];
    });
  }, [evaluations]);

  const summary = useMemo(() => getSummary(evaluations), [evaluations]);

  const queueableIds = useMemo(
    () => evaluations.filter((e) => canQueue(e)).map((e) => e.evaluationId),
    [evaluations],
  );

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  const handleQueueAll = useCallback(() => {
    if (onQueueAll) {
      onQueueAll(queueableIds);
    } else if (onRequeue) {
      for (const id of queueableIds) {
        onRequeue(id);
      }
    }
  }, [onQueueAll, onRequeue, queueableIds]);

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="text-ink-2 mb-2 flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4" />
          Checks
        </div>
        <div className="bg-bg-1 flex items-center justify-center rounded-lg border border-white/5 p-4">
          <Loader2 className="text-ink-3 h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  if (evaluations.length === 0) {
    return null;
  }

  const allPassed = summary.failed === 0 && summary.running === 0;

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="text-ink-2 hover:text-ink-1 flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <ShieldCheck className="h-4 w-4" />
          Checks
          <span
            className={clsx(
              'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              allPassed
                ? 'bg-green-900/30 text-green-400'
                : summary.failed > 0
                  ? 'bg-red-900/30 text-red-400'
                  : 'bg-yellow-900/30 text-yellow-400',
            )}
          >
            {summary.passed}/{summary.total}
          </span>
        </button>

        {/* Queue All button */}
        {expanded && queueableIds.length > 1 && (onQueueAll || onRequeue) && (
          <button
            type="button"
            onClick={handleQueueAll}
            disabled={isRequeuing}
            className="text-ink-3 hover:text-acc-ink hover:bg-glass-medium ml-auto rounded px-2 py-0.5 text-xs transition-colors disabled:opacity-50"
          >
            {isRequeuing ? 'Queueing...' : 'Queue all'}
          </button>
        )}
      </div>

      {/* List */}
      {expanded && (
        <div className="bg-bg-1 overflow-hidden rounded-lg border border-white/5">
          {sorted.map((evaluation) => (
            <CheckRow
              key={evaluation.evaluationId}
              evaluation={evaluation}
              onRequeue={onRequeue}
              isAnyRequeuing={isRequeuing}
              onCheckClick={onCheckClick}
              selectedBuildId={selectedBuildId}
            />
          ))}
        </div>
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
}: {
  evaluation: EvaluationWithOptimistic;
  onRequeue?: (evaluationId: string) => void;
  isAnyRequeuing?: boolean;
  onCheckClick?: (buildId: number) => void;
  selectedBuildId?: number | null;
}) {
  const name = getDisplayName(evaluation);
  const showQueue = canQueue(evaluation) && onRequeue;
  const queueLabel = getQueueLabel(evaluation);
  const pending = isPending(evaluation);

  const buildId = evaluation.context?.buildId;
  const isClickable = !!buildId && !!onCheckClick;
  const isSelected = buildId != null && buildId === selectedBuildId;

  const handleRowClick = () => {
    if (isClickable) {
      onCheckClick(buildId);
    }
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0',
        isClickable && 'hover:bg-glass-light cursor-pointer',
        isSelected && 'bg-glass-medium',
      )}
      onClick={handleRowClick}
    >
      {/* Status icon */}
      <span className="shrink-0">{getStatusIcon(evaluation)}</span>

      {/* Name + optional/required badge */}
      <div className="min-w-0 flex-1">
        <span className="text-ink-1 truncate text-sm">{name}</span>
        {!evaluation.isBlocking && (
          <span className="text-ink-3 ml-2 text-[10px] uppercase">
            optional
          </span>
        )}
      </div>

      {/* Status label */}
      <span className={clsx('shrink-0 text-xs', getStatusColor(evaluation))}>
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
          title={queueLabel}
          className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-1">
            {pending || evaluation.status === 'notApplicable' ? (
              <Play className="h-3 w-3" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {queueLabel}
          </span>
        </button>
      )}
    </div>
  );
}
