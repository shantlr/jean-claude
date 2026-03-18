import { useMemo } from 'react';

import {
  type PipelineRunWithContext,
  useAllPipelineRuns,
} from '@/hooks/use-pipeline-runs';
import { useTrackedPipelines } from '@/hooks/use-tracked-pipelines';
import type { Project } from '@shared/types';

import { RunRow } from './run-row';
import { isBuildRun } from './utils';

import type { SidebarFilter } from './index';

function getRunSortTime(run: PipelineRunWithContext): number {
  if (isBuildRun(run)) {
    return run.startTime ? new Date(run.startTime).getTime() : 0;
  }
  return run.createdOn ? new Date(run.createdOn).getTime() : 0;
}

function isRunActive(run: PipelineRunWithContext): boolean {
  if (isBuildRun(run)) {
    return run.status === 'inProgress' || run.status === 'notStarted';
  }
  return (
    run.status === 'active' ||
    (run.environments?.some((e) => e.status === 'inProgress') ?? false)
  );
}

function ProjectRunList({
  project,
  filter,
}: {
  project: Project;
  filter: SidebarFilter;
}) {
  const { data: trackedPipelines = [] } = useTrackedPipelines(project.id);

  const relevantPipelines = useMemo(() => {
    // When a specific pipeline is selected (even a hidden one), show its runs
    if (filter.type === 'definition' && filter.projectId === project.id) {
      return trackedPipelines.filter(
        (p) =>
          p.azurePipelineId === filter.pipeline.azurePipelineId &&
          p.kind === filter.pipeline.kind,
      );
    }
    // For "all" and "project" views, only show visible pipelines
    return trackedPipelines.filter((p) => p.visible);
  }, [trackedPipelines, filter, project.id]);

  const pipelineConfigs = useMemo(
    () =>
      relevantPipelines.map((p) => ({
        providerId: project.repoProviderId!,
        azureProjectId: project.repoProjectId!,
        definitionId: p.azurePipelineId,
        kind: p.kind,
        jcProjectId: project.id,
      })),
    [relevantPipelines, project],
  );

  const { data: runs = [] } = useAllPipelineRuns({
    pipelines: pipelineConfigs,
    enabled: pipelineConfigs.length > 0,
  });

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => {
      const aActive = isRunActive(a);
      const bActive = isRunActive(b);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return getRunSortTime(b) - getRunSortTime(a);
    });
  }, [runs]);

  if (relevantPipelines.length === 0) return null;

  if (sortedRuns.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-neutral-500">
        No runs found for tracked pipelines in {project.name}.
      </div>
    );
  }

  return (
    <>
      {sortedRuns.map((run) => (
        <RunRow
          key={`${run.kind}-${run.id}`}
          run={run}
          kind={run.kind}
          projectName={project.name}
          providerId={project.repoProviderId!}
          azureProjectId={project.repoProjectId!}
        />
      ))}
    </>
  );
}

export function RunList({
  projects,
  filter,
}: {
  projects: Project[];
  filter: SidebarFilter;
}) {
  const filteredProjects = useMemo(() => {
    if (filter.type === 'all') return projects;
    return projects.filter((p) => p.id === filter.projectId);
  }, [projects, filter]);

  if (filteredProjects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        No Azure-linked projects found
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {filteredProjects.map((project) => (
        <ProjectRunList key={project.id} project={project} filter={filter} />
      ))}
    </div>
  );
}
