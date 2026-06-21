import { beforeEach, describe, expect, it } from 'vitest';

import type { Project, Task, TaskStep } from '@shared/types';
import type { AzureDevOpsPullRequestDetails } from '@shared/azure-devops-types';


import {
  allProjectsPullRequestsResourceKey,
  projectPullRequestsResourceKey,
  pullRequestResourceKey,
  repoPullRequestsResourceKey,
  selectPullRequest,
} from './domains/pull-requests';
import { cache$, resetCache } from './cache-store';
import {
  getResourceChangeVersion,
  markResourceStale,
  setDocumentResource,
} from './cache-actions';
import { removeTask, taskResourceKey } from './domains/tasks';
import { applyCacheEvent } from './cache-events';
import { isResourceInitialLoading } from './use-cache-resource';



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

function createPullRequest(
  overrides: Partial<AzureDevOpsPullRequestDetails> = {},
): AzureDevOpsPullRequestDetails {
  return {
    id: 42,
    title: 'Before',
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
    description: 'Keep description',
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

describe('cache store foundation', () => {
  beforeEach(() => {
    resetCache();
  });

  it('stores document resources and matching resource metadata', () => {
    setDocumentResource('doc:1', { value: 1 }, 123);

    expect(cache$.documents['doc:1'].get()).toMatchObject({
      data: { value: 1 },
      status: 'success',
      lastFetchedAt: 123,
      stale: false,
    });
    expect(cache$.resources['doc:1'].get()).toMatchObject({
      status: 'success',
      lastFetchedAt: 123,
      stale: false,
    });
  });

  it('marks existing resources stale', () => {
    setDocumentResource('doc:1', { value: 1 }, 123);
    markResourceStale('doc:1');

    expect(cache$.resources['doc:1'].get()?.stale).toBe(true);
  });

  it('applies project upsert events and marks the project list stale', () => {
    const project = createProject({ name: 'Before' });

    applyCacheEvent({
      type: 'project.upsert',
      project,
    });

    expect(cache$.projects['project-1'].get()).toEqual(project);
    expect(cache$.resources['project:project-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources.projects.get()?.stale).toBe(true);
  });

  it('applies project patch events without replacing unrelated fields', () => {
    const project = createProject({
      name: 'Before',
      color: '#111111',
      logoPath: '/before.png',
      prPriority: 'normal',
      workItemPriority: 'normal',
      summary: 'Keep me',
    });

    applyCacheEvent({
      type: 'project.upsert',
      project,
    });
    applyCacheEvent({
      type: 'project.patch',
      projectId: 'project-1',
      patch: {
        name: 'After',
        color: '#222222',
        logoPath: '/after.png',
        prPriority: 'high',
        workItemPriority: 'low',
      },
    });

    expect(cache$.projects['project-1'].get()).toMatchObject({
      ...project,
      name: 'After',
      color: '#222222',
      logoPath: '/after.png',
      prPriority: 'high',
      workItemPriority: 'low',
      summary: 'Keep me',
    });
    expect(cache$.resources.projects.get()?.stale).toBe(true);
  });

  it('applies project delete events by removing the entity and index entry', () => {
    const first = createProject({ id: 'project-1' });
    const second = createProject({ id: 'project-2', path: '/project-2' });

    applyCacheEvent({ type: 'project.upsert', project: first });
    applyCacheEvent({ type: 'project.upsert', project: second });
    cache$.indexes.projects.ids.set(['project-1', 'project-2']);

    applyCacheEvent({ type: 'project.delete', projectId: 'project-1' });

    expect(cache$.projects['project-1'].get()).toBeUndefined();
    expect(cache$.indexes.projects.ids.get()).toEqual(['project-2']);
    expect(cache$.resources.projects.get()?.stale).toBe(true);
    expect(cache$.resources['project:project-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
  });

  it('applies project delete events by removing cascaded tasks and steps', () => {
    const project = createProject({ id: 'project-1' });
    const task = createTask({ id: 'task-1', projectId: project.id });
    const step = createStep({ id: 'step-1', taskId: task.id });

    applyCacheEvent({ type: 'project.upsert', project });
    applyCacheEvent({ type: 'task.upsert', task });
    applyCacheEvent({ type: 'step.upsert', step });
    cache$.indexes['tasks:project:project-1'].ids.set(['task-1']);
    cache$.indexes['steps:task:task-1'].ids.set(['step-1']);

    applyCacheEvent({
      type: 'project.delete',
      projectId: 'project-1',
      taskIds: ['task-1'],
      stepIds: ['step-1'],
    });

    expect(cache$.projects['project-1'].get()).toBeUndefined();
    expect(cache$.tasks['task-1'].get()).toBeUndefined();
    expect(cache$.steps['step-1'].get()).toBeUndefined();
    expect(cache$.indexes['tasks:project:project-1'].ids.get()).toEqual([]);
    expect(cache$.indexes['steps:task:task-1'].ids.get()).toEqual([]);
    expect(cache$.resources['task:task-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources['step:step-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources['feed:tasks'].get()?.stale).toBe(true);
  });

  it('marks exact resources stale when a patch arrives before an entity', () => {
    applyCacheEvent({
      type: 'project.patch',
      projectId: 'missing-project',
      patch: { name: 'After' },
    });

    expect(cache$.resources.projects.get()?.stale).toBe(true);
    expect(cache$.resources['project:missing-project'].get()?.stale).toBe(true);
  });

  it('marks scoped list resources stale for task events', () => {
    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
    });

    expect(cache$.resources.tasks.get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-1'].get()?.stale).toBe(true);
  });

  it('applies task upsert events with normalized merge semantics and stales task lists', () => {
    const resourceKey = 'task:task-1';
    const task = createTask({ pendingMessage: 'Keep pending' });

    applyCacheEvent({ type: 'task.upsert', task });
    const versionAfterFirstUpsert = getResourceChangeVersion(resourceKey);

    applyCacheEvent({
      type: 'task.upsert',
      task: createTask({
        name: 'After',
        pendingMessage: undefined,
      } as Partial<Task>),
    });

    expect(cache$.tasks['task-1'].get()).toMatchObject({
      name: 'After',
      pendingMessage: 'Keep pending',
    });
    expect(getResourceChangeVersion(resourceKey)).toBeGreaterThan(
      versionAfterFirstUpsert,
    );
    expect(cache$.resources.tasks.get()?.stale).toBe(true);
    expect(cache$.resources['tasks:active'].get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-1'].get()?.stale).toBe(true);
  });

  it('stales old and new project task lists when a cached task upsert moves projects', () => {
    applyCacheEvent({
      type: 'task.upsert',
      task: createTask({ projectId: 'project-1' }),
    });

    applyCacheEvent({
      type: 'task.upsert',
      task: createTask({ projectId: 'project-2' }),
    });

    expect(cache$.tasks['task-1'].get()?.projectId).toBe('project-2');
    expect(cache$.resources.tasks.get()?.stale).toBe(true);
    expect(cache$.resources['tasks:active'].get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-1'].get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-2'].get()?.stale).toBe(true);
  });

  it('applies task patch events without replacing unrelated or undefined fields', () => {
    applyCacheEvent({
      type: 'task.upsert',
      task: createTask({ name: 'Before', pendingMessage: 'Keep pending' }),
    });

    applyCacheEvent({
      type: 'task.patch',
      taskId: 'task-1',
      projectId: 'project-1',
      patch: {
        name: 'After',
        pendingMessage: undefined,
      } as Partial<Task>,
    });

    expect(cache$.tasks['task-1'].get()).toMatchObject({
      name: 'After',
      prompt: 'Do work',
      pendingMessage: 'Keep pending',
    });
  });

  it('stales source and destination project task lists when an absent task patch moves projects', () => {
    applyCacheEvent({
      type: 'task.patch',
      taskId: 'task-1',
      projectId: 'project-1',
      patch: { projectId: 'project-2' },
    });

    expect(cache$.resources['task:task-1'].get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-1'].get()?.stale).toBe(true);
    expect(cache$.resources['tasks:project:project-2'].get()?.stale).toBe(true);
  });

  it('applies task delete events by removing the entity and index entries', () => {
    applyCacheEvent({ type: 'task.upsert', task: createTask() });
    cache$.indexes.tasks.ids.set(['task-1', 'task-2']);
    cache$.indexes['tasks:active'].ids.set(['task-1', 'task-2']);
    cache$.indexes['tasks:project:project-1'].ids.set(['task-1', 'task-2']);

    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
    });

    expect(cache$.tasks['task-1'].get()).toBeUndefined();
    expect(cache$.indexes.tasks.ids.get()).toEqual(['task-2']);
    expect(cache$.indexes['tasks:active'].ids.get()).toEqual(['task-2']);
    expect(cache$.indexes['tasks:project:project-1'].ids.get()).toEqual([
      'task-2',
    ]);
  });

  it('applies task delete events by removing cached child steps', () => {
    applyCacheEvent({ type: 'task.upsert', task: createTask() });
    applyCacheEvent({ type: 'step.upsert', step: createStep() });
    cache$.indexes['steps:task:task-1'].ids.set(['step-1']);

    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
      stepIds: ['step-1'],
    });

    expect(cache$.tasks['task-1'].get()).toBeUndefined();
    expect(cache$.steps['step-1'].get()).toBeUndefined();
    expect(cache$.indexes['steps:task:task-1'].ids.get()).toEqual([]);
    expect(cache$.resources['task:task-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources['step:step-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
  });

  it('settles deleted observed detail resources without initial loading', () => {
    applyCacheEvent({ type: 'task.upsert', task: createTask() });

    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
    });

    const meta = cache$.resources['task:task-1'].get();
    expect(meta).toMatchObject({ status: 'success', stale: false });
    expect(isResourceInitialLoading(true, meta)).toBe(false);
  });

  it('keeps deleted task detail resources settled after mutation cleanup', () => {
    applyCacheEvent({ type: 'task.upsert', task: createTask() });
    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
    });

    removeTask('task-1', { deleteResource: false });

    const meta = cache$.resources[taskResourceKey('task-1')].get();
    expect(meta).toMatchObject({ status: 'success', stale: false });
    expect(isResourceInitialLoading(true, meta)).toBe(false);
  });

  it('stales task step lists when a task delete event cascades steps', () => {
    applyCacheEvent({
      type: 'task.delete',
      taskId: 'task-1',
      projectId: 'project-1',
    });

    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
  });

  it('applies step upsert events by storing the entity and staling task step lists', () => {
    const step = createStep();

    applyCacheEvent({ type: 'step.upsert', step });

    expect(cache$.steps['step-1'].get()).toEqual(step);
    expect(cache$.resources.steps.get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
  });

  it('stales old and new task step lists when a cached step upsert moves tasks', () => {
    applyCacheEvent({
      type: 'step.upsert',
      step: createStep({ taskId: 'task-1' }),
    });

    applyCacheEvent({
      type: 'step.upsert',
      step: createStep({ taskId: 'task-2' }),
    });

    expect(cache$.steps['step-1'].get()?.taskId).toBe('task-2');
    expect(cache$.resources.steps.get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-2'].get()?.stale).toBe(true);
  });

  it('applies step patch events without replacing unrelated or undefined fields and marks detail changed', () => {
    const resourceKey = 'step:step-1';
    applyCacheEvent({
      type: 'step.upsert',
      step: createStep({ name: 'Before', output: 'Keep output' }),
    });
    const versionAfterUpsert = getResourceChangeVersion(resourceKey);

    applyCacheEvent({
      type: 'step.patch',
      stepId: 'step-1',
      taskId: 'task-1',
      patch: {
        name: 'After',
        output: undefined,
      } as Partial<TaskStep>,
    });

    expect(cache$.steps['step-1'].get()).toMatchObject({
      name: 'After',
      promptTemplate: 'Do step work',
      output: 'Keep output',
    });
    expect(getResourceChangeVersion(resourceKey)).toBeGreaterThan(
      versionAfterUpsert,
    );
  });

  it('stales source and destination task step lists when a step patch moves tasks', () => {
    applyCacheEvent({
      type: 'step.upsert',
      step: createStep({ taskId: 'task-1' }),
    });

    applyCacheEvent({
      type: 'step.patch',
      stepId: 'step-1',
      taskId: 'task-1',
      patch: { taskId: 'task-2' },
    });

    expect(cache$.steps['step-1'].get()?.taskId).toBe('task-2');
    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-2'].get()?.stale).toBe(true);
  });

  it('stales source and destination task step lists when an absent step patch moves tasks', () => {
    applyCacheEvent({
      type: 'step.patch',
      stepId: 'step-1',
      taskId: 'task-1',
      patch: { taskId: 'task-2' },
    });

    expect(cache$.resources['step:step-1'].get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-2'].get()?.stale).toBe(true);
  });

  it('applies step delete events by removing the entity and index entries', () => {
    applyCacheEvent({ type: 'step.upsert', step: createStep() });
    cache$.indexes['steps:task:task-1'].ids.set(['step-1', 'step-2']);

    applyCacheEvent({
      type: 'step.delete',
      stepId: 'step-1',
      taskId: 'task-1',
    });

    expect(cache$.steps['step-1'].get()).toBeUndefined();
    expect(cache$.indexes['steps:task:task-1'].ids.get()).toEqual(['step-2']);
    expect(cache$.resources['step:step-1'].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
    expect(cache$.resources.steps.get()?.stale).toBe(true);
    expect(cache$.resources['steps:task:task-1'].get()?.stale).toBe(true);
  });

  it('stores pull requests and marks repo/project resources stale by canonical identity', () => {
    applyCacheEvent({
      type: 'pullRequest.upsert',
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequest: {
        id: 42,
        title: 'Before',
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
      },
    });

    const canonicalKey = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: 42,
    });

    expect(cache$.pullRequests[canonicalKey].get()?.title).toBe('Before');
    expect(cache$.pullRequests['github:repo-1:42'].get()).toBeUndefined();
    expect(
      selectPullRequest({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      })?.title,
    ).toBe('Before');
    expect(cache$.resources.pullRequests.get()?.stale).toBe(true);
    expect(cache$.resources['feed:pullRequests'].get()?.stale).toBe(true);
    expect(
      cache$.resources[
        repoPullRequestsResourceKey({ providerId: 'github', repoId: 'repo-1' })
      ].get()?.stale,
    ).toBe(true);
    expect(
      cache$.resources[projectPullRequestsResourceKey('project-1')].get()
        ?.stale,
    ).toBe(true);
    for (const status of ['active', 'completed', 'abandoned', 'all'] as const) {
      expect(
        cache$.resources[
          repoPullRequestsResourceKey({
            providerId: 'github',
            repoId: 'repo-1',
            status,
          })
        ].get()?.stale,
      ).toBe(true);
      expect(
        cache$.resources[
          projectPullRequestsResourceKey('project-1', status)
        ].get()?.stale,
      ).toBe(true);
    }
    expect(cache$.resources['pullRequests:project-1'].get()).toBeUndefined();
  });

  it('marks status-specific pull request list resources stale for patch events', () => {
    applyCacheEvent({
      type: 'pullRequest.patch',
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequestId: 42,
      patch: { title: 'After' },
    });

    for (const status of ['active', 'completed', 'abandoned', 'all'] as const) {
      expect(
        cache$.resources[
          repoPullRequestsResourceKey({
            providerId: 'github',
            repoId: 'repo-1',
            status,
          })
        ].get()?.stale,
      ).toBe(true);
      expect(
        cache$.resources[
          projectPullRequestsResourceKey('project-1', status)
        ].get()?.stale,
      ).toBe(true);
    }
  });

  it('applies pull request events without downgrading fields and marks detail changed', () => {
    const resourceKey = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: 42,
    });

    applyCacheEvent({
      type: 'pullRequest.upsert',
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequest(),
    });

    const versionAfterUpsert = getResourceChangeVersion(resourceKey);

    applyCacheEvent({
      type: 'pullRequest.patch',
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: 42,
      patch: {
        title: 'After',
        description: undefined,
      } as Partial<AzureDevOpsPullRequestDetails>,
    });

    expect(cache$.pullRequests[resourceKey].get()).toMatchObject({
      title: 'After',
      description: 'Keep description',
    });
    expect(getResourceChangeVersion(resourceKey)).toBeGreaterThan(
      versionAfterUpsert,
    );
  });

  it('marks synthetic all-project pull request resources stale for PR events', () => {
    const allProjectsKey = allProjectsPullRequestsResourceKey({
      status: 'active',
      projects: [
        {
          id: 'project-1',
          name: 'Project 1',
          color: '#000000',
          repoProviderId: 'github',
          repoProjectId: 'org',
          repoId: 'repo-1',
        },
      ],
    });
    setDocumentResource(allProjectsKey, [], 123);

    applyCacheEvent({
      type: 'pullRequest.patch',
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequestId: 42,
      patch: { title: 'After' },
    });

    expect(cache$.resources[allProjectsKey].get()?.stale).toBe(true);
  });
});
