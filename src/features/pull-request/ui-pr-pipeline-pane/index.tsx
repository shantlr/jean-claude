import {
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';


import {
  computeDuration,
  stripRefsHeads,
} from '@/features/pipelines/ui-pipelines-overlay/utils';
import { useBuildTimeline, useCancelBuild } from '@/hooks/use-pipeline-runs';
import type { AzureBuildDetail } from '@shared/pipeline-types';
import { StagesTimeline } from '@/features/pipelines/ui-pipelines-overlay/stages-timeline';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useWindowFocused } from '@/hooks/use-window-focused';



import { useBuildDetail } from './use-build-detail';

const DEFAULT_PANE_WIDTH = 420;
const MIN_PANE_WIDTH = 320;
const MAX_PANE_WIDTH = 800;

export function PipelineDetailsPane({
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
  const refetchInterval = isFocused ? 5_000 : false;

  const [paneWidth, setPaneWidth] = useState(DEFAULT_PANE_WIDTH);

  const handleWidthChange = useCallback((width: number) => {
    setPaneWidth(Math.min(Math.max(width, MIN_PANE_WIDTH), MAX_PANE_WIDTH));
  }, []);

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: paneWidth,
    minWidth: MIN_PANE_WIDTH,
    maxWidth: MAX_PANE_WIDTH,
    maxWidthFraction: 10, // Use absolute maxWidth only; fraction irrelevant since containerRef is on pane itself
    direction: 'left',
    onWidthChange: handleWidthChange,
  });

  const { data: build, isLoading: buildLoading } = useBuildDetail({
    providerId,
    azureProjectId,
    buildId,
    refetchInterval,
  });

  const { data: timeline, isLoading: timelineLoading } = useBuildTimeline({
    providerId,
    azureProjectId,
    buildId,
    enabled: true,
    refetchInterval,
  });

  const isInProgress = build?.status === 'inProgress';
  const cancelBuild = useCancelBuild();

  return (
    <div
      ref={containerRef}
      className="border-glass-border bg-bg-1/50 relative flex h-full shrink-0 flex-col border-l"
      style={{ width: paneWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 left-0 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />

      {/* Header */}
      <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-ink-1 truncate text-sm font-medium">
            {build?.definition.name ?? 'Pipeline'}
          </h3>
          {build?.buildNumber && (
            <span className="text-ink-3 text-xs">#{build.buildNumber}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium shrink-0 rounded p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {buildLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
          </div>
        ) : build ? (
          <div className="space-y-4">
            {/* Metadata */}
            <BuildMetadata build={build} />

            {/* Timeline */}
            {timelineLoading && (
              <div className="text-ink-3 flex items-center gap-2 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading timeline...
              </div>
            )}
            {!timelineLoading && timeline && timeline.records.length > 0 && (
              <StagesTimeline
                records={timeline.records}
                providerId={providerId}
                azureProjectId={azureProjectId}
                buildId={buildId}
              />
            )}
            {!timelineLoading && timeline && timeline.records.length === 0 && (
              <span className="text-ink-3 text-xs">
                No stage information available.
              </span>
            )}
          </div>
        ) : (
          <span className="text-ink-3 text-xs">Build not found.</span>
        )}
      </div>

      {/* Footer actions */}
      {build && (
        <div className="border-glass-border flex items-center gap-2 border-t px-4 py-3">
          {isInProgress && (
            <button
              onClick={() =>
                cancelBuild.mutate({ providerId, azureProjectId, buildId })
              }
              disabled={cancelBuild.isPending}
              className="text-status-fail border-status-fail hover:bg-status-fail/50 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {cancelBuild.isPending ? 'Cancelling...' : 'Cancel'}
            </button>
          )}

          {build._links?.web?.href && (
            <a
              href={build._links.web.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-1 hover:border-glass-border hover:bg-glass-light border-glass-border flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Azure DevOps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function BuildMetadata({ build }: { build: AzureBuildDetail }) {
  const duration = useMemo(
    () => computeDuration(build.startTime, build.finishTime),
    [build.startTime, build.finishTime],
  );

  const branch = stripRefsHeads(build.sourceBranch);

  const statusLabel = getStatusLabel(build.status, build.result);

  return (
    <div className="bg-bg-0 space-y-2 rounded-lg p-3">
      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-ink-3 text-xs">Status</span>
        <span
          className={`text-xs font-medium ${getStatusColor(build.status, build.result)}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Branch */}
      <div className="flex items-center justify-between">
        <span className="text-ink-3 text-xs">Branch</span>
        <span className="text-ink-1 flex items-center gap-1 text-xs">
          <GitBranch className="h-3 w-3" />
          {branch}
        </span>
      </div>

      {/* Duration */}
      {duration && (
        <div className="flex items-center justify-between">
          <span className="text-ink-3 text-xs">Duration</span>
          <span className="text-ink-1 flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {duration}
          </span>
        </div>
      )}

      {/* Requested by */}
      {build.requestedFor && (
        <div className="flex items-center justify-between">
          <span className="text-ink-3 text-xs">Triggered by</span>
          <span className="text-ink-1 text-xs">
            {build.requestedFor.displayName}
          </span>
        </div>
      )}
    </div>
  );
}

function getStatusLabel(status: string, result: string): string {
  if (status === 'inProgress') return 'Running';
  if (status === 'notStarted') return 'Queued';
  if (status === 'cancelling') return 'Cancelling';
  if (result === 'succeeded') return 'Succeeded';
  if (result === 'partiallySucceeded') return 'Partially succeeded';
  if (result === 'failed') return 'Failed';
  if (result === 'canceled') return 'Canceled';
  return status;
}

function getStatusColor(status: string, result: string): string {
  if (status === 'inProgress') return 'text-blue-400';
  if (status === 'notStarted') return 'text-yellow-400';
  if (result === 'succeeded') return 'text-green-400';
  if (result === 'failed') return 'text-red-400';
  if (result === 'canceled') return 'text-ink-3';
  return 'text-ink-2';
}
