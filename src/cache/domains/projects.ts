import type { Project } from '@shared/types';

import {
  markResourceChanged,
  setIndexResource,
  setResourceSuccess,
} from '../cache-actions';
import { cache$ } from '../cache-store';

export const PROJECTS_INDEX_KEY = 'projects';

export function projectResourceKey(projectId: string) {
  return `project:${projectId}`;
}

export function ingestProject(project: Project) {
  cache$.projects[project.id].set(project);
  setResourceSuccess(projectResourceKey(project.id));
}

export function ingestUpdatedProject(project: Project) {
  markResourceChanged(projectResourceKey(project.id));
  markResourceChanged(PROJECTS_INDEX_KEY);
  ingestProject(project);
}

export function ingestUpdatedProjects(projects: Project[]) {
  markResourceChanged(PROJECTS_INDEX_KEY);
  for (const project of projects) {
    markResourceChanged(projectResourceKey(project.id));
  }

  ingestProjects(projects);
}

export function ingestProjects(projects: Project[]) {
  for (const project of projects) {
    ingestProject(project);
  }

  setIndexResource(
    PROJECTS_INDEX_KEY,
    projects.map((project) => project.id),
  );
}

export function appendProjectToIndex(projectId: string) {
  const ids = cache$.indexes[PROJECTS_INDEX_KEY].ids.get();
  if (!ids || ids.includes(projectId)) {
    return;
  }

  cache$.indexes[PROJECTS_INDEX_KEY].ids.set([...ids, projectId]);
}

export function removeProject(projectId: string) {
  cache$.projects[projectId].delete();

  const ids = cache$.indexes[PROJECTS_INDEX_KEY].ids.get();
  if (ids) {
    cache$.indexes[PROJECTS_INDEX_KEY].ids.set(
      ids.filter((id) => id !== projectId),
    );
  }
}

export function getProjectIndexIds() {
  return cache$.indexes[PROJECTS_INDEX_KEY].ids.get();
}

export function setProjectIndexIds(ids: string[]) {
  setIndexResource(PROJECTS_INDEX_KEY, ids);
}

export function selectProject(projectId: string) {
  return cache$.projects[projectId].get();
}

export function selectProjectName(projectId: string) {
  return cache$.projects[projectId].name.get();
}

export function selectProjectColor(projectId: string) {
  return cache$.projects[projectId].color.get();
}

export function selectProjectLogoPath(projectId: string) {
  return cache$.projects[projectId].logoPath.get();
}

export function selectProjectRepoProviderId(projectId: string) {
  return cache$.projects[projectId].repoProviderId.get();
}

export function selectProjectRepoProjectId(projectId: string) {
  return cache$.projects[projectId].repoProjectId.get();
}

export function selectProjectRepoId(projectId: string) {
  return cache$.projects[projectId].repoId.get();
}

export function selectProjectPrPriority(projectId: string) {
  return cache$.projects[projectId].prPriority.get();
}

export function selectProjectWorkItemPriority(projectId: string) {
  return cache$.projects[projectId].workItemPriority.get();
}

export function selectProjects() {
  const ids = cache$.indexes[PROJECTS_INDEX_KEY].ids.get() ?? [];
  return ids.flatMap((id) => {
    const project = cache$.projects[id].get();
    return project ? [project] : [];
  });
}
