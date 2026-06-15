import { beforeEach, describe, expect, it } from 'vitest';

import type { TaskStep } from '@shared/types';

import { setResourceSuccess } from '../cache-actions';
import { cache$, resetCache } from '../cache-store';

import {
  ensureStepInTaskIndex,
  ingestStep,
  ingestTaskSteps,
  insertStepInTaskIndex,
  patchStepSnapshot,
  removeStep,
  selectStep,
  selectTaskSteps,
  setTaskStepIndexIds,
  stepResourceKey,
  taskStepsResourceKey,
} from './steps';

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

describe('step cache domain', () => {
  beforeEach(() => {
    resetCache();
  });

  it('builds step and task step resource keys', () => {
    expect(stepResourceKey('step-1')).toBe('step:step-1');
    expect(taskStepsResourceKey('task-1')).toBe('steps:task:task-1');
  });

  it('ingests a step entity and marks its detail resource fresh', () => {
    const step = createStep();

    ingestStep(step);

    expect(selectStep(step.id)).toEqual(step);
    expect(cache$.resources[stepResourceKey(step.id)].get()).toMatchObject({
      status: 'success',
      stale: false,
    });
  });

  it('ingests task step lists while preserving API order', () => {
    const first = createStep({ id: 'step-1', name: 'First', sortOrder: 0 });
    const second = createStep({ id: 'step-2', name: 'Second', sortOrder: 1 });

    ingestTaskSteps('task-1', [second, first]);

    expect(cache$.indexes[taskStepsResourceKey('task-1')].ids.get()).toEqual([
      'step-2',
      'step-1',
    ]);
    expect(selectTaskSteps('task-1').map((step) => step.name)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('inserts steps into an existing task index by sort order without duplicates', () => {
    const first = createStep({ id: 'step-1', name: 'First', sortOrder: 0 });
    const third = createStep({ id: 'step-3', name: 'Third', sortOrder: 1 });
    const second = createStep({ id: 'step-2', name: 'Second', sortOrder: 1 });
    const last = createStep({ id: 'step-4', name: 'Last', sortOrder: 99 });
    const missingIndex = createStep({
      id: 'step-5',
      taskId: 'task-missing',
      sortOrder: 0,
    });

    ingestTaskSteps('task-1', [first, third]);
    insertStepInTaskIndex(second);
    insertStepInTaskIndex(last);
    insertStepInTaskIndex(second);
    insertStepInTaskIndex(missingIndex);

    expect(cache$.indexes[taskStepsResourceKey('task-1')].ids.get()).toEqual([
      'step-1',
      'step-2',
      'step-3',
      'step-4',
    ]);
    expect(selectTaskSteps('task-1').map((step) => step.name)).toEqual([
      'First',
      'Second',
      'Third',
      'Last',
    ]);
    expect(selectStep('step-2')).toMatchObject({
      name: 'Second',
      sortOrder: 1,
    });
    expect(selectTaskSteps('task-1').map((step) => step.sortOrder)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(
      cache$.indexes[taskStepsResourceKey('task-missing')].ids.get(),
    ).toBeUndefined();
  });

  it('keeps an absent task index unloaded when ensuring a created step', () => {
    const step = createStep({ id: 'step-created', sortOrder: 0 });

    ensureStepInTaskIndex(step);
    ensureStepInTaskIndex(step);

    expect(selectStep(step.id)).toEqual(step);
    expect(
      cache$.indexes[taskStepsResourceKey('task-1')].ids.get(),
    ).toBeUndefined();
    expect(
      cache$.resources[taskStepsResourceKey('task-1')].get(),
    ).toMatchObject({
      status: 'idle',
      stale: true,
    });
  });

  it('clamps negative sort order to the start when inserting a step', () => {
    const first = createStep({ id: 'step-1', name: 'First', sortOrder: 0 });
    const second = createStep({ id: 'step-2', name: 'Second', sortOrder: 1 });
    const inserted = createStep({
      id: 'step-3',
      name: 'Inserted',
      sortOrder: -1,
    });

    ingestTaskSteps('task-1', [first, second]);
    insertStepInTaskIndex(inserted);

    expect(selectTaskSteps('task-1').map((step) => step.name)).toEqual([
      'Inserted',
      'First',
      'Second',
    ]);
    expect(selectTaskSteps('task-1').map((step) => step.sortOrder)).toEqual([
      0, 1, 2,
    ]);
  });

  it('patches step snapshots without clearing undefined fields or changing identity', () => {
    const step = createStep({
      name: 'Keep me',
      promptTemplate: 'Keep prompt',
      output: 'Keep output',
    });
    ingestStep(step);

    const patched = patchStepSnapshot(step.id, {
      id: 'corrupt-id',
      name: 'Updated',
      promptTemplate: undefined,
      output: undefined,
    });

    expect(patched).toBe(true);
    expect(selectStep(step.id)).toMatchObject({
      id: 'step-1',
      name: 'Updated',
      promptTemplate: 'Keep prompt',
      output: 'Keep output',
    });
    expect(selectStep('corrupt-id')).toBeUndefined();
  });

  it('returns false when patching a missing step', () => {
    expect(patchStepSnapshot('missing-step', { name: 'Nope' })).toBe(false);
  });

  it('repositions task step indexes when patching sort order', () => {
    const first = createStep({ id: 'step-1', name: 'First', sortOrder: 0 });
    const second = createStep({ id: 'step-2', name: 'Second', sortOrder: 1 });
    const third = createStep({ id: 'step-3', name: 'Third', sortOrder: 2 });
    ingestTaskSteps('task-1', [first, second, third]);

    const patched = patchStepSnapshot('step-3', { sortOrder: 0 });

    expect(patched).toBe(true);
    expect(selectTaskSteps('task-1').map((step) => step.name)).toEqual([
      'Third',
      'First',
      'Second',
    ]);
    expect(selectTaskSteps('task-1').map((step) => step.sortOrder)).toEqual([
      0, 1, 2,
    ]);
  });

  it('moves task step index membership when patching task ID', () => {
    const first = createStep({ id: 'step-1', taskId: 'task-1', sortOrder: 0 });
    const second = createStep({ id: 'step-2', taskId: 'task-1', sortOrder: 1 });
    const third = createStep({ id: 'step-3', taskId: 'task-2', sortOrder: 0 });
    ingestTaskSteps('task-1', [first, second]);
    ingestTaskSteps('task-2', [third]);

    const patched = patchStepSnapshot('step-2', {
      taskId: 'task-2',
      sortOrder: 0,
    });

    expect(patched).toBe(true);
    expect(selectTaskSteps('task-1').map((step) => step.id)).toEqual([
      'step-1',
    ]);
    expect(selectTaskSteps('task-2').map((step) => step.id)).toEqual([
      'step-2',
      'step-3',
    ]);
    expect(selectTaskSteps('task-2').map((step) => step.sortOrder)).toEqual([
      0, 1,
    ]);
    expect(selectStep('step-2')).toMatchObject({
      taskId: 'task-2',
      sortOrder: 0,
    });
  });

  it('reconciles task step indexes when ingesting an updated step snapshot', () => {
    const first = createStep({ id: 'step-1', taskId: 'task-1', sortOrder: 0 });
    const second = createStep({ id: 'step-2', taskId: 'task-1', sortOrder: 1 });
    const third = createStep({ id: 'step-3', taskId: 'task-2', sortOrder: 0 });
    ingestTaskSteps('task-1', [first, second]);
    ingestTaskSteps('task-2', [third]);

    ingestStep(
      createStep({
        id: 'step-2',
        taskId: 'task-2',
        sortOrder: 0,
      }),
    );

    expect(selectTaskSteps('task-1').map((step) => step.id)).toEqual([
      'step-1',
    ]);
    expect(selectTaskSteps('task-2').map((step) => step.id)).toEqual([
      'step-2',
      'step-3',
    ]);
    expect(selectTaskSteps('task-2').map((step) => step.sortOrder)).toEqual([
      0, 1,
    ]);
    expect(selectStep('step-2')).toMatchObject({
      taskId: 'task-2',
      sortOrder: 0,
    });
  });

  it('removes a step entity, list entries, and stale detail metadata', () => {
    const first = createStep({ id: 'step-1', taskId: 'task-1' });
    const second = createStep({ id: 'step-2', taskId: 'task-1' });
    const third = createStep({ id: 'step-3', taskId: 'task-2' });

    ingestTaskSteps('task-1', [first, second]);
    ingestTaskSteps('task-2', [third, first]);
    setResourceSuccess(stepResourceKey(first.id));

    removeStep(first.id);

    expect(selectStep(first.id)).toBeUndefined();
    expect(cache$.indexes[taskStepsResourceKey('task-1')].ids.get()).toEqual([
      'step-2',
    ]);
    expect(cache$.indexes[taskStepsResourceKey('task-2')].ids.get()).toEqual([
      'step-3',
    ]);
    expect(cache$.resources[stepResourceKey(first.id)].get()).toBeUndefined();
  });

  it('copies task step index IDs from caller-owned arrays', () => {
    const ids = ['step-1'];

    setTaskStepIndexIds('task-1', ids);
    ids.push('step-2');

    expect(cache$.indexes[taskStepsResourceKey('task-1')].ids.get()).toEqual([
      'step-1',
    ]);
  });
});
