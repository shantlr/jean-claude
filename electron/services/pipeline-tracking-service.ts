import { BrowserWindow } from 'electron';

import type { AppNotification } from '@shared/notification-types';
import type { AzureBuildRun, AzureRelease } from '@shared/pipeline-types';

import { NotificationRepository } from '../database/repositories/notifications';
import { ProjectRepository } from '../database/repositories/projects';
import { TrackedPipelineRepository } from '../database/repositories/tracked-pipelines';
import type { TrackedPipelineRow } from '../database/schema';
import { dbg } from '../lib/debug';

function safeJsonParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

import * as azureDevOps from './azure-devops-service';
import { notificationService } from './notification-service';

const ACTIVE_INTERVAL_MS = 30_000;
const IDLE_INTERVAL_MS = 5 * 60_000;
const CLEANUP_MAX_AGE_DAYS = 7;

class PipelineTrackingService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs = IDLE_INTERVAL_MS;
  private isPolling = false;

  start() {
    dbg.main('Pipeline tracking service started');
    this.cleanupOldNotifications();
    // Run first poll immediately, then schedule subsequent polls
    this.poll();
    this.scheduleNext(IDLE_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(intervalMs: number) {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.currentIntervalMs = intervalMs;
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const enabledPipelines = await TrackedPipelineRepository.findAllEnabled();
      if (enabledPipelines.length === 0) {
        this.switchToIdle();
        return;
      }

      const byProject = new Map<string, TrackedPipelineRow[]>();
      const projectIds = new Set<string>();
      for (const p of enabledPipelines) {
        const existing = byProject.get(p.projectId) ?? [];
        existing.push(p);
        byProject.set(p.projectId, existing);
        projectIds.add(p.projectId);
      }

      // Batch-fetch all needed projects to avoid N+1 queries
      const allProjects = await ProjectRepository.findAll();
      const projectMap = new Map(
        allProjects.filter((p) => projectIds.has(p.id)).map((p) => [p.id, p]),
      );

      let hasActiveRuns = false;

      for (const [projectId, pipelines] of byProject) {
        const project = projectMap.get(projectId);
        if (!project?.repoProviderId || !project?.repoProjectId) continue;

        for (const pipeline of pipelines) {
          try {
            if (pipeline.kind === 'build') {
              const hadActive = await this.checkBuilds(
                project.repoProviderId,
                project.repoProjectId,
                pipeline,
                projectId,
              );
              if (hadActive) hasActiveRuns = true;
            } else {
              const hadActive = await this.checkReleases(
                project.repoProviderId,
                project.repoProjectId,
                pipeline,
                projectId,
              );
              if (hadActive) hasActiveRuns = true;
            }
          } catch (err) {
            dbg.main('Pipeline poll error for %s: %O', pipeline.name, err);
          }
        }
      }

      if (hasActiveRuns && this.currentIntervalMs !== ACTIVE_INTERVAL_MS) {
        dbg.main('Switching to active polling interval (30s)');
        this.scheduleNext(ACTIVE_INTERVAL_MS);
      } else if (
        !hasActiveRuns &&
        this.currentIntervalMs !== IDLE_INTERVAL_MS
      ) {
        this.switchToIdle();
      }
    } finally {
      this.isPolling = false;
    }
  }

  private switchToIdle() {
    if (this.currentIntervalMs !== IDLE_INTERVAL_MS) {
      dbg.main('Switching to idle polling interval (5min)');
      this.scheduleNext(IDLE_INTERVAL_MS);
    }
  }

  private async checkBuilds(
    providerId: string,
    azureProjectId: string,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ): Promise<boolean> {
    const isFirstPoll = pipeline.lastCheckedRunId === null;

    const builds = await azureDevOps.listBuilds({
      providerId,
      projectId: azureProjectId,
      definitionId: pipeline.azurePipelineId,
      minId: pipeline.lastCheckedRunId ?? undefined,
    });

    let hasActive = false;
    let maxProcessedId = pipeline.lastCheckedRunId ?? 0;

    for (const build of builds) {
      if (build.status === 'inProgress') {
        hasActive = true;
        continue;
      }

      // Only advance watermark past terminal builds
      if (build.id > maxProcessedId) maxProcessedId = build.id;

      // On first poll, just set the watermark — don't flood with historical notifications
      if (
        !isFirstPoll &&
        build.status === 'completed' &&
        build.id > (pipeline.lastCheckedRunId ?? 0)
      ) {
        await this.createBuildNotification(build, pipeline, projectId);
      }
    }

    if (maxProcessedId > (pipeline.lastCheckedRunId ?? 0)) {
      await TrackedPipelineRepository.updateLastCheckedRunId(
        pipeline.id,
        maxProcessedId,
      );
    }

    return hasActive;
  }

  private async checkReleases(
    providerId: string,
    azureProjectId: string,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ): Promise<boolean> {
    const isFirstPoll = pipeline.lastCheckedRunId === null;

    const releases = await azureDevOps.listReleases({
      providerId,
      projectId: azureProjectId,
      definitionId: pipeline.azurePipelineId,
    });

    let hasActive = false;
    let maxProcessedId = pipeline.lastCheckedRunId ?? 0;

    for (const release of releases) {
      const releaseEnvironments = Array.isArray(release.environments)
        ? release.environments
        : [];
      const activeEnvs = releaseEnvironments.filter(
        (e) => e.status === 'inProgress' || e.status === 'queued',
      );
      if (activeEnvs.length > 0) {
        hasActive = true;
        continue;
      }

      // Only advance watermark past releases where all environments are terminal
      if (release.id > maxProcessedId) maxProcessedId = release.id;

      // On first poll, just set the watermark — don't flood with historical notifications
      if (!isFirstPoll && release.id > (pipeline.lastCheckedRunId ?? 0)) {
        await this.createReleaseNotification(release, pipeline, projectId);
      }
    }

    if (maxProcessedId > (pipeline.lastCheckedRunId ?? 0)) {
      await TrackedPipelineRepository.updateLastCheckedRunId(
        pipeline.id,
        maxProcessedId,
      );
    }

    return hasActive;
  }

  private async createBuildNotification(
    build: AzureBuildRun,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ) {
    const isCancelled = build.result === 'canceled';
    const isSuccess = build.result === 'succeeded';
    const type = isCancelled
      ? 'pipeline-cancelled'
      : isSuccess
        ? 'pipeline-completed'
        : 'pipeline-failed';
    const statusLabel = isCancelled
      ? 'cancelled'
      : isSuccess
        ? 'succeeded'
        : 'failed';
    const title = `${pipeline.name} #${build.buildNumber} ${statusLabel}`;
    const body = `Branch: ${build.sourceBranch.replace('refs/heads/', '')}`;
    const sourceUrl = build._links?.web?.href ?? null;

    const notification = await NotificationRepository.create({
      projectId,
      type,
      title,
      body,
      sourceUrl,
      read: 0,
      meta: JSON.stringify({
        pipelineId: pipeline.azurePipelineId,
        buildId: build.id,
        buildNumber: build.buildNumber,
        result: build.result,
        branch: build.sourceBranch,
      }),
    });

    this.emitToRenderer(this.rowToAppNotification(notification));

    notificationService.notify({
      id: `pipeline-${build.id}`,
      title,
      body,
    });
  }

  private async createReleaseNotification(
    release: AzureRelease,
    pipeline: TrackedPipelineRow,
    projectId: string,
  ) {
    const releaseEnvironments = Array.isArray(release.environments)
      ? release.environments
      : [];
    const failedEnvs = releaseEnvironments.filter(
      (e) => e.status === 'rejected',
    );
    const cancelledEnvs = releaseEnvironments.filter(
      (e) => e.status === 'canceled',
    );
    const isCancelled = cancelledEnvs.length > 0 && failedEnvs.length === 0;
    const isSuccess = failedEnvs.length === 0 && cancelledEnvs.length === 0;
    const type = isCancelled
      ? 'release-cancelled'
      : isSuccess
        ? 'release-completed'
        : 'release-failed';
    const envSummary = releaseEnvironments
      .map((e) => `${e.name}: ${e.status}`)
      .join(', ');
    const statusLabel = isCancelled
      ? 'cancelled'
      : isSuccess
        ? 'succeeded'
        : 'failed';
    const title = `${pipeline.name} ${release.name} ${statusLabel}`;
    const body = envSummary;
    const sourceUrl = release._links?.web?.href ?? null;

    const notification = await NotificationRepository.create({
      projectId,
      type,
      title,
      body,
      sourceUrl,
      read: 0,
      meta: JSON.stringify({
        pipelineId: pipeline.azurePipelineId,
        releaseId: release.id,
        releaseName: release.name,
        environments: releaseEnvironments.map((e) => ({
          name: e.name,
          status: e.status,
        })),
      }),
    });

    this.emitToRenderer(this.rowToAppNotification(notification));

    notificationService.notify({
      id: `release-${release.id}`,
      title,
      body,
    });
  }

  private rowToAppNotification(row: {
    id: string;
    projectId: string | null;
    type: string;
    title: string;
    body: string;
    sourceUrl: string | null;
    read: number;
    meta: string | null;
    createdAt: string;
  }): AppNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as AppNotification['type'],
      title: row.title,
      body: row.body,
      sourceUrl: row.sourceUrl,
      read: row.read === 1,
      meta: safeJsonParse(row.meta),
      createdAt: row.createdAt,
    };
  }

  private emitToRenderer(notification: AppNotification) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('notifications:new', notification);
      }
    }
  }

  async discoverPipelines(projectId: string) {
    const project = await ProjectRepository.findById(projectId);
    if (!project?.repoProviderId || !project?.repoProjectId) {
      throw new Error('Project has no linked Azure DevOps repo');
    }

    const [buildDefs, releaseDefs] = await Promise.all([
      azureDevOps
        .listBuildDefinitions({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
        })
        .catch((err) => {
          dbg.main('Failed to list build definitions: %O', err);
          return [];
        }),
      azureDevOps
        .listReleaseDefinitions({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
        })
        .catch((err) => {
          dbg.main('Failed to list release definitions: %O', err);
          return [];
        }),
    ]);

    dbg.main(
      'Discovered %d build and %d release definitions for project %s',
      buildDefs.length,
      releaseDefs.length,
      projectId,
    );

    const rows = [
      ...buildDefs.map((d) => ({
        projectId,
        azurePipelineId: d.id,
        kind: 'build' as const,
        name: d.name,
        enabled: 0,
      })),
      ...releaseDefs.map((d) => ({
        projectId,
        azurePipelineId: d.id,
        kind: 'release' as const,
        name: d.name,
        enabled: 0,
      })),
    ];

    await TrackedPipelineRepository.upsertMany(rows);
    return TrackedPipelineRepository.findByProject(projectId);
  }

  private async cleanupOldNotifications() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_MAX_AGE_DAYS);
    await NotificationRepository.deleteOlderThan(cutoff.toISOString());
    dbg.main(
      'Cleaned up notifications older than %d days',
      CLEANUP_MAX_AGE_DAYS,
    );
  }
}

export const pipelineTrackingService = new PipelineTrackingService();
