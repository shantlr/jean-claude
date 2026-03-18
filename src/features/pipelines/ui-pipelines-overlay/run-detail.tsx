import { ExternalLink, Loader2, XCircle } from 'lucide-react';

import { useBuildTimeline, useCancelBuild } from '@/hooks/use-pipeline-runs';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import { StagesTimeline } from './stages-timeline';
import { isBuildRun } from './utils';

export function RunDetail({
  run,
  kind,
  providerId,
  azureProjectId,
}: {
  run: AzureBuildRun | AzureRelease;
  kind: 'build' | 'release';
  providerId: string;
  azureProjectId: string;
}) {
  const isBuild = kind === 'build' && isBuildRun(run);

  const { data: timeline, isLoading: timelineLoading } = useBuildTimeline({
    providerId,
    azureProjectId,
    buildId: run.id,
    enabled: isBuild,
  });

  const cancelBuild = useCancelBuild();

  const webUrl = run._links?.web?.href;
  const isInProgress = isBuild && run.status === 'inProgress';

  return (
    <div className="space-y-3">
      {/* Build timeline content */}
      {isBuild && (
        <>
          {timelineLoading && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading timeline...
            </div>
          )}
          {!timelineLoading && timeline && timeline.records.length === 0 && (
            <span className="text-xs text-neutral-500">
              No stage information available.
            </span>
          )}
          {!timelineLoading && timeline && timeline.records.length > 0 && (
            <StagesTimeline
              records={timeline.records}
              providerId={providerId}
              azureProjectId={azureProjectId}
              buildId={run.id}
            />
          )}
        </>
      )}

      {/* Release placeholder */}
      {!isBuild && (
        <span className="text-xs text-neutral-500">
          Release environment detail view coming soon.
        </span>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-2 border-t border-neutral-700 pt-3">
        {isInProgress && (
          <button
            onClick={() =>
              cancelBuild.mutate({
                providerId,
                azureProjectId,
                buildId: run.id,
              })
            }
            disabled={cancelBuild.isPending}
            className="flex items-center gap-1.5 rounded-md border border-red-800 px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/50 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            {cancelBuild.isPending ? 'Cancelling...' : 'Cancel'}
          </button>
        )}

        {webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Azure DevOps
          </a>
        )}
      </div>
    </div>
  );
}
