import clsx from 'clsx';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { useBuildLog } from '@/hooks/use-pipeline-runs';
import type { AzureBuildTimelineRecord } from '@shared/pipeline-types';

import { computeDuration } from './utils';

function getRecordStatusIcon(state: string, result: string | null) {
  if (state === 'inProgress') {
    return (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
    );
  }
  if (result === 'succeeded') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />;
  }
  if (result === 'failed') {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />;
  }
  if (result === 'skipped') {
    return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-neutral-500" />;
  }
  if (result === 'canceled' || result === 'abandoned') {
    return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-neutral-400" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-neutral-500" />;
}

interface StageGroup {
  stage: AzureBuildTimelineRecord;
  jobs: JobGroup[];
}

interface JobGroup {
  job: AzureBuildTimelineRecord;
  tasks: AzureBuildTimelineRecord[];
}

function TaskLogView({
  providerId,
  azureProjectId,
  buildId,
  logId,
}: {
  providerId: string;
  azureProjectId: string;
  buildId: number;
  logId: number;
}) {
  const { data: logContent, isLoading } = useBuildLog({
    providerId,
    azureProjectId,
    buildId,
    logId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading log...
      </div>
    );
  }

  if (!logContent) return null;

  return (
    <pre className="max-h-60 overflow-auto rounded bg-neutral-950 p-3 text-xs text-neutral-300">
      {logContent}
    </pre>
  );
}

function TaskRow({
  task,
  providerId,
  azureProjectId,
  buildId,
}: {
  task: AzureBuildTimelineRecord;
  providerId: string;
  azureProjectId: string;
  buildId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  const hasLog = task.log?.id != null;
  const hasIssues = task.issues && task.issues.length > 0;
  const isExpandable = hasLog || hasIssues;

  const duration = computeDuration(task.startTime, task.finishTime);
  const issueCount = (task.errorCount || 0) + (task.warningCount || 0);

  return (
    <div className="ml-4 py-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={isExpandable ? toggleExpanded : undefined}
        className="w-full justify-start"
      >
        {isExpandable ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {getRecordStatusIcon(task.state, task.result)}
        <span className="truncate text-neutral-300">{task.name}</span>
        {issueCount > 0 && (
          <span className="shrink-0 text-red-400">
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
        {duration && (
          <span className="ml-auto shrink-0 text-neutral-500">{duration}</span>
        )}
      </Button>

      {expanded && (
        <div className="mt-1 ml-8 space-y-2">
          {hasIssues && (
            <div className="rounded border border-red-900/50 bg-red-950/30 p-2">
              {task.issues!.map((issue, i) => (
                <div key={i} className="text-xs text-red-300">
                  <span className="font-medium">[{issue.type}]</span>{' '}
                  {issue.message}
                </div>
              ))}
            </div>
          )}
          {hasLog && (
            <TaskLogView
              providerId={providerId}
              azureProjectId={azureProjectId}
              buildId={buildId}
              logId={task.log!.id}
            />
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({
  jobGroup,
  providerId,
  azureProjectId,
  buildId,
}: {
  jobGroup: JobGroup;
  providerId: string;
  azureProjectId: string;
  buildId: number;
}) {
  const { job, tasks } = jobGroup;
  const [expanded, setExpanded] = useState(job.result === 'failed');
  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  const duration = computeDuration(job.startTime, job.finishTime);

  return (
    <div className="ml-4 border-l border-neutral-700 pl-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleExpanded}
        className="w-full justify-start"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" />
        )}
        {getRecordStatusIcon(job.state, job.result)}
        <span className="truncate text-sm text-neutral-200">{job.name}</span>
        {duration && (
          <span className="ml-auto shrink-0 text-xs text-neutral-500">
            {duration}
          </span>
        )}
      </Button>

      {expanded && tasks.length > 0 && (
        <div className="mt-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              providerId={providerId}
              azureProjectId={azureProjectId}
              buildId={buildId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StagesTimeline({
  records,
  providerId,
  azureProjectId,
  buildId,
}: {
  records: AzureBuildTimelineRecord[];
  providerId: string;
  azureProjectId: string;
  buildId: number;
}) {
  const stageGroups = useMemo(() => {
    const stages = records
      .filter((r) => r.type === 'Stage')
      .sort((a, b) => a.order - b.order);
    const jobs = records.filter((r) => r.type === 'Job');
    const tasks = records.filter((r) => r.type === 'Task');

    return stages.map<StageGroup>((stage) => {
      const stageJobs = jobs
        .filter((j) => j.parentId === stage.id)
        .sort((a, b) => a.order - b.order);

      const jobGroups = stageJobs.map<JobGroup>((job) => ({
        job,
        tasks: tasks
          .filter((t) => t.parentId === job.id)
          .sort((a, b) => a.order - b.order),
      }));

      return { stage, jobs: jobGroups };
    });
  }, [records]);

  const defaultStageId = useMemo(() => {
    const failed = stageGroups.find((sg) => sg.stage.result === 'failed');
    if (failed) return failed.stage.id;
    const running = stageGroups.find((sg) => sg.stage.state === 'inProgress');
    if (running) return running.stage.id;
    return null;
  }, [stageGroups]);

  const [expandedStageId, setExpandedStageId] = useState<string | null>(
    defaultStageId,
  );

  const expandedGroup = useMemo(
    () => stageGroups.find((sg) => sg.stage.id === expandedStageId) ?? null,
    [stageGroups, expandedStageId],
  );

  return (
    <div className="space-y-3">
      {/* Horizontal stage chips */}
      <div className="flex flex-wrap items-center gap-y-2">
        {stageGroups.map((sg, i) => {
          const { stage } = sg;
          const isSelected = expandedStageId === stage.id;
          const duration = computeDuration(stage.startTime, stage.finishTime);

          return (
            <div key={stage.id} className="flex items-center">
              {i > 0 && <div className="h-px w-4 bg-neutral-600" />}
              <button
                onClick={() => setExpandedStageId(isSelected ? null : stage.id)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  isSelected
                    ? 'border-neutral-500 bg-neutral-700'
                    : 'border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800',
                )}
              >
                {getRecordStatusIcon(stage.state, stage.result)}
                <span className="text-neutral-200">{stage.name}</span>
                {duration && (
                  <span className="text-neutral-500">{duration}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded stage detail */}
      {expandedGroup && (
        <div className="rounded-lg border border-neutral-700 p-3">
          {expandedGroup.jobs.length === 0 ? (
            <span className="text-xs text-neutral-500">
              No jobs in this stage.
            </span>
          ) : (
            <div className="space-y-1">
              {expandedGroup.jobs.map((jg) => (
                <JobRow
                  key={jg.job.id}
                  jobGroup={jg}
                  providerId={providerId}
                  azureProjectId={azureProjectId}
                  buildId={buildId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
