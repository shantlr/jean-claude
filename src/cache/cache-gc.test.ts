import { beforeEach, describe, expect, it } from 'vitest';

import type { AzureDevOpsPullRequest } from '@shared/azure-devops-types';
import type { Project, Task, TaskStep } from '@shared/types';

import {
  releaseResource,
  retainResource,
  setDocumentResource,
} from './cache-actions';
import { collectUnusedCache } from './cache-gc';
import { cache$, resetCache } from './cache-store';
import {
  PROJECTS_INDEX_KEY,
  ingestProjects,
  projectResourceKey,
  setProjectIndexIds,
} from './domains/projects';
import {
  ingestPullRequest,
  ingestPullRequestList,
  projectPullRequestsResourceKey,
  pullRequestResourceKey,
  repoPullRequestsResourceKey,
} from './domains/pull-requests';
import {
  ingestStep,
  setTaskStepIndexIds,
  stepResourceKey,
  taskStepsResourceKey,
} from './domains/steps';
import {
  TASKS_INDEX_KEY,
  ingestTask,
  ingestTasks,
  projectTasksResourceKey,
  setProjectTaskIndexIds,
  taskResourceKey,
} from './domains/tasks';

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

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    type: 'agent',
    name: 'Task 1',
    prompt: 'Do work',
    status: 'running',
    worktreePath: '/worktrees/task-1',
    startCommitHash: 'abc123',
    sourceBranch: 'main',
    branchName: 'task-1',
    hasUnread: false,
    userCompleted: false,
    sessionRules: {},
    workItemIds: null,
    workItemUrls: null,
    pullRequestId: null,
    pullRequestUrl: null,
    pendingMessage: null,
    todoItems: [],
    parentTaskId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: 'step-1',
    taskId: 'task-1',
    name: 'Step 1',
    type: 'agent',
    dependsOn: [],
    promptTemplate: 'Do step work',
    resolvedPrompt: null,
    status: 'pending',
    sessionId: null,
    interactionMode: null,
    modelPreference: null,
    thinkingEffort: null,
    agentBackend: null,
    output: null,
    images: null,
    meta: {},
    autoStart: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createPullRequest(
  overrides: Partial<AzureDevOpsPullRequest> = {},
): AzureDevOpsPullRequest {
  return {
    id: 42,
    title: 'Pull request',
    status: 'active',
    isDraft: false,
    createdBy: {
      id: 'user-1',
      displayName: 'User One',
      uniqueName: 'user@example.com',
    },
    creationDate: '2026-01-01T00:00:00.000Z',
    sourceRefName: 'refs/heads/feature',
    targetRefName: 'refs/heads/main',
    url: 'https://example.com/pr/42',
    reviewers: [],
    ...overrides,
  };
}

