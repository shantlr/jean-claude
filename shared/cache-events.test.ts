import { describe, expect, it } from 'vitest';

import {
  getCacheEventResourceKeys,
  matchesCacheSubscription,
} from './cache-events';

describe('cache event resources', () => {
  it('maps project events to list and entity resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'project.patch',
        projectId: 'project-1',
        patch: { name: 'Updated' },
      }),
    ).toEqual(['projects', 'project:project-1']);
  });

  it('maps project delete events to cascaded task and step resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'project.delete',
        projectId: 'project-1',
        taskIds: ['task-1'],
        stepIds: ['step-1'],
      }),
    ).toEqual([
      'projects',
      'project:project-1',
      'tasks',
      'tasks:active',
      'tasks:project:project-1',
      'steps',
      'feed:tasks',
      'task:task-1',
      'steps:task:task-1',
      'step:step-1',
    ]);
  });

  it('maps step events to task-scoped resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'step.patch',
        stepId: 'step-1',
        taskId: 'task-1',
        patch: { status: 'running' },
      }),
    ).toEqual(['steps', 'step:step-1', 'feed:tasks', 'steps:task:task-1']);

    expect(
      getCacheEventResourceKeys({
        type: 'step.delete',
        stepId: 'step-1',
        taskId: 'task-1',
      }),
    ).toEqual(['steps', 'step:step-1', 'feed:tasks', 'steps:task:task-1']);
  });

  it('maps step patch moves to source and destination task-scoped resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'step.patch',
        stepId: 'step-1',
        taskId: 'task-1',
        patch: { taskId: 'task-2' },
      }),
    ).toEqual([
      'steps',
      'step:step-1',
      'feed:tasks',
      'steps:task:task-1',
      'steps:task:task-2',
    ]);
  });

  it('maps step upsert moves to source and destination task-scoped resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'step.upsert',
        previousTaskId: 'task-1',
        step: {
          id: 'step-1',
          taskId: 'task-2',
          name: 'Step 1',
          type: 'agent',
          dependsOn: [],
          promptTemplate: 'Do work',
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
        },
      }),
    ).toEqual([
      'steps',
      'step:step-1',
      'feed:tasks',
      'steps:task:task-1',
      'steps:task:task-2',
    ]);
  });

  it('maps task events to active and project-scoped resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'tasks:project:project-1',
      'feed:tasks',
      'steps',
      'steps:task:task-1',
    ]);
  });

  it('maps task upsert events to active task resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.upsert',
        task: {
          id: 'task-1',
          projectId: 'project-1',
          type: 'agent',
          name: 'Task 1',
          prompt: 'Do work',
          status: 'running',
          worktreePath: null,
          startCommitHash: null,
          sourceBranch: null,
          branchName: null,
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
        },
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'feed:tasks',
      'tasks:project:project-1',
    ]);
  });

  it('maps task upsert moves to active, source, and destination project resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.upsert',
        previousProjectId: 'project-1',
        task: {
          id: 'task-1',
          projectId: 'project-2',
          type: 'agent',
          name: 'Task 1',
          prompt: 'Do work',
          status: 'running',
          worktreePath: null,
          startCommitHash: null,
          sourceBranch: null,
          branchName: null,
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
        },
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'feed:tasks',
      'tasks:project:project-1',
      'tasks:project:project-2',
    ]);
  });

  it('maps task delete events to global and task-scoped step resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'tasks:project:project-1',
      'feed:tasks',
      'steps',
      'steps:task:task-1',
    ]);
  });

  it('maps task delete events to deleted child step detail resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.delete',
        taskId: 'task-1',
        projectId: 'project-1',
        stepIds: ['step-1'],
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'tasks:project:project-1',
      'feed:tasks',
      'steps',
      'steps:task:task-1',
      'step:step-1',
    ]);
  });

  it('maps task patch moves to source and destination project-scoped resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'task.patch',
        taskId: 'task-1',
        projectId: 'project-1',
        patch: { projectId: 'project-2' },
      }),
    ).toEqual([
      'tasks',
      'tasks:active',
      'task:task-1',
      'feed:tasks',
      'tasks:project:project-1',
      'tasks:project:project-2',
    ]);
  });

  it('maps feed events to feed source resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'feed.sourceChanged',
        source: 'pullRequests',
      }),
    ).toEqual(['feed', 'feed:pullRequests']);
  });

  it('maps pull request events to repo identity and optional project relation resources', () => {
    const resourceKeys = getCacheEventResourceKeys({
      type: 'pullRequest.patch',
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequestId: 42,
      patch: { title: 'Updated' },
    });

    expect(resourceKeys).toEqual([
      'feed:pullRequests',
      'pullRequests',
      'pullRequests:repo:github:repo-1',
      'pullRequests:repo:github:repo-1:status:active',
      'pullRequests:repo:github:repo-1:status:completed',
      'pullRequests:repo:github:repo-1:status:abandoned',
      'pullRequests:repo:github:repo-1:status:all',
      'pullRequests:project:project-1',
      'pullRequests:project:project-1:status:active',
      'pullRequests:project:project-1:status:completed',
      'pullRequests:project:project-1:status:abandoned',
      'pullRequests:project:project-1:status:all',
      'pullRequest:github:repo-1:42',
    ]);
  });

  it('omits project status resources for pull request events without a project', () => {
    const resourceKeys = getCacheEventResourceKeys({
      type: 'pullRequest.upsert',
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: {
        id: 42,
        title: 'Title',
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

    expect(resourceKeys).toEqual([
      'feed:pullRequests',
      'pullRequests',
      'pullRequests:repo:github:repo-1',
      'pullRequests:repo:github:repo-1:status:active',
      'pullRequests:repo:github:repo-1:status:completed',
      'pullRequests:repo:github:repo-1:status:abandoned',
      'pullRequests:repo:github:repo-1:status:all',
      'pullRequest:github:repo-1:42',
    ]);
    expect(resourceKeys).not.toContain('pullRequests:project:project-1');
  });

  it('maps pull request upsert events to optional local project resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'pullRequest.upsert',
        providerId: 'github',
        repoId: 'repo-1',
        projectId: 'project-1',
        pullRequest: {
          id: 42,
          title: 'Title',
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
      }),
    ).toContain('pullRequests:project:project-1:status:active');
  });

  it('maps pull request changes to the pull request feed resource', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'pullRequest.patch',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
        patch: { title: 'Updated' },
      }),
    ).toContain('feed:pullRequests');
  });

  it('matches pull request events to exact status-specific subscriptions', () => {
    const resourceKeys = getCacheEventResourceKeys({
      type: 'pullRequest.patch',
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequestId: 42,
      patch: { title: 'Updated' },
    });

    expect(
      resourceKeys.some((resourceKey) =>
        matchesCacheSubscription(
          { resourceKey: 'pullRequests:repo:github:repo-1:status:active' },
          resourceKey,
        ),
      ),
    ).toBe(true);
    expect(
      resourceKeys.some((resourceKey) =>
        matchesCacheSubscription(
          { resourceKey: 'pullRequests:project:project-1:status:completed' },
          resourceKey,
        ),
      ),
    ).toBe(true);
  });

  it('maps pull request thread events to repo-scoped thread resources', () => {
    expect(
      getCacheEventResourceKeys({
        type: 'pullRequest.threadsChanged',
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toEqual([
      'feed:pullRequests',
      'pullRequest:github:repo-1:42',
      'pullRequestThreads:github:repo-1:42',
    ]);
  });

  it('matches exact and child subscriptions', () => {
    expect(
      matchesCacheSubscription(
        { resourceKey: 'pullRequests', includeChildren: true },
        'pullRequests:repo:github:repo-1',
      ),
    ).toBe(true);
    expect(
      matchesCacheSubscription(
        { resourceKey: 'pullRequests' },
        'pullRequests:repo:github:repo-1',
      ),
    ).toBe(false);
    expect(
      matchesCacheSubscription(
        { resourceKey: 'pullRequest:github:repo-1:42', includeChildren: true },
        'pullRequestThreads:github:repo-1:42',
      ),
    ).toBe(false);
  });
});
