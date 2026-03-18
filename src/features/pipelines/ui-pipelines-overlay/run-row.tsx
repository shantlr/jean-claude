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
      <Circle className="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-400" />
    );
  }
  if (result === 'succeeded' || status === 'succeeded') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />;
  }
  if (result === 'failed' || status === 'failed' || status === 'rejected') {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />;
  }
  if (
    result === 'canceled' ||
    status === 'canceled' ||
    status === 'cancelling'
  ) {
    return <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" />;
  }
  if (result === 'partiallySucceeded') {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-yellow-400" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-neutral-500" />;
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
          ? 'border-neutral-600 bg-neutral-800/50'
          : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30',
      )}
    >
      <Button
        onClick={toggleExpanded}
        className="flex w-full flex-col gap-1 px-3 py-2.5 text-left"
      >
        {/* Top line */}
        <div className="flex w-full items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          )}

          {getStatusIcon(status, result)}

          {isBuild ? (
            <Hammer className="h-3 w-3 shrink-0 text-neutral-500" />
          ) : (
            <Rocket className="h-3 w-3 shrink-0 text-neutral-500" />
          )}

          <span className="truncate text-sm font-medium text-neutral-200">
            {pipelineName}
          </span>
          <span className="shrink-0 text-xs text-neutral-500">
            {displayNumber}
          </span>

          <div className="flex-1" />

          {branch && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
              <GitBranch className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{branch}</span>
            </span>
          )}

          {relativeTime && (
            <span className="shrink-0 text-xs text-neutral-500">
              {relativeTime}
            </span>
          )}

          {duration && (
            <span className="shrink-0 text-xs text-neutral-500">
              {duration}
            </span>
          )}
        </div>

        {/* Bottom line */}
        <div className="flex w-full items-center gap-2 pl-[calc(0.875rem+0.875rem+1rem)]">
          <span className="text-xs text-neutral-500">
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
              <span className="text-xs text-neutral-600">&middot;</span>
              <span className="text-xs text-neutral-500">{envSummary}</span>
            </>
          )}

          <div className="flex-1" />

          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {projectName}
          </span>
        </div>
      </Button>

      {expanded && (
        <div className="border-t border-neutral-700 px-3 py-3 text-xs text-neutral-500">
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
