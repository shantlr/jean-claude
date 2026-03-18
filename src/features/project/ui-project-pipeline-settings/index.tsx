import { Bell, Eye, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { Tooltip } from '@/common/ui/tooltip';
import { useProject } from '@/hooks/use-projects';
import {
  useTrackedPipelines,
  useToggleTrackedPipeline,
  useToggleTrackedPipelineVisible,
  useDiscoverPipelines,
} from '@/hooks/use-tracked-pipelines';
import type { TrackedPipeline } from '@shared/pipeline-types';

function Toggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-neutral-700'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PipelineRow({
  pipeline,
  projectId,
}: {
  pipeline: TrackedPipeline;
  projectId: string;
}) {
  const toggleMutation = useToggleTrackedPipeline(projectId);
  const toggleVisibleMutation = useToggleTrackedPipelineVisible(projectId);

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-neutral-200">{pipeline.name}</span>
      </div>
      <div className="flex items-center gap-4">
        <Tooltip content="Show in the Pipelines overlay">
          <span>
            <Toggle
              checked={pipeline.visible}
              disabled={toggleVisibleMutation.isPending}
              onChange={() =>
                toggleVisibleMutation.mutate({
                  id: pipeline.id,
                  visible: !pipeline.visible,
                })
              }
              ariaLabel={`Show ${pipeline.name} in overlay`}
            />
          </span>
        </Tooltip>
        <Tooltip content="Desktop notifications on completion or failure">
          <span>
            <Toggle
              checked={pipeline.enabled}
              disabled={toggleMutation.isPending}
              onChange={() =>
                toggleMutation.mutate({
                  id: pipeline.id,
                  enabled: !pipeline.enabled,
                })
              }
              ariaLabel={`Enable notifications for ${pipeline.name}`}
            />
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

function PipelineSection({
  title,
  pipelines,
  projectId,
}: {
  title: string;
  pipelines: TrackedPipeline[];
  projectId: string;
}) {
  if (pipelines.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
      <div className="space-y-1">
        {pipelines.map((p) => (
          <PipelineRow key={p.id} pipeline={p} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

export function ProjectPipelineSettings({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: pipelines, isLoading } = useTrackedPipelines(projectId);
  const discoverMutation = useDiscoverPipelines(projectId);

  const hasRepoLink = !!(
    project?.repoProviderId &&
    project?.repoProjectId &&
    project?.repoId
  );

  const buildPipelines = useMemo(
    () => (pipelines ?? []).filter((p) => p.kind === 'build'),
    [pipelines],
  );

  const releasePipelines = useMemo(
    () => (pipelines ?? []).filter((p) => p.kind === 'release'),
    [pipelines],
  );

  // Auto-discover on first visit
  const hasAutoDiscovered = useRef(false);
  const discoverMutateRef = useRef(discoverMutation.mutate);
  discoverMutateRef.current = discoverMutation.mutate;

  useEffect(() => {
    if (
      hasRepoLink &&
      !isLoading &&
      pipelines !== undefined &&
      pipelines.length === 0 &&
      !hasAutoDiscovered.current
    ) {
      hasAutoDiscovered.current = true;
      discoverMutateRef.current();
    }
  }, [hasRepoLink, isLoading, pipelines]);

  if (!hasRepoLink) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-200">
          Pipeline Tracking
        </h2>
        <p className="text-sm text-neutral-500">
          Link an Azure DevOps repository in Integrations to track pipelines.
        </p>
      </div>
    );
  }

  const hasPipelines = buildPipelines.length > 0 || releasePipelines.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">
          Pipeline Tracking
        </h2>
        <button
          type="button"
          onClick={() => discoverMutation.mutate()}
          disabled={discoverMutation.isPending}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3 w-3 ${discoverMutation.isPending ? 'animate-spin' : ''}`}
          />
          {discoverMutation.isPending ? 'Discovering...' : 'Refresh'}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Configure which pipelines appear in the Pipelines overlay and which ones
        send desktop notifications when runs complete or fail.
      </p>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading pipelines...</p>
      ) : !hasPipelines ? (
        <div className="rounded-lg border border-neutral-800 px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">
            No pipelines found for this repository.
          </p>
          <button
            type="button"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="mt-2 cursor-pointer text-sm text-blue-400 hover:text-blue-300"
          >
            Discover pipelines
          </button>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center justify-end gap-4 pr-3 text-[10px] tracking-wider text-neutral-500 uppercase">
            <Tooltip content="Show in the Pipelines overlay">
              <span className="flex w-9 cursor-default items-center justify-center">
                <Eye className="h-3 w-3" />
              </span>
            </Tooltip>
            <Tooltip content="Desktop notifications on completion or failure">
              <span className="flex w-9 cursor-default items-center justify-center">
                <Bell className="h-3 w-3" />
              </span>
            </Tooltip>
          </div>

          <PipelineSection
            title="Build Pipelines"
            pipelines={buildPipelines}
            projectId={projectId}
          />
          <PipelineSection
            title="Release Pipelines"
            pipelines={releasePipelines}
            projectId={projectId}
          />
        </>
      )}
    </div>
  );
}
