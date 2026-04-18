import clsx from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  GitBranch,
  Hammer,
  Rocket,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/common/ui/button';
import { formatRelativeTime } from '@/lib/time';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import { RunDetail } from './run-detail';
import {
  computeDuration,
  getReleaseStatus,
  isBuildRun,
  stripRefsHeads,
} from './utils';

function getStatusIcon(status: string, result: string | null) {
  if (status === 'inProgress' || status === 'notStarted') {
    return (
      <Circle className="text-acc-ink h-3.5 w-3.5 shrink-0 animate-pulse" />
    );
  }
  if (result === 'succeeded' || status === 'succeeded') {
    return <CheckCircle2 className="text-status-done h-3.5 w-3.5 shrink-0" />;
  }
  if (result === 'failed' || status === 'failed' || status === 'rejected') {
    return <XCircle className="text-status-fail h-3.5 w-3.5 shrink-0" />;
  }
  if (
    result === 'canceled' ||
    status === 'canceled' ||
    status === 'cancelling'
  ) {
    return <Clock className="text-ink-2 h-3.5 w-3.5 shrink-0" />;
  }
  if (result === 'partiallySucceeded') {
    return <AlertCircle className="text-status-run h-3.5 w-3.5 shrink-0" />;
  }
  return <Circle className="text-ink-3 h-3.5 w-3.5 shrink-0" />;
}

function getEnvSummary(release: AzureRelease): string | null {
  const envs = release.environments ?? [];
  if (envs.length === 0) return null;
  const completed = envs.filter(
    (e) =>
      e.status === 'succeeded' ||
      e.status === 'rejected' ||
      e.status === 'canceled',
  ).length;
  return `Stage ${completed}/${envs.length}`;
}

function deriveRunProps(run: AzureBuildRun | AzureRelease, kind: string) {
  if (kind === 'build' && isBuildRun(run)) {
    return {
      isBuild: true as const,
      pipelineName: run.definition.name,
      displayNumber: `#${run.buildNumber}`,
      status: run.status,
      result: run.result,
      branch: stripRefsHeads(run.sourceBranch),
      startTime: run.startTime,
      finishTime: run.finishTime,
      envSummary: null,
    };
  }

  // Type guard ensures this is AzureRelease when kind !== 'build'
  const release = run as AzureRelease;
  const { status, result } = getReleaseStatus(release);
  return {
    isBuild: false as const,
    pipelineName: release.releaseDefinition.name,
    displayNumber: release.name,
    status,
    result,
    branch: null,
    startTime: release.createdOn,
    finishTime: null,
    envSummary: getEnvSummary(release),
  };
}

export function RunRow({
  run,
  kind,
  projectName,
  providerId,
  azureProjectId,
}: {
  run: AzureBuildRun | AzureRelease;
  kind: 'build' | 'release';
  projectName: string;
  providerId: string;
  azureProjectId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const {
    isBuild,
    pipelineName,
    displayNumber,
    status,
    result,
    branch,
    startTime,
    finishTime,
    envSummary,
  } = deriveRunProps(run, kind);

  const relativeTime = startTime ? formatRelativeTime(startTime) : null;
  const duration = computeDuration(startTime, finishTime);

  return (
    <div
      className={clsx(
        'rounded-lg border transition-colors',
        expanded
          ? 'border-glass-border bg-bg-1/50'
          : 'border-line-soft hover:bg-bg-1/30 hover:border-glass-border',
      )}
    >
      <Button
        variant="unstyled"
        onClick={toggleExpanded}
        className="hover:bg-glass-medium flex w-full cursor-pointer flex-col items-stretch gap-1 rounded-lg px-3 py-2.5 text-sm transition-colors"
      >
        {/* Top line */}
        <div className="flex w-full items-center gap-2">
          {expanded ? (
            <ChevronDown className="text-ink-3 h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="text-ink-3 h-3.5 w-3.5 shrink-0" />
          )}

          {getStatusIcon(status, result)}

          {isBuild ? (
            <Hammer className="text-ink-3 h-3 w-3 shrink-0" />
          ) : (
            <Rocket className="text-ink-3 h-3 w-3 shrink-0" />
          )}

          <span className="text-ink-1 truncate text-sm font-medium">
            {pipelineName}
          </span>
          <span className="text-ink-3 shrink-0 text-xs">{displayNumber}</span>

          <div className="flex-1" />

          {branch && (
            <span className="text-ink-2 flex shrink-0 items-center gap-1 text-xs">
              <GitBranch className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{branch}</span>
            </span>
          )}

          {relativeTime && (
            <span className="text-ink-3 shrink-0 text-xs">{relativeTime}</span>
          )}

          {duration && (
            <span className="text-ink-3 shrink-0 text-xs">{duration}</span>
          )}
        </div>

        {/* Bottom line */}
        <div className="flex w-full items-center gap-2 pl-[calc(0.875rem+0.875rem+1rem)]">
          <span className="text-ink-3 text-xs">
            {status === 'inProgress'
              ? 'Running'
              : status === 'notStarted'
                ? 'Queued'
                : result === 'succeeded'
                  ? 'Succeeded'
                  : result === 'failed'
                    ? 'Failed'
                    : result === 'canceled'
                      ? 'Canceled'
                      : result === 'partiallySucceeded'
                        ? 'Partially succeeded'
                        : status}
          </span>

          {envSummary && (
            <>
              <span className="text-ink-4 text-xs">&middot;</span>
              <span className="text-ink-3 text-xs">{envSummary}</span>
            </>
          )}

          <div className="flex-1" />

          <span className="text-ink-3 bg-bg-1 rounded px-1.5 py-0.5 text-[10px]">
            {projectName}
          </span>
        </div>
      </Button>

      {expanded && (
        <div className="text-ink-3 border-glass-border border-t px-3 py-3 text-xs">
          <RunDetail
            run={run}
            kind={kind}
            providerId={providerId}
            azureProjectId={azureProjectId}
          />
        </div>
      )}
    </div>
  );
}