describe('cache garbage collection', () => {
  beforeEach(() => {
    resetCache();
  });

  it('tracks resource observer count and last unused time', () => {
    retainResource('resource:1');
    retainResource('resource:1');
    releaseResource('resource:1', 100);

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      observerCount: 1,
      lastUnusedAt: null,
    });

    releaseResource('resource:1', 200);

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      observerCount: 0,
      lastUnusedAt: 200,
    });
  });

  it('removes unused document and resource metadata after the unused window', () => {
    setDocumentResource('doc:1', { value: 1 }, 100);
    cache$.resources['doc:1'].assign({ observerCount: 0, lastUnusedAt: 100 });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.resources).toEqual(['doc:1']);
    expect(cache$.documents['doc:1'].get()).toBeUndefined();
    expect(cache$.resources['doc:1'].get()).toBeUndefined();
  });

  it('keeps project entities while their list resource is observed', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });
    ingestProjects([first, second]);
    retainResource(PROJECTS_INDEX_KEY);
    cache$.resources[projectResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[projectResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.projects).toEqual([]);
    expect(cache$.projects['project-1'].get()).toEqual(first);
    expect(cache$.projects['project-2'].get()).toEqual(second);
  });

  it('keeps only entities referenced by retained indexes', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });
    ingestProjects([first, second]);
    setProjectIndexIds([first.id]);
    retainResource(PROJECTS_INDEX_KEY);
    cache$.resources[projectResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[projectResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.projects).toEqual(['project-2']);
    expect(cache$.projects['project-1'].get()).toEqual(first);
    expect(cache$.projects['project-2'].get()).toBeUndefined();
  });

  it('keeps entities with retained detail resources when their index is unused', () => {
    const project = createProject({ id: 'project-1' });
    ingestProjects([project]);
    cache$.resources[PROJECTS_INDEX_KEY].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    retainResource(projectResourceKey(project.id));

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.projects).toEqual([]);
    expect(cache$.indexes[PROJECTS_INDEX_KEY].get()).toBeUndefined();
    expect(cache$.projects['project-1'].get()).toEqual(project);
  });

  it('removes entities when no retained resource or index references them', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });
    ingestProjects([first, second]);
    cache$.resources[PROJECTS_INDEX_KEY].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[projectResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[projectResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.projects).toEqual(['project-1', 'project-2']);
    expect(cache$.indexes[PROJECTS_INDEX_KEY].get()).toBeUndefined();
    expect(cache$.projects['project-1'].get()).toBeUndefined();
    expect(cache$.projects['project-2'].get()).toBeUndefined();
  });

  it('keeps only tasks referenced by retained indexes', () => {
    const first = createTask({ id: 'task-1' });
    const second = createTask({ id: 'task-2', name: 'Task 2' });
    ingestTask(first);
    ingestTask(second);
    setProjectTaskIndexIds('project-1', [first.id]);
    retainResource(projectTasksResourceKey('project-1'));
    cache$.resources[taskResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[taskResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.tasks).toEqual(['task-2']);
    expect(cache$.tasks['task-1'].get()).toEqual(first);
    expect(cache$.tasks['task-2'].get()).toBeUndefined();
  });

  it('keeps tasks referenced by the retained tasks index', () => {
    const first = createTask({ id: 'task-1' });
    const second = createTask({ id: 'task-2', name: 'Task 2' });
    ingestTasks([first]);
    ingestTask(second);
    retainResource(TASKS_INDEX_KEY);
    cache$.resources[taskResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[taskResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.tasks).toEqual(['task-2']);
    expect(cache$.tasks['task-1'].get()).toEqual(first);
    expect(cache$.tasks['task-2'].get()).toBeUndefined();
  });

  it('removes tasks when no retained resource or index references them', () => {
    const task = createTask({ id: 'task-1' });
    ingestTask(task);
    setProjectTaskIndexIds('project-1', [task.id]);
    cache$.resources[projectTasksResourceKey('project-1')].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[taskResourceKey(task.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.tasks).toEqual(['task-1']);
    expect(cache$.tasks['task-1'].get()).toBeUndefined();
  });

  it('keeps tasks with retained detail resources when their indexes are unused', () => {
    const task = createTask({ id: 'task-1' });
    ingestTask(task);
    setProjectTaskIndexIds('project-1', [task.id]);
    cache$.resources[projectTasksResourceKey('project-1')].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    retainResource(taskResourceKey(task.id));

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.tasks).toEqual([]);
    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].get(),
    ).toBeUndefined();
    expect(cache$.tasks['task-1'].get()).toEqual(task);
  });

  it('keeps only pull requests referenced by retained indexes', () => {
    const first = createPullRequest({ id: 42, title: 'First' });
    const second = createPullRequest({ id: 43, title: 'Second' });
    const firstKey = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: first.id,
    });
    const secondKey = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: second.id,
    });

    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequests: [first],
    });
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: second,
    });
    retainResource(projectPullRequestsResourceKey('project-1'));
    cache$.resources[secondKey].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.pullRequests).toEqual([secondKey]);
    expect(cache$.pullRequests[firstKey].get()).toMatchObject({
      title: 'First',
    });
    expect(cache$.pullRequests[secondKey].get()).toBeUndefined();
  });

  it('removes pull requests when no retained resource or index references them', () => {
    const pullRequest = createPullRequest({ id: 42 });
    const key = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: pullRequest.id,
    });

    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequests: [pullRequest],
    });
    cache$.resources[projectPullRequestsResourceKey('project-1')].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[
      repoPullRequestsResourceKey({ providerId: 'github', repoId: 'repo-1' })
    ].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.pullRequests).toEqual([key]);
    expect(cache$.pullRequests[key].get()).toBeUndefined();
  });

  it('keeps projects referenced by retained project task indexes', () => {
    const project = createProject({ id: 'project-1' });
    ingestProjects([project]);
    setProjectTaskIndexIds('project-1', ['task-1']);
    retainResource(projectTasksResourceKey('project-1'));
    cache$.resources[PROJECTS_INDEX_KEY].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[projectResourceKey(project.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.projects).toEqual([]);
    expect(cache$.projects['project-1'].get()).toEqual(project);
  });

  it('keeps tasks referenced by retained task step indexes', () => {
    const task = createTask({ id: 'task-1' });
    ingestTask(task);
    setTaskStepIndexIds('task-1', ['step-1']);
    retainResource(taskStepsResourceKey('task-1'));
    cache$.resources[taskResourceKey(task.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.tasks).toEqual([]);
    expect(cache$.tasks['task-1'].get()).toEqual(task);
  });

  it('keeps only steps referenced by retained indexes', () => {
    const first = createStep({ id: 'step-1' });
    const second = createStep({ id: 'step-2', name: 'Step 2' });
    ingestStep(first);
    ingestStep(second);
    setTaskStepIndexIds('task-1', [first.id]);
    retainResource(taskStepsResourceKey('task-1'));
    cache$.resources[stepResourceKey(first.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[stepResourceKey(second.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.steps).toEqual(['step-2']);
    expect(cache$.steps['step-1'].get()).toEqual(first);
    expect(cache$.steps['step-2'].get()).toBeUndefined();
  });

  it('removes steps when no retained resource or index references them', () => {
    const step = createStep({ id: 'step-1' });
    ingestStep(step);
    setTaskStepIndexIds('task-1', [step.id]);
    cache$.resources[taskStepsResourceKey('task-1')].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    cache$.resources[stepResourceKey(step.id)].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.steps).toEqual(['step-1']);
    expect(cache$.steps['step-1'].get()).toBeUndefined();
  });

  it('keeps steps with retained detail resources when their indexes are unused', () => {
    const step = createStep({ id: 'step-1' });
    ingestStep(step);
    setTaskStepIndexIds('task-1', [step.id]);
    cache$.resources[taskStepsResourceKey('task-1')].assign({
      observerCount: 0,
      lastUnusedAt: 100,
    });
    retainResource(stepResourceKey(step.id));

    const result = collectUnusedCache({ maxUnusedMs: 50, now: 200 });

    expect(result.steps).toEqual([]);
    expect(
      cache$.indexes[taskStepsResourceKey('task-1')].get(),
    ).toBeUndefined();
    expect(cache$.steps['step-1'].get()).toEqual(step);
  });
});
