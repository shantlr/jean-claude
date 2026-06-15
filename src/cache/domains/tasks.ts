import type { Task } from '@shared/types';

import {
  markResourceStale,
  setIndexResource,
  setResourceSuccess,
} from '../cache-actions';
import { cache$ } from '../cache-store';
import type { CachedTask } from '../cache-types';
import { applyEntityPatch, mergeEntitySnapshot } from '../entity-merge';

export const TASKS_INDEX_KEY = 'tasks';
export const ACTIVE_TASKS_INDEX_KEY = 'tasks:active';

export function taskResourceKey(taskId: string) {
  return `task:${taskId}`;
}

export function projectTasksResourceKey(projectId: string) {
  return `tasks:project:${projectId}`;
}

export function mergeTaskSnapshot(task: CachedTask) {
  const current = cache$.tasks[task.id].get();
  const next = mergeEntitySnapshot(current ?? ({} as CachedTask), task);
  cache$.tasks[task.id].set(next);

  if (current) {
    reconcileTaskIndexMembership(current, next);
  }
}

export function patchTaskSnapshot(taskId: string, patch: Partial<Task>) {
  const current = cache$.tasks[taskId].get();
  if (!current) {
    return false;
  }

  const patchWithoutId = { ...patch };
  delete patchWithoutId.id;

  const next = applyEntityPatch(current, patchWithoutId);
  cache$.tasks[taskId].set(next);

  reconcileTaskIndexMembership(current, next);

  if (
    patchWithoutId.projectId !== undefined ||
    patchWithoutId.status !== undefined ||
    patchWithoutId.userCompleted !== undefined ||
    patchWithoutId.parentTaskId !== undefined
  ) {
    markTaskListsStale(current.projectId);
    if (next.projectId !== current.projectId) {
      markTaskListsStale(next.projectId);
    }
  }

  return true;
}

export function ingestTask(task: Task) {
  mergeTaskSnapshot(task);
  setResourceSuccess(taskResourceKey(task.id));
}

export function ingestTasks(tasks: Task[]) {
  for (const task of tasks) {
    mergeTaskSnapshot(task);
  }

  setIndexResource(
    TASKS_INDEX_KEY,
    tasks.map((task) => task.id),
  );
}

export function ingestProjectTasks(projectId: string, tasks: Task[]) {
  for (const task of tasks) {
    mergeTaskSnapshot(task);
  }

  setIndexResource(
    projectTasksResourceKey(projectId),
    tasks.map((task) => task.id),
  );
}

export function ingestActiveTasks(tasks: CachedTask[]) {
  for (const task of tasks) {
    mergeTaskSnapshot(task);
  }

  setIndexResource(
    ACTIVE_TASKS_INDEX_KEY,
    tasks.map((task) => task.id),
  );
}

export function appendTaskToProjectIndex(task: Task) {
  const key = projectTasksResourceKey(task.projectId);
  prependIdToIndexIfPresent(key, task.id);
}

export function appendTaskToKnownIndexes(task: Task) {
  prependIdToIndexIfPresent(TASKS_INDEX_KEY, task.id);
  appendTaskToProjectIndex(task);

  if (isActiveTask(task)) {
    prependIdToIndexIfPresent(ACTIVE_TASKS_INDEX_KEY, task.id);
  }
}

export function setProjectTaskIndexIds(projectId: string, ids: string[]) {
  setIndexResource(projectTasksResourceKey(projectId), [...ids]);
}

export function removeTask(
  taskId: string,
  { deleteResource = true }: { deleteResource?: boolean } = {},
) {
  cache$.tasks[taskId].delete();

  if (deleteResource) {
    cache$.resources[taskResourceKey(taskId)].delete();
  }

  for (const key of Object.keys(cache$.indexes.get())) {
    if (
      key === TASKS_INDEX_KEY ||
      key === ACTIVE_TASKS_INDEX_KEY ||
      key.startsWith('tasks:project:')
    ) {
      removeIdFromIndex(key, taskId);
    }
  }
}

export function markTaskListsStale(projectId?: string) {
  markResourceStale(TASKS_INDEX_KEY);
  markResourceStale(ACTIVE_TASKS_INDEX_KEY);

  if (projectId) {
    markResourceStale(projectTasksResourceKey(projectId));
  }
}

export function selectTask(taskId: string) {
  return cache$.tasks[taskId].get();
}

export function selectTasksFromIndex(indexKey: string) {
  const ids = cache$.indexes[indexKey].ids.get() ?? [];
  return ids.flatMap((id) => {
    const task = cache$.tasks[id].get();
    return task ? [task] : [];
  });
}

export function selectTasks() {
  return selectTasksFromIndex(TASKS_INDEX_KEY);
}

export function selectProjectTasks(projectId: string) {
  return selectTasksFromIndex(projectTasksResourceKey(projectId));
}

export function selectActiveTasks() {
  return selectTasksFromIndex(ACTIVE_TASKS_INDEX_KEY);
}

function isActiveTask(task: CachedTask) {
  return !task.userCompleted && task.parentTaskId === null;
}

function reconcileTaskIndexMembership(current: CachedTask, next: CachedTask) {
  if (next.projectId !== current.projectId) {
    removeIdFromIndex(projectTasksResourceKey(current.projectId), next.id);
    prependIdToIndexIfPresent(projectTasksResourceKey(next.projectId), next.id);
  }

  if (isActiveTask(current) !== isActiveTask(next)) {
    if (isActiveTask(next)) {
      prependIdToIndexIfPresent(ACTIVE_TASKS_INDEX_KEY, next.id);
    } else {
      removeIdFromIndex(ACTIVE_TASKS_INDEX_KEY, next.id);
    }
  }
}

function prependIdToIndexIfPresent(indexKey: string, id: string) {
  const ids = cache$.indexes[indexKey].ids.get();
  if (!ids || ids.includes(id)) {
    return;
  }

  cache$.indexes[indexKey].ids.set([id, ...ids]);
}

function removeIdFromIndex(indexKey: string, id: string) {
  const ids = cache$.indexes[indexKey].ids.get();
  if (ids) {
    cache$.indexes[indexKey].ids.set(
      ids.filter((existingId) => existingId !== id),
    );
  }
}
