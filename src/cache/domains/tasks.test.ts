import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '@shared/types';

import { cache$, resetCache } from '../cache-store';
import type { CachedTask } from '../cache-types';

import {
  ACTIVE_TASKS_INDEX_KEY,
  appendTaskToProjectIndex,
  ingestActiveTasks,
  ingestProjectTasks,
  ingestTask,
  ingestTasks,
  patchTaskSnapshot,
  projectTasksResourceKey,
  removeTask,
  selectActiveTasks,
  selectProjectTasks,
  selectTask,
  selectTasks,
  selectTasksFromIndex,
  setProjectTaskIndexIds,
  taskResourceKey,
  TASKS_INDEX_KEY,
} from './tasks';

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

function createCachedTask(overrides: Partial<CachedTask> = {}): CachedTask {
  return {
    ...createTask(overrides),
    ...overrides,
  };
}

describe('task cache domain', () => {
  beforeEach(() => {
    resetCache();
  });

  it('builds task and project task resource keys', () => {
    expect(taskResourceKey('task-1')).toBe('task:task-1');
    expect(projectTasksResourceKey('project-1')).toBe(
      'tasks:project:project-1',
    );
  });

  it('ingests a task entity and marks its detail resource fresh', () => {
    const task = createTask();

    ingestTask(task);

    expect(selectTask(task.id)).toEqual(task);
    expect(cache$.resources[taskResourceKey(task.id)].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
  });

  it('ingests task lists while preserving API order', () => {
    const first = createTask({ id: 'task-1', name: 'First' });
    const second = createTask({ id: 'task-2', name: 'Second' });

    ingestTasks([second, first]);

    expect(cache$.indexes[TASKS_INDEX_KEY].ids.get()).toEqual([
      'task-2',
      'task-1',
    ]);
    expect(selectTasks().map((task) => task.name)).toEqual(['Second', 'First']);
  });

  it('ingests project task lists while preserving API order', () => {
    const active = createTask({
      id: 'task-1',
      name: 'Active',
      userCompleted: false,
    });
    const completed = createTask({
      id: 'task-2',
      name: 'Completed',
      userCompleted: true,
    });

    ingestProjectTasks('project-1', [active, completed]);

    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual(['task-1', 'task-2']);
    expect(selectProjectTasks('project-1').map((task) => task.name)).toEqual([
      'Active',
      'Completed',
    ]);
  });

  it('stores project fields from active task snapshots', () => {
    const task = createCachedTask({
      projectName: 'Jean-Claude',
      projectColor: '#ff00aa',
      projectPriority: 'high',
      projectLogoPath: '/logos/project.png',
    });

    ingestActiveTasks([task]);

    expect(selectActiveTasks()).toEqual([
      expect.objectContaining({
        projectName: 'Jean-Claude',
        projectColor: '#ff00aa',
        projectPriority: 'high',
        projectLogoPath: '/logos/project.png',
      }),
    ]);
  });

  it('preserves active task project fields when ingesting a later plain task', () => {
    const activeSnapshot = createCachedTask({
      id: 'task-1',
      name: 'Active snapshot',
      projectName: 'Jean-Claude',
      projectColor: '#ff00aa',
      projectPriority: 'high',
      projectLogoPath: '/logos/project.png',
    });

    ingestActiveTasks([activeSnapshot]);
    ingestTask(createTask({ id: 'task-1', name: 'Plain snapshot' }));

    expect(selectTask('task-1')).toMatchObject({
      name: 'Plain snapshot',
      projectName: 'Jean-Claude',
      projectColor: '#ff00aa',
      projectPriority: 'high',
      projectLogoPath: '/logos/project.png',
    });
  });

  it('appends tasks to an existing project index at the front without duplicates', () => {
    const first = createTask({ id: 'task-1', name: 'First' });
    const second = createTask({ id: 'task-2', name: 'Second' });

    ingestProjectTasks('project-1', [first]);
    ingestTask(second);
    appendTaskToProjectIndex(second);
    appendTaskToProjectIndex(second);

    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual(['task-2', 'task-1']);
    expect(selectProjectTasks('project-1').map((task) => task.name)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('removes a task entity and all task index entries', () => {
    const first = createTask({ id: 'task-1', projectId: 'project-1' });
    const second = createTask({ id: 'task-2', projectId: 'project-1' });
    const third = createTask({ id: 'task-3', projectId: 'project-2' });

    ingestTasks([first, second, third]);
    ingestActiveTasks([first, third]);
    ingestProjectTasks('project-1', [first, second]);
    ingestProjectTasks('project-2', [third, first]);

    removeTask('task-1');

    expect(selectTask('task-1')).toBeUndefined();
    expect(cache$.indexes[TASKS_INDEX_KEY].ids.get()).toEqual([
      'task-2',
      'task-3',
    ]);
    expect(cache$.indexes[ACTIVE_TASKS_INDEX_KEY].ids.get()).toEqual([
      'task-3',
    ]);
    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual(['task-2']);
    expect(
      cache$.indexes[projectTasksResourceKey('project-2')].ids.get(),
    ).toEqual(['task-3']);
  });

  it('removes deleted task detail resource metadata', () => {
    const task = createTask();
    ingestTask(task);

    removeTask(task.id);

    expect(cache$.resources[taskResourceKey(task.id)].get()).toBeUndefined();
  });

  it('patches task snapshots without clearing fields set to undefined', () => {
    const task = createTask({
      name: 'Keep me',
      branchName: 'keep-branch',
      pendingMessage: 'Keep pending',
    });
    ingestTask(task);

    const patched = patchTaskSnapshot(task.id, {
      name: 'Updated',
      branchName: undefined,
      pendingMessage: undefined,
    });

    expect(patched).toBe(true);
    expect(selectTask(task.id)).toMatchObject({
      name: 'Updated',
      branchName: 'keep-branch',
      pendingMessage: 'Keep pending',
    });
  });

  it('ignores patched task IDs and reconciles project and active indexes', () => {
    const task = createTask({ id: 'task-1', projectId: 'project-1' });
    const other = createTask({ id: 'task-2', projectId: 'project-2' });
    ingestTask(task);
    ingestTask(other);
    setProjectTaskIndexIds('project-1', [task.id]);
    setProjectTaskIndexIds('project-2', [other.id]);
    ingestActiveTasks([task, other]);

    const patched = patchTaskSnapshot(task.id, {
      id: 'corrupt-id',
      projectId: 'project-2',
      userCompleted: true,
    });

    expect(patched).toBe(true);
    expect(selectTask('task-1')).toMatchObject({
      id: 'task-1',
      projectId: 'project-2',
      userCompleted: true,
    });
    expect(selectTask('corrupt-id')).toBeUndefined();
    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual([]);
    expect(
      cache$.indexes[projectTasksResourceKey('project-2')].ids.get(),
    ).toEqual(['task-1', 'task-2']);
    expect(cache$.indexes[ACTIVE_TASKS_INDEX_KEY].ids.get()).toEqual([
      'task-2',
    ]);
  });

  it('reconciles project and active indexes when ingesting an updated task snapshot', () => {
    const task = createTask({ id: 'task-1', projectId: 'project-1' });
    const other = createTask({ id: 'task-2', projectId: 'project-2' });
    ingestTask(task);
    ingestTask(other);
    setProjectTaskIndexIds('project-1', [task.id]);
    setProjectTaskIndexIds('project-2', [other.id]);
    ingestActiveTasks([task, other]);

    ingestTask(
      createTask({
        id: 'task-1',
        projectId: 'project-2',
        userCompleted: true,
      }),
    );

    expect(selectTask('task-1')).toMatchObject({
      projectId: 'project-2',
      userCompleted: true,
    });
    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual([]);
    expect(
      cache$.indexes[projectTasksResourceKey('project-2')].ids.get(),
    ).toEqual(['task-1', 'task-2']);
    expect(cache$.indexes[ACTIVE_TASKS_INDEX_KEY].ids.get()).toEqual([
      'task-2',
    ]);
  });

  it('returns false when patching a missing task', () => {
    expect(patchTaskSnapshot('missing-task', { name: 'Nope' })).toBe(false);
  });

  it('copies project task index IDs from caller-owned arrays', () => {
    const ids = ['task-1'];

    setProjectTaskIndexIds('project-1', ids);
    ids.push('task-2');

    expect(
      cache$.indexes[projectTasksResourceKey('project-1')].ids.get(),
    ).toEqual(['task-1']);
  });

  it('selects active tasks and arbitrary task indexes', () => {
    const first = createTask({ id: 'task-1', name: 'First' });
    const second = createTask({ id: 'task-2', name: 'Second' });

    ingestActiveTasks([second, first]);
    setProjectTaskIndexIds('project-1', [first.id, second.id]);

    expect(selectActiveTasks().map((task) => task.name)).toEqual([
      'Second',
      'First',
    ]);
    expect(
      selectTasksFromIndex(projectTasksResourceKey('project-1')).map(
        (task) => task.name,
      ),
    ).toEqual(['First', 'Second']);
  });
});
