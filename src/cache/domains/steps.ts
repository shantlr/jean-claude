import type { TaskStep } from '@shared/types';

import {
  markResourceStale,
  setIndexResource,
  setResourceSuccess,
} from '../cache-actions';
import { cache$ } from '../cache-store';
import { applyEntityPatch, mergeEntitySnapshot } from '../entity-merge';

export const STEPS_INDEX_KEY = 'steps';

export function stepResourceKey(stepId: string) {
  return `step:${stepId}`;
}

export function taskStepsResourceKey(taskId: string) {
  return `steps:task:${taskId}`;
}

export function mergeStepSnapshot(step: TaskStep) {
  const current = cache$.steps[step.id].get();
  const next = mergeEntitySnapshot(current ?? ({} as TaskStep), step);
  cache$.steps[step.id].set(next);

  if (current) {
    reconcileStepIndexMembership(current, next);
  }
}

export function patchStepSnapshot(stepId: string, patch: Partial<TaskStep>) {
  const current = cache$.steps[stepId].get();
  if (!current) {
    return false;
  }

  const patchWithoutId = { ...patch };
  delete patchWithoutId.id;

  const next = applyEntityPatch(current, patchWithoutId);
  cache$.steps[stepId].set(next);

  reconcileStepIndexMembership(current, next);

  return true;
}

export function ingestStep(step: TaskStep) {
  mergeStepSnapshot(step);
  setResourceSuccess(stepResourceKey(step.id));
}

export function ingestTaskSteps(taskId: string, steps: TaskStep[]) {
  for (const step of steps) {
    mergeStepSnapshot(step);
  }

  setIndexResource(
    taskStepsResourceKey(taskId),
    steps.map((step) => step.id),
  );
}

export function insertStepInTaskIndex(step: TaskStep) {
  const key = taskStepsResourceKey(step.taskId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids || ids.includes(step.id)) {
    return;
  }

  mergeStepSnapshot(step);
  insertStepIdInTaskIndex(step);
}

export function ensureStepInTaskIndex(step: TaskStep) {
  const key = taskStepsResourceKey(step.taskId);
  const ids = cache$.indexes[key].ids.get();
  if (ids) {
    insertStepInTaskIndex(step);
    return;
  }

  mergeStepSnapshot(step);
  markStepListsStale(step.taskId);
}

export function setTaskStepIndexIds(taskId: string, ids: string[]) {
  setIndexResource(taskStepsResourceKey(taskId), [...ids]);
}

export function removeStep(
  stepId: string,
  { deleteResource = true }: { deleteResource?: boolean } = {},
) {
  cache$.steps[stepId].delete();

  if (deleteResource) {
    cache$.resources[stepResourceKey(stepId)].delete();
  }

  for (const key of Object.keys(cache$.indexes.get())) {
    if (key.startsWith('steps:task:')) {
      removeIdFromIndex(key, stepId);
    }
  }
}

export function markStepListsStale(taskId?: string) {
  markResourceStale(STEPS_INDEX_KEY);

  if (taskId) {
    markResourceStale(taskStepsResourceKey(taskId));
  }
}

export function selectStep(stepId: string) {
  return cache$.steps[stepId].get();
}

export function selectTaskSteps(taskId: string) {
  const ids = cache$.indexes[taskStepsResourceKey(taskId)].ids.get() ?? [];
  return ids.flatMap((id) => {
    const step = cache$.steps[id].get();
    return step ? [step] : [];
  });
}

function removeIdFromIndex(indexKey: string, id: string) {
  const ids = cache$.indexes[indexKey].ids.get();
  if (ids) {
    cache$.indexes[indexKey].ids.set(
      ids.filter((existingId) => existingId !== id),
    );
  }
}

function removeStepFromTaskIndex(taskId: string, stepId: string) {
  const key = taskStepsResourceKey(taskId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids) {
    return;
  }

  setTaskIndexOrder(
    key,
    ids.filter((id) => id !== stepId),
  );
}

function reconcileStepIndexMembership(current: TaskStep, next: TaskStep) {
  if (next.taskId !== current.taskId) {
    removeStepFromTaskIndex(current.taskId, next.id);
    insertStepIdInTaskIndex(next);
  } else if (next.sortOrder !== current.sortOrder) {
    repositionStepInTaskIndex(next);
  }
}

function insertStepIdInTaskIndex(step: TaskStep) {
  const key = taskStepsResourceKey(step.taskId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids || ids.includes(step.id)) {
    return;
  }

  const insertAt = clampSortOrder(step.sortOrder, ids.length);
  setTaskIndexOrder(key, [
    ...ids.slice(0, insertAt),
    step.id,
    ...ids.slice(insertAt),
  ]);
}

function repositionStepInTaskIndex(step: TaskStep) {
  const key = taskStepsResourceKey(step.taskId);
  const ids = cache$.indexes[key].ids.get();
  if (!ids?.includes(step.id)) {
    return;
  }

  const idsWithoutStep = ids.filter((id) => id !== step.id);
  const insertAt = clampSortOrder(step.sortOrder, idsWithoutStep.length);
  setTaskIndexOrder(key, [
    ...idsWithoutStep.slice(0, insertAt),
    step.id,
    ...idsWithoutStep.slice(insertAt),
  ]);
}

function setTaskIndexOrder(indexKey: string, ids: string[]) {
  cache$.indexes[indexKey].ids.set(ids);

  ids.forEach((id, sortOrder) => {
    const step = cache$.steps[id].get();
    if (step) {
      cache$.steps[id].set({ ...step, sortOrder });
    }
  });
}

function clampSortOrder(sortOrder: number, max: number) {
  return Math.max(0, Math.min(sortOrder, max));
}
