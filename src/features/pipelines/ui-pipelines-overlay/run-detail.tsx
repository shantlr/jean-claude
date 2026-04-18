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
            <div className="text-ink-3 flex items-center gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading timeline...
            </div>
          )}
          {!timelineLoading && timeline && timeline.records.length === 0 && (
            <span className="text-ink-3 text-xs">
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
        <span className="text-ink-3 text-xs">
          Release environment detail view coming soon.
        </span>
      )}

      {/* Actions bar */}
      <div className="border-glass-border flex items-center gap-2 border-t pt-3">
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
            className="text-status-fail border-status-fail hover:bg-status-fail/50 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
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
            className="text-ink-1 hover:border-glass-border hover:bg-glass-light border-glass-border flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Azure DevOps
          </a>
        )}
      </div>
    </div>
  );
}
