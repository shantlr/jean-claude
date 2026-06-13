import { beforeAll, describe, expect, it } from 'vitest';

import type { TaskStep } from '@shared/types';

let buildStepGraphLayout: typeof import('@/features/task/ui-step-flow-bar').buildStepGraphLayout;

beforeAll(async () => {
  globalThis.window = {} as Window & typeof globalThis;
  buildStepGraphLayout = (await import('@/features/task/ui-step-flow-bar'))
    .buildStepGraphLayout;
});

function makeStep({
  id,
  dependsOn = [],
  createdAt,
  sortOrder = Number(id.replace('step-', '')),
}: {
  id: string;
  dependsOn?: string[];
  createdAt: string;
  sortOrder?: number;
}): TaskStep {
  return {
    id,
    taskId: 'task-1',
    name: id,
    type: 'agent',
    dependsOn,
    promptTemplate: '',
    resolvedPrompt: null,
    status: 'completed',
    sessionId: null,
    interactionMode: null,
    modelPreference: null,
    thinkingEffort: null,
    agentBackend: null,
    output: null,
    images: null,
    meta: {},
    autoStart: false,
    sortOrder,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('buildStepGraphLayout', () => {
  it('keeps consecutive dependent steps on same lane', () => {
    const layout = buildStepGraphLayout([
      makeStep({ id: 'step-1', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeStep({
        id: 'step-2',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:01:00.000Z',
      }),
      makeStep({
        id: 'step-3',
        dependsOn: ['step-2'],
        createdAt: '2026-01-01T00:02:00.000Z',
      }),
    ]);

    expect(layout.positions.get('step-2')?.y).toBe(
      layout.positions.get('step-1')?.y,
    );
    expect(layout.positions.get('step-3')?.y).toBe(
      layout.positions.get('step-2')?.y,
    );
  });

  it('moves non-consecutive dependent steps onto branch lanes', () => {
    const layout = buildStepGraphLayout([
      makeStep({ id: 'step-1', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeStep({
        id: 'step-2',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:01:00.000Z',
      }),
      makeStep({
        id: 'step-3',
        dependsOn: ['step-2'],
        createdAt: '2026-01-01T00:02:00.000Z',
      }),
      makeStep({
        id: 'step-4',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:03:00.000Z',
      }),
    ]);

    expect(layout.positions.get('step-4')?.y).toBeGreaterThan(
      layout.positions.get('step-1')?.y ?? 0,
    );
  });

  it('reuses dependency lane when skipped lane is clear', () => {
    const layout = buildStepGraphLayout([
      makeStep({ id: 'step-1', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeStep({
        id: 'step-2',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:01:00.000Z',
      }),
      makeStep({
        id: 'step-3',
        dependsOn: ['step-2'],
        createdAt: '2026-01-01T00:02:00.000Z',
      }),
      makeStep({
        id: 'step-4',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:03:00.000Z',
      }),
      makeStep({
        id: 'step-5',
        dependsOn: ['step-3'],
        createdAt: '2026-01-01T00:04:00.000Z',
      }),
    ]);

    expect(layout.positions.get('step-5')?.y).toBe(
      layout.positions.get('step-3')?.y,
    );
  });

  it('moves late-added parallel steps below occupied main lane', () => {
    const layout = buildStepGraphLayout([
      makeStep({
        id: 'step-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      makeStep({
        id: 'step-2',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:03:00.000Z',
      }),
      makeStep({
        id: 'step-3',
        dependsOn: ['step-1'],
        createdAt: '2026-01-01T00:01:00.000Z',
      }),
      makeStep({
        id: 'step-4',
        dependsOn: ['step-3'],
        createdAt: '2026-01-01T00:02:00.000Z',
      }),
    ]);

    expect(layout.positions.get('step-2')?.y).toBeGreaterThan(
      layout.positions.get('step-3')?.y ?? 0,
    );
  });

  it('infers branch lane for old inserted steps without dependencies', () => {
    const layout = buildStepGraphLayout([
      makeStep({
        id: 'step-1',
        sortOrder: 0,
        createdAt: '2026-06-11 18:36:11',
      }),
      makeStep({
        id: 'step-2',
        sortOrder: 1,
        createdAt: '2026-06-12 21:37:15',
      }),
      makeStep({
        id: 'step-3',
        sortOrder: 2,
        createdAt: '2026-06-12 17:54:10',
      }),
      makeStep({
        id: 'step-4',
        sortOrder: 3,
        createdAt: '2026-06-12 21:00:58',
      }),
    ]);

    expect(layout.positions.get('step-2')?.y).toBeGreaterThan(
      layout.positions.get('step-3')?.y ?? 0,
    );
  });
});
