import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentResourceMonitorService } from './agent-resource-monitor-service';

describe('AgentResourceMonitorService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks peaks and averages per step', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const samples = [
      { pids: [10], cpuPercent: 2, rssBytes: 100 },
      { pids: [10, 11], cpuPercent: 6, rssBytes: 300 },
    ];
    const onSnapshot = vi.fn();
    const service = new AgentResourceMonitorService({
      intervalMs: 5,
      sampler: async () => samples.shift() ?? samples.at(-1)!,
    });
    service.setSnapshotListener(onSnapshot);

    service.start({
      taskId: 'task-1',
      stepId: 'step-1',
      backend: 'opencode',
      rootPid: 10,
    });
    await vi.advanceTimersByTimeAsync(5);

    vi.setSystemTime(1_020);
    const summary = await service.stop('step-1');

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(summary?.sampleCount).toBe(2);
    expect(summary?.peakCpuPercent).toBe(6);
    expect(summary?.peakRssBytes).toBe(300);
    expect(summary?.avgCpuPercent).toBe(4);
    expect(summary?.avgRssBytes).toBe(200);
  });

  it('keeps bounded history for sessions even without snapshot listeners', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const service = new AgentResourceMonitorService({
      intervalMs: 5,
      historyWindowMs: 15,
      sampler: async () => ({ pids: [10], cpuPercent: 2, rssBytes: 100 }),
    });

    service.start({
      taskId: 'task-1',
      stepId: 'step-1',
      backend: 'opencode',
      rootPid: 10,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(service.getHistory()['step-1']).toHaveLength(3);

    vi.setSystemTime(1_030);
    expect(service.getHistory()['step-1']).toBeUndefined();

    await service.stop('step-1');
  });

  it('does not delete a restarted session when old stop finishes', async () => {
    const deferredSamples: Array<{
      promise: Promise<{
        pids: number[];
        cpuPercent: number;
        rssBytes: number;
      }>;
      resolve: (sample: {
        pids: number[];
        cpuPercent: number;
        rssBytes: number;
      }) => void;
    }> = [];
    const service = new AgentResourceMonitorService({
      intervalMs: 60_000,
      sampler: () => {
        let resolve!: (sample: {
          pids: number[];
          cpuPercent: number;
          rssBytes: number;
        }) => void;
        const promise = new Promise<{
          pids: number[];
          cpuPercent: number;
          rssBytes: number;
        }>((resolver) => {
          resolve = resolver;
        });
        deferredSamples.push({ promise, resolve });
        return promise;
      },
    });

    service.start({
      taskId: 'task-1',
      stepId: 'step-1',
      backend: 'opencode',
      rootPid: 10,
    });
    service.start({
      taskId: 'task-1',
      stepId: 'step-1',
      backend: 'opencode',
      rootPid: 20,
    });

    deferredSamples[0].resolve({ pids: [10], cpuPercent: 1, rssBytes: 100 });
    await deferredSamples[0].promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    deferredSamples[1].resolve({ pids: [20], cpuPercent: 2, rssBytes: 200 });
    await deferredSamples[1].promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.getSnapshots()).toEqual([
      expect.objectContaining({
        rootPid: 20,
        pids: [20],
        cpuPercent: 2,
      }),
    ]);
    await service.stop('step-1');
  });

  it('reports unsupported snapshot when root PID is unavailable', async () => {
    const onSnapshot = vi.fn();
    const service = new AgentResourceMonitorService({ intervalMs: 1_000 });
    service.setSnapshotListener(onSnapshot);

    service.start({
      taskId: 'task-1',
      stepId: 'step-1',
      backend: 'claude-code',
      rootPid: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.stop('step-1');

    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        pids: [],
        cpuPercent: 0,
        rssBytes: 0,
        unsupportedReason: 'backend did not expose a root PID',
      }),
    );
  });
});
