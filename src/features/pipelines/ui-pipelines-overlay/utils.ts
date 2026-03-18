import { formatDuration } from '@/lib/time';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

export function isBuildRun(
  run: AzureBuildRun | AzureRelease,
): run is AzureBuildRun {
  return 'buildNumber' in run;
}

export function computeDuration(
  startTime: string | null,
  finishTime: string | null,
): string | null {
  if (!startTime) return null;
  if (!finishTime) return 'running...';
  const ms = new Date(finishTime).getTime() - new Date(startTime).getTime();
  if (ms < 0) return null;
  return formatDuration(ms);
}

export function stripRefsHeads(branch: string): string {
  return branch.startsWith('refs/heads/')
    ? branch.slice('refs/heads/'.length)
    : branch;
}

export function getReleaseStatus(release: AzureRelease): {
  status: string;
  result: string | null;
} {
  const envStatuses = (release.environments ?? []).map((e) => e.status);
  if (envStatuses.some((s) => s === 'inProgress')) {
    return { status: 'inProgress', result: null };
  }
  if (envStatuses.some((s) => s === 'rejected')) {
    return { status: 'completed', result: 'failed' };
  }
  if (envStatuses.every((s) => s === 'succeeded')) {
    return { status: 'completed', result: 'succeeded' };
  }
  if (envStatuses.some((s) => s === 'canceled')) {
    return { status: 'canceled', result: 'canceled' };
  }
  if (envStatuses.some((s) => s === 'partiallySucceeded')) {
    return { status: 'completed', result: 'partiallySucceeded' };
  }
  return { status: release.status, result: null };
}
