import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MinusCircle,
  RefreshCw,
  Sparkles,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';


import type {
  AzureBuildDetail,
  AzureBuildTimelineRecord,
} from '@shared/pipeline-types';
import {
  computeDuration,
  stripRefsHeads,
} from '@/features/pipelines/ui-pipelines-overlay/utils';
import { useBuildLog, useBuildTimeline } from '@/hooks/use-pipeline-runs';
import { useWindowFocused } from '@/hooks/use-window-focused';


import { useBuildDetail } from '../ui-pr-pipeline-pane/use-build-detail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageGroup {
  stage: AzureBuildTimelineRecord;
  jobs: JobGroup[];
}

interface JobGroup {
  job: AzureBuildTimelineRecord;
  tasks: AzureBuildTimelineRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusLabel(status: string, result: string): string {
  if (status === 'inProgress') return 'Running';
  if (status === 'notStarted') return 'Queued';
  if (status === 'cancelling') return 'Cancelling';
  if (result === 'succeeded') return 'Succeeded';
  if (result === 'partiallySucceeded') return 'Partial';
  if (result === 'failed') return 'Failed';
  if (result === 'canceled') return 'Canceled';
  return status;
}

function getStatusBorderColor(status: string, result: string): string {
  if (status === 'inProgress') return 'border-t-blue-500';
  if (status === 'notStarted') return 'border-t-amber-500';
  if (result === 'succeeded') return 'border-t-green-500';
  if (result === 'failed') return 'border-t-red-500';
  if (result === 'canceled') return 'border-t-neutral-500';
  return 'border-t-neutral-500';
}

function getStatusGradient(status: string, result: string): string {
  if (status === 'inProgress')
    return 'bg-gradient-to-b from-blue-500/10 to-transparent';
  if (status === 'notStarted')
    return 'bg-gradient-to-b from-amber-500/10 to-transparent';
  if (result === 'succeeded')
    return 'bg-gradient-to-b from-green-500/10 to-transparent';
  if (result === 'failed')
    return 'bg-gradient-to-b from-red-500/10 to-transparent';
  return '';
}

function getStatusPillClasses(status: string, result: string): string {
  if (status === 'inProgress')
    return 'bg-blue-500/15 border-blue-500/30 text-blue-400';
  if (status === 'notStarted')
    return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
  if (result === 'succeeded')
    return 'bg-green-500/15 border-green-500/30 text-green-400';
  if (result === 'failed')
    return 'bg-red-500/15 border-red-500/30 text-red-400';
  if (result === 'canceled')
    return 'bg-neutral-500/15 border-neutral-500/30 text-ink-3';
  return 'bg-neutral-500/15 border-neutral-500/30 text-ink-3';
}

function getStatusIcon(
  status: string,
  result: string,
  size = 'h-[18px] w-[18px]',
) {
  if (status === 'inProgress') {
    return (
      <Loader2 className={clsx('shrink-0 animate-spin text-blue-400', size)} />
    );
  }
  if (result === 'succeeded') {
    return <CheckCircle2 className={clsx('text-status-done shrink-0', size)} />;
  }
  if (result === 'failed') {
    return <XCircle className={clsx('text-status-fail shrink-0', size)} />;
  }
  if (result === 'skipped') {
    return <MinusCircle className={clsx('text-ink-3 shrink-0', size)} />;
  }
  if (result === 'canceled' || result === 'abandoned') {
    return <MinusCircle className={clsx('text-ink-2 shrink-0', size)} />;
  }
  if (status === 'notStarted') {
    return <Circle className={clsx('shrink-0 text-amber-400', size)} />;
  }
  return <Circle className={clsx('text-ink-3 shrink-0', size)} />;
}

function getRecordStatusIcon(state: string, result: string | null) {
  return getStatusIcon(state, result ?? '', 'h-3.5 w-3.5');
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function computeDurationMs(
  startTime: string | null,
  finishTime: string | null,
): number {
  if (!startTime || !finishTime) return 0;
  return Math.max(
    0,
    new Date(finishTime).getTime() - new Date(startTime).getTime(),
  );
}

function buildStageGroups(records: AzureBuildTimelineRecord[]): StageGroup[] {
  const stages = records
    .filter((r) => r.type === 'Stage')
    .sort((a, b) => a.order - b.order);
  const jobs = records.filter((r) => r.type === 'Job');
  const tasks = records.filter((r) => r.type === 'Task');

  const recordById = new Map(records.map((r) => [r.id, r]));

  const isDescendantOf = (
    recordId: string | null,
    ancestorId: string,
  ): boolean => {
    let currentId = recordId;
    const visited = new Set<string>();
    while (currentId) {
      if (currentId === ancestorId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const current = recordById.get(currentId);
      currentId = current?.parentId ?? null;
    }
    return false;
  };

  return stages.map<StageGroup>((stage) => {
    let stageJobs = jobs.filter((j) => j.parentId === stage.id);
    if (stageJobs.length === 0) {
      stageJobs = jobs.filter((j) => isDescendantOf(j.parentId, stage.id));
    }
    stageJobs.sort((a, b) => a.order - b.order);

    const jobGroups = stageJobs.map<JobGroup>((job) => ({
      job,
      tasks: tasks
        .filter((t) => t.parentId === job.id)
        .sort((a, b) => a.order - b.order),
    }));

    return { stage, jobs: jobGroups };
  });
}

// ---------------------------------------------------------------------------
// Log viewer
// ---------------------------------------------------------------------------

function LogViewer({
  providerId,
  azureProjectId,
  buildId,
  logId,
  issues,
}: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  logId: number;
  issues?: Array<{ type: string; message: string }>;
}) {
  const { data: logContent, isLoading } = useBuildLog({
    providerId,
    azureProjectId,
    buildId,
    logId,
  });

  const lines = useMemo(() => {
    if (!logContent) return [];
    return logContent.split('\n');
  }, [logContent]);

  const errorMessages = useMemo(() => {
    if (!issues) return new Set<string>();
    return new Set(
      issues.filter((i) => i.type === 'error').map((i) => i.message),
    );
  }, [issues]);

  const handleCopy = useCallback(() => {
    if (logContent) {
      void navigator.clipboard.writeText(logContent);
    }
  }, [logContent]);

  if (isLoading) {
    return (
      <div className="text-ink-3 flex items-center gap-2 py-2 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading log...
      </div>
    );
  }

  if (!logContent) return null;

  return (
    <div className="overflow-hidden rounded-md border border-neutral-700/50">
      {/* Terminal header */}
      <div className="flex items-center justify-between bg-neutral-900/80 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500/55" />
            <span className="h-2 w-2 rounded-full bg-yellow-500/55" />
            <span className="h-2 w-2 rounded-full bg-green-500/55" />
          </div>
          <span className="text-[11px] text-neutral-500">
            output · {lines.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
          >
            <Copy className="h-2.5 w-2.5" />
            Copy
          </button>
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300">
            <FileText className="h-2.5 w-2.5" />
            Raw
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div className="max-h-72 overflow-auto bg-neutral-950/80 py-1 font-mono text-[11px] leading-[20px]">
        {lines.map((line, idx) => {
          const isError = errorMessages.has(line.trim());
          return (
            <div
              key={idx}
              className={clsx(
                'flex',
                isError
                  ? 'border-l-2 border-l-red-500 bg-red-500/10'
                  : 'border-l-2 border-l-transparent',
              )}
            >
              <span className="w-10 shrink-0 pr-2 text-right text-neutral-600 select-none">
                {idx + 1}
              </span>
              <span
                className={clsx(
                  'min-w-0 flex-1 pr-3 break-all whitespace-pre-wrap',
                  isError ? 'text-red-400' : 'text-neutral-300',
                )}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task step row
// ---------------------------------------------------------------------------

function TaskStepRow({
  task,
  providerId,
  azureProjectId,
  buildId,
  defaultExpanded,
}: {
  task: AzureBuildTimelineRecord;
  providerId: string;
  azureProjectId: string;
  buildId: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  const hasLog = task.log?.id != null;
  const isExpandable = hasLog;
  const duration = computeDuration(task.startTime, task.finishTime);
  const isFailed = task.result === 'failed';
  const issueCount = (task.errorCount || 0) + (task.warningCount || 0);

  return (
    <div>
      <button
        onClick={isExpandable ? toggleExpanded : undefined}
        className={clsx(
          'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs transition-colors',
          isFailed && 'bg-red-500/[0.07]',
          isExpandable
            ? 'hover:bg-glass-light cursor-pointer'
            : 'cursor-default',
        )}
      >
        {isExpandable ? (
          expanded ? (
            <ChevronDown className="text-ink-3 h-2.5 w-2.5 shrink-0" />
          ) : (
            <ChevronRight className="text-ink-3 h-2.5 w-2.5 shrink-0" />
          )
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        {getRecordStatusIcon(task.state, task.result)}
        <span
          className={clsx(
            'min-w-0 truncate text-left',
            isFailed ? 'text-ink-0 font-medium' : 'text-ink-1',
            hasLog && 'font-mono',
          )}
        >
          {task.name}
        </span>
        {issueCount > 0 && (
          <span className="text-status-fail shrink-0 font-mono text-[10px]">
            {task.errorCount > 0 && `${task.errorCount} err`}
            {task.errorCount > 0 && task.warningCount > 0 && ' '}
            {task.warningCount > 0 && `${task.warningCount} warn`}
          </span>
        )}
        {duration && (
          <span
            className={clsx(
              'ml-auto shrink-0 font-mono text-[10.5px]',
              isFailed ? 'text-status-fail' : 'text-ink-3',
            )}
          >
            {duration}
          </span>
        )}
      </button>

      {expanded && hasLog && (
        <div className="mt-1 mb-2 ml-5">
          <LogViewer
            providerId={providerId}
            azureProjectId={azureProjectId}
            buildId={buildId}
            logId={task.log!.id}
            issues={task.issues}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job card
// ---------------------------------------------------------------------------

function JobCard({
  jobGroup,
  totalStageDurationMs,
  providerId,
  azureProjectId,
  buildId,
}: {
  jobGroup: JobGroup;
  totalStageDurationMs: number;
  providerId: string;
  azureProjectId: string;
  buildId: number;
}) {
  const { job, tasks } = jobGroup;
  const isFailed = job.result === 'failed';
  const [expanded, setExpanded] = useState(isFailed);
  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  const duration = computeDuration(job.startTime, job.finishTime);
  const durationMs = computeDurationMs(job.startTime, job.finishTime);

  const stagePercent =
    totalStageDurationMs > 0
      ? Math.round((durationMs / totalStageDurationMs) * 100)
      : 0;

  const passCount = tasks.filter((t) => t.result === 'succeeded').length;
  const failCount = tasks.filter((t) => t.result === 'failed').length;
  const skipCount = tasks.filter((t) => t.result === 'skipped').length;

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-lg border',
        isFailed ? 'border-red-500/35' : 'border-glass-border bg-bg-0',
      )}
    >
      {/* Job header */}
      <button
        onClick={toggleExpanded}
        className="hover:bg-glass-light flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown className="text-ink-3 h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-3 w-3 shrink-0" />
        )}
        {getRecordStatusIcon(job.state, job.result)}
        <span className="text-ink-0 min-w-0 truncate text-[13px] font-semibold">
          {job.name}
        </span>

        {/* Step counts */}
        <span className="text-ink-3 flex shrink-0 gap-1.5 font-mono text-[10.5px]">
          {passCount > 0 && (
            <span className="text-status-done">{passCount}✓</span>
          )}
          {failCount > 0 && (
            <span className="text-status-fail">{failCount}✗</span>
          )}
          {skipCount > 0 && <span className="text-ink-3">{skipCount}⊘</span>}
        </span>

        <div className="flex-1" />

        {stagePercent > 0 && (
          <span className="text-ink-4 shrink-0 font-mono text-[10px]">
            {stagePercent}% of stage
          </span>
        )}

        <span
          className={clsx(
            'min-w-[52px] shrink-0 text-right font-mono text-[11.5px] font-medium',
            isFailed ? 'text-status-fail' : 'text-ink-1',
          )}
        >
          {duration ?? '—'}
        </span>
      </button>

      {/* Expanded tasks */}
      {expanded && tasks.length > 0 && (
        <div className="border-glass-border bg-bg-1 space-y-0.5 border-t px-2 py-1.5">
          {tasks.map((task) => (
            <TaskStepRow
              key={task.id}
              task={task}
              providerId={providerId}
              azureProjectId={azureProjectId}
              buildId={buildId}
              defaultExpanded={task.result === 'failed'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gantt timeline
// ---------------------------------------------------------------------------

function GanttTimeline({ stageGroups }: { stageGroups: StageGroup[] }) {
  const [nowMs] = useState(() => Date.now());
  const allJobs = useMemo(
    () => stageGroups.flatMap((sg) => sg.jobs.map((jg) => jg.job)),
    [stageGroups],
  );

  const { minTime, maxTime, totalMs } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const job of allJobs) {
      if (job.startTime) min = Math.min(min, new Date(job.startTime).getTime());
      if (job.finishTime)
        max = Math.max(max, new Date(job.finishTime).getTime());
      if (job.state === 'inProgress' && job.startTime)
        max = Math.max(max, nowMs);
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = min + 1;
    return { minTime: min, maxTime: max, totalMs: max - min };
  }, [allJobs, nowMs]);

  const totalDuration = useMemo(
    () =>
      computeDuration(
        new Date(minTime).toISOString(),
        new Date(maxTime).toISOString(),
      ),
    [minTime, maxTime],
  );

  if (allJobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-ink-3 text-[10.5px] font-semibold tracking-wider uppercase">
          Timeline
        </span>
        {totalDuration && (
          <span className="text-ink-4 font-mono text-[10.5px]">
            {totalDuration} total · {allJobs.length} jobs
          </span>
        )}
      </div>

      <div className="border-glass-border bg-bg-0 overflow-hidden rounded-lg border p-3">
        {/* Time axis */}
        <div
          className="mb-1 flex"
          style={{ paddingLeft: 110, paddingRight: 56 }}
        >
          <div className="flex flex-1 justify-between font-mono text-[10px] text-neutral-500">
            <span>0s</span>
            <span>
              {computeDuration(
                new Date(minTime).toISOString(),
                new Date(minTime + totalMs * 0.25).toISOString(),
              )}
            </span>
            <span>
              {computeDuration(
                new Date(minTime).toISOString(),
                new Date(minTime + totalMs * 0.5).toISOString(),
              )}
            </span>
            <span>
              {computeDuration(
                new Date(minTime).toISOString(),
                new Date(minTime + totalMs * 0.75).toISOString(),
              )}
            </span>
            <span>{totalDuration}</span>
          </div>
        </div>

        {/* Job bars */}
        <div className="flex flex-col gap-1">
          {allJobs.map((job) => {
            const startMs = job.startTime
              ? new Date(job.startTime).getTime() - minTime
              : 0;
            const endMs = job.finishTime
              ? new Date(job.finishTime).getTime() - minTime
              : job.state === 'inProgress'
                ? nowMs - minTime
                : 0;

            const leftPercent = totalMs > 0 ? (startMs / totalMs) * 100 : 0;
            const widthPercent =
              totalMs > 0
                ? Math.max(((endMs - startMs) / totalMs) * 100, 0.5)
                : 0;
            const isFailed = job.result === 'failed';
            const isSkipped = job.result === 'skipped';
            const duration = computeDuration(job.startTime, job.finishTime);

            return (
              <div key={job.id} className="flex items-center">
                <div className="flex w-[100px] shrink-0 items-center gap-1.5 pr-2.5">
                  {getRecordStatusIcon(job.state, job.result)}
                  <span
                    className={clsx(
                      'text-ink-1 truncate text-[11.5px] font-medium',
                      isSkipped && 'opacity-25',
                    )}
                  >
                    {job.name}
                  </span>
                </div>
                <div className="relative flex-1" style={{ height: 12 }}>
                  <div
                    className={clsx(
                      'absolute top-0 h-full rounded-sm',
                      isFailed
                        ? 'bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.4)]'
                        : job.state === 'inProgress'
                          ? 'bg-blue-500'
                          : 'bg-green-500',
                      isSkipped && 'opacity-25',
                    )}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                  />
                  {/* Failure tick */}
                  {isFailed && (
                    <div
                      className="absolute top-[-3px] h-[18px] w-0.5 bg-white"
                      style={{
                        left: `${leftPercent + widthPercent * 0.76}%`,
                      }}
                    />
                  )}
                </div>
                <span className="text-ink-3 w-[50px] shrink-0 pl-2 text-right font-mono text-[10.5px]">
                  {duration ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failure callout
// ---------------------------------------------------------------------------

function FailureCallout({
  stageGroups,
  onJumpToFailure,
}: {
  stageGroups: StageGroup[];
  onJumpToFailure: () => void;
}) {
  let failedInfo: {
    jobName: string;
    failedCount: number;
    firstFailed: AzureBuildTimelineRecord;
  } | null = null;
  for (const sg of stageGroups) {
    for (const jg of sg.jobs) {
      const failedTasks = jg.tasks.filter((t) => t.result === 'failed');
      if (failedTasks.length > 0) {
        failedInfo = {
          jobName: jg.job.name,
          failedCount: failedTasks.length,
          firstFailed: failedTasks[0],
        };
        break;
      }
    }
    if (failedInfo) break;
  }

  if (!failedInfo) return null;

  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-red-500/20 bg-red-500/[0.09] px-4 py-3">
      <AlertTriangle className="text-status-fail h-[18px] w-[18px] shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="text-ink-0 text-[13px] font-semibold">
          {failedInfo.failedCount} task
          {failedInfo.failedCount !== 1 ? 's' : ''} failed in{' '}
          <span className="font-mono">{failedInfo.jobName}</span>
        </p>
        <p className="text-ink-2 mt-0.5 truncate font-mono text-[11.5px]">
          {failedInfo.firstFailed.name}
          {failedInfo.firstFailed.finishTime && (
            <span className="text-ink-4">
              {' '}
              · failed at{' '}
              <span className="text-ink-1">
                {formatTime(failedInfo.firstFailed.finishTime)}
              </span>
            </span>
          )}
        </p>
      </div>

      <button
        onClick={onJumpToFailure}
        className="text-status-fail border-status-fail/30 bg-status-fail/15 hover:bg-status-fail/25 flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      >
        <AlertTriangle className="h-3 w-3" />
        Jump to first failure
      </button>
      <button className="text-ink-2 hover:text-ink-1 hover:bg-glass-medium flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors">
        <Sparkles className="h-3 w-3" />
        Ask Claude to fix
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header strip
// ---------------------------------------------------------------------------

function HeaderStrip({
  build,
  onClose,
}: {
  build: AzureBuildDetail;
  onClose: () => void;
}) {
  const duration = computeDuration(build.startTime, build.finishTime);
  const branch = stripRefsHeads(build.sourceBranch);
  const statusLabel = getStatusLabel(build.status, build.result);

  return (
    <div
      className={clsx(
        'relative border-t-2 px-4 py-3.5',
        getStatusBorderColor(build.status, build.result),
        getStatusGradient(build.status, build.result),
      )}
    >
      <div className="flex items-start gap-3">
        {/* Left: status + name */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {getStatusIcon(build.status, build.result, 'h-[22px] w-[22px]')}
            <span className="text-ink-0 text-[15px] font-semibold tracking-tight">
              {build.definition.name}
            </span>
            <span className="text-ink-3 font-mono text-[11.5px]">
              #{build.buildNumber}
            </span>
            <span
              className={clsx(
                'rounded border px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wider uppercase',
                getStatusPillClasses(build.status, build.result),
              )}
            >
              {statusLabel}
            </span>
          </div>

          {/* Meta row */}
          <div className="text-ink-3 mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px]">
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {duration}
              </span>
            )}
            <span className="text-ink-4">·</span>
            {build.startTime && (
              <span className="font-mono text-[11px]">
                {formatTime(build.startTime)}
                {build.finishTime && ` → ${formatTime(build.finishTime)}`}
              </span>
            )}
            <span className="text-ink-4">·</span>
            {build.requestedFor && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {build.requestedFor.displayName}
              </span>
            )}
            <span className="text-ink-4">·</span>
            {branch && <span className="font-mono text-[11px]">{branch}</span>}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button className="border-glass-border bg-bg-2 hover:bg-bg-3 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors">
            <RefreshCw className="h-3 w-3" />
            Re-run
          </button>
          {build._links?.web?.href && (
            <a
              href={build._links.web.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-ink-1 hover:bg-glass-medium flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Azure DevOps
            </a>
          )}
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium rounded p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CIInlinePanel({
  providerId,
  azureProjectId,
  buildId,
  onClose,
}: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  onClose: () => void;
}) {
  const isFocused = useWindowFocused();

  const { data: build, isLoading: buildLoading } = useBuildDetail({
    providerId,
    azureProjectId,
    buildId,
    refetchInterval: isFocused ? 5_000 : false,
  });

  const isInProgress =
    build?.status === 'inProgress' || build?.status === 'notStarted';

  const { data: timeline, isLoading: timelineLoading } = useBuildTimeline({
    providerId,
    azureProjectId,
    buildId,
    enabled: true,
    refetchInterval: isInProgress && isFocused ? 5_000 : false,
  });

  const stageGroups = useMemo(() => {
    if (!timeline?.records) return [];
    return buildStageGroups(timeline.records);
  }, [timeline]);

  const isFailed = build?.result === 'failed';

  const failedJobRef = useRef<HTMLDivElement>(null);

  const handleJumpToFailure = useCallback(() => {
    failedJobRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, []);

  const firstFailedJobId = useMemo(() => {
    for (const sg of stageGroups) {
      for (const jg of sg.jobs) {
        if (jg.job.result === 'failed') return jg.job.id;
      }
    }
    return null;
  }, [stageGroups]);

  if (buildLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!build) {
    return <span className="text-ink-3 text-xs">Build not found.</span>;
  }

  return (
    <div
      className={clsx(
        'border-glass-border bg-bg-1 overflow-hidden rounded-xl border',
        isFailed &&
          'border-red-500/35 shadow-[0_0_0_1px_rgba(239,68,68,0.2),0_20px_50px_rgba(0,0,0,0.35)]',
        !isFailed && 'shadow-[0_12px_30px_rgba(0,0,0,0.25)]',
      )}
    >
      {/* Header */}
      <HeaderStrip build={build} onClose={onClose} />

      {/* Failure callout */}
      {isFailed && stageGroups.length > 0 && (
        <div className="border-b border-red-500/20">
          <FailureCallout
            stageGroups={stageGroups}
            onJumpToFailure={handleJumpToFailure}
          />
        </div>
      )}

      {/* Body */}
      <div className="space-y-4 px-4 py-4">
        {/* Loading */}
        {timelineLoading && (
          <div className="text-ink-3 flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading timeline...
          </div>
        )}

        {/* Timeline gantt */}
        {!timelineLoading && stageGroups.length > 0 && (
          <GanttTimeline stageGroups={stageGroups} />
        )}

        {/* Job cards */}
        {!timelineLoading &&
          stageGroups.map((sg) => {
            const stageDurationMs = computeDurationMs(
              sg.stage.startTime,
              sg.stage.finishTime,
            );

            return (
              <div key={sg.stage.id} className="space-y-2">
                {stageGroups.length > 1 && (
                  <div className="flex items-center gap-2">
                    {getRecordStatusIcon(sg.stage.state, sg.stage.result)}
                    <span className="text-ink-1 text-xs font-semibold">
                      {sg.stage.name}
                    </span>
                    {computeDuration(
                      sg.stage.startTime,
                      sg.stage.finishTime,
                    ) && (
                      <span className="text-ink-3 text-xs">
                        {computeDuration(
                          sg.stage.startTime,
                          sg.stage.finishTime,
                        )}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {sg.jobs.map((jg) => (
                    <div
                      key={jg.job.id}
                      ref={
                        jg.job.id === firstFailedJobId
                          ? failedJobRef
                          : undefined
                      }
                    >
                      <JobCard
                        jobGroup={jg}
                        totalStageDurationMs={stageDurationMs}
                        providerId={providerId}
                        azureProjectId={azureProjectId}
                        buildId={buildId}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

        {!timelineLoading && timeline && timeline.records.length === 0 && (
          <span className="text-ink-3 text-xs">
            No stage information available.
          </span>
        )}
      </div>
    </div>
  );
}
