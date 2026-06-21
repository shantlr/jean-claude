import { beforeEach, describe, expect, it } from 'vitest';

import type { Project } from '@shared/types';

import { cache$, resetCache } from '../cache-store';
import { clearPendingResources, ensureResource } from '../use-cache-resource';
import { applyCacheEvent } from '../cache-events';


import {
  appendProjectToIndex,
  ingestProject,
  ingestProjects,
  ingestUpdatedProject,
  projectResourceKey,
  PROJECTS_INDEX_KEY,
  removeProject,
  selectProject,
  selectProjectColor,
  selectProjectLogoPath,
  selectProjectName,
  selectProjectPrPriority,
  selectProjectRepoId,
  selectProjectRepoProjectId,
  selectProjectRepoProviderId,
  selectProjects,
  selectProjectWorkItemPriority,
  setProjectIndexIds,
} from './projects';

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Project 1',
    path: '/project-1',
    providerId: null,
    remoteUrl: null,
    color: '#000000',
    type: 'local',
    logoPath: null,
    logoSource: null,
    sortOrder: 0,
    worktreesPath: null,
    defaultBranch: null,
    repoProviderId: null,
    repoProjectId: null,
    repoProjectName: null,
    repoId: null,
    repoName: null,
    workItemProviderId: null,
    workItemProjectId: null,
    workItemProjectName: null,
    showWorkItemsInFeed: false,
    showPrsInFeed: false,
    defaultAgentBackend: null,
    defaultAgentModelPreference: null,
    completionContext: null,
    summary: null,
    aiSkillSlots: null,
    protectedBranches: [],
    favoriteBranches: [],
    prPriority: 'normal',
    workItemPriority: 'normal',
    autoPullSourceBranch: false,
    commitWithNoVerify: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('project cache domain', () => {
  beforeEach(() => {
    resetCache();
    clearPendingResources();
  });

  it('ingests a project entity and marks its resource fresh', () => {
    const project = createProject();

    ingestProject(project);

    expect(selectProject(project.id)).toEqual(project);
    expect(
      cache$.resources[projectResourceKey(project.id)].get(),
    ).toMatchObject({
      status: 'success',
      stale: false,
    });
  });

  it('ingests project lists while preserving list order', () => {
    const first = createProject({ id: 'project-1', name: 'First' });
    const second = createProject({
      id: 'project-2',
      name: 'Second',
      path: '/project-2',
    });

    ingestProjects([second, first]);

    expect(cache$.indexes[PROJECTS_INDEX_KEY].ids.get()).toEqual([
      'project-2',
      'project-1',
    ]);
    expect(selectProjects().map((project) => project.name)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('protects mutation-ingested projects from older in-flight loads', async () => {
    const olderProject = createProject({ name: 'Older' });
    const updatedProject = createProject({ name: 'Updated' });
    const detailKey = projectResourceKey(updatedProject.id);
    let resolveDetailLoad!: (project: Project) => void;
    let resolveListLoad!: (projects: Project[]) => void;

    const detailLoad = ensureResource({
      key: detailKey,
      load: () =>
        new Promise<Project>((resolve) => {
          resolveDetailLoad = resolve;
        }),
      ingest: (project) => ingestProject(project),
    });
    const listLoad = ensureResource({
      key: PROJECTS_INDEX_KEY,
      load: () =>
        new Promise<Project[]>((resolve) => {
          resolveListLoad = resolve;
        }),
      ingest: ingestProjects,
    });
    await Promise.resolve();

    ingestUpdatedProject(updatedProject);
    resolveDetailLoad(olderProject);
    resolveListLoad([olderProject]);
    await Promise.all([detailLoad, listLoad]);

    expect(selectProject(updatedProject.id)?.name).toBe('Updated');
    expect(cache$.resources[detailKey].get()?.stale).toBe(true);
    expect(cache$.resources[PROJECTS_INDEX_KEY].get()?.stale).toBe(true);
  });

  it('appends projects to an existing index without duplicates', () => {
    const first = createProject({ id: 'project-1', name: 'First' });
    const second = createProject({
      id: 'project-2',
      name: 'Second',
      path: '/project-2',
    });

    ingestProjects([first]);
    ingestProject(second);
    appendProjectToIndex(second.id);
    appendProjectToIndex(second.id);

    expect(cache$.indexes[PROJECTS_INDEX_KEY].ids.get()).toEqual([
      'project-1',
      'project-2',
    ]);
    expect(selectProjects().map((project) => project.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('updates project index order without changing entities', () => {
    const first = createProject({ id: 'project-1', name: 'First' });
    const second = createProject({
      id: 'project-2',
      name: 'Second',
      path: '/project-2',
    });
    const third = createProject({
      id: 'project-3',
      name: 'Third',
      path: '/project-3',
    });

    ingestProjects([first, second, third]);
    setProjectIndexIds([third.id, first.id, second.id]);

    expect(cache$.indexes[PROJECTS_INDEX_KEY].ids.get()).toEqual([
      'project-3',
      'project-1',
      'project-2',
    ]);
    expect(selectProjects().map((project) => project.name)).toEqual([
      'Third',
      'First',
      'Second',
    ]);
  });

  it('selects cached project fields', () => {
    const project = createProject({
      color: '#123456',
      logoPath: '/logo.png',
      prPriority: 'high',
      repoId: 'repo-1',
      repoProjectId: 'repo-project-1',
      repoProviderId: 'provider-1',
      workItemPriority: 'low',
    });

    ingestProject(project);

    expect(selectProjectName(project.id)).toBe('Project 1');
    expect(selectProjectColor(project.id)).toBe('#123456');
    expect(selectProjectLogoPath(project.id)).toBe('/logo.png');
    expect(selectProjectRepoProviderId(project.id)).toBe('provider-1');
    expect(selectProjectRepoProjectId(project.id)).toBe('repo-project-1');
    expect(selectProjectRepoId(project.id)).toBe('repo-1');
    expect(selectProjectPrPriority(project.id)).toBe('high');
    expect(selectProjectWorkItemPriority(project.id)).toBe('low');
  });

  it('removes a project entity and list index entry', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });
    ingestProjects([first, second]);

    removeProject('project-1');

    expect(selectProject('project-1')).toBeUndefined();
    expect(cache$.indexes[PROJECTS_INDEX_KEY].ids.get()).toEqual(['project-2']);
  });

  it('applies project upsert events and marks the project list stale', () => {
    const project = createProject();
    ingestProjects([]);

    applyCacheEvent({ type: 'project.upsert', project });

    expect(selectProject(project.id)).toEqual(project);
    expect(
      cache$.resources[projectResourceKey(project.id)].get(),
    ).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources[PROJECTS_INDEX_KEY].get()?.stale).toBe(true);
  });

  it('applies project patch events without replacing unrelated fields', () => {
    const project = createProject({
      color: '#111111',
      logoPath: '/before.png',
      prPriority: 'normal',
      workItemPriority: 'normal',
      summary: 'Keep me',
    });
    ingestProject(project);

    applyCacheEvent({
      type: 'project.patch',
      projectId: project.id,
      patch: {
        name: 'After',
        color: '#222222',
        logoPath: '/after.png',
        prPriority: 'high',
        workItemPriority: 'low',
        summary: undefined,
      },
    });

    expect(selectProject(project.id)).toMatchObject({
      ...project,
      name: 'After',
      color: '#222222',
      logoPath: '/after.png',
      prPriority: 'high',
      workItemPriority: 'low',
      summary: 'Keep me',
    });
    expect(cache$.resources[PROJECTS_INDEX_KEY].get()?.stale).toBe(true);
  });

  it('applies project delete events by removing the entity and index entry', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });
    ingestProjects([first, second]);

    applyCacheEvent({ type: 'project.delete', projectId: first.id });

    expect(selectProject(first.id)).toBeUndefined();
    expect(cache$.indexes[PROJECTS_INDEX_KEY].ids.get()).toEqual([second.id]);
    expect(cache$.resources[PROJECTS_INDEX_KEY].get()?.stale).toBe(true);
  });
});
