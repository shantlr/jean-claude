import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { useProject } from '@/hooks/use-projects';
import {
  useTrackedPipelines,
  useToggleTrackedPipeline,
  useDiscoverPipelines,
} from '@/hooks/use-tracked-pipelines';
import type { TrackedPipeline } from '@shared/pipeline-types';

function PipelineRow({
  pipeline,
  projectId,
}: {
  pipeline: TrackedPipeline;
  projectId: string;
}) {
  const toggleMutation = useToggleTrackedPipeline(projectId);

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-neutral-200">{pipeline.name}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={pipeline.enabled}
        onClick={() =>
          toggleMutation.mutate({
            id: pipeline.id,
            enabled: !pipeline.enabled,
          })
        }
        disabled={toggleMutation.isPending}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
          pipeline.enabled ? 'bg-blue-600' : 'bg-neutral-700'
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            pipeline.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
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

  // Task 16: Auto-discover on first visit
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
          {buildPipelines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-400">
                Build Pipelines
              </h3>
              <div className="space-y-1">
                {buildPipelines.map((p) => (
                  <PipelineRow key={p.id} pipeline={p} projectId={projectId} />
                ))}
              </div>
            </div>
          )}

          {releasePipelines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-400">
                Release Pipelines
              </h3>
              <div className="space-y-1">
                {releasePipelines.map((p) => (
                  <PipelineRow key={p.id} pipeline={p} projectId={projectId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
