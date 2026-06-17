import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  AgentResourceSnapshot,
  AgentResourceSummary,
} from '@shared/agent-resource-types';

import {
  sampleProcessTree,
  type ProcessTreeSample,
} from './process-resource-sampler';

type TrackedSession = {
  taskId: string;
  stepId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  sampleCount: number;
  cpuTotal: number;
  rssTotal: number;
  peakCpuPercent: number;
  peakRssBytes: number;
  latest: AgentResourceSnapshot | null;
  sampling: Promise<void> | null;
};

const DEFAULT_RESOURCE_HISTORY_WINDOW_MS = 60 * 60 * 1_000;

type AgentResourceMonitorDeps = {
  intervalMs?: number;
  historyWindowMs?: number;
  sampler?: (rootPid: number) => Promise<ProcessTreeSample>;
  onSnapshot?: (snapshot: AgentResourceSnapshot) => void;
  now?: () => number;
};

export class AgentResourceMonitorService {
  private sessions = new Map<string, TrackedSession>();

  private historyByStepId = new Map<string, AgentResourceSnapshot[]>();

  private onSnapshot?: (snapshot: AgentResourceSnapshot) => void;

  constructor(private readonly deps: AgentResourceMonitorDeps = {}) {
    this.onSnapshot = deps.onSnapshot;
  }

  setSnapshotListener(
    listener?: (snapshot: AgentResourceSnapshot) => void,
  ): void {
    this.onSnapshot = listener;
  }

  start(params: {
    taskId: string;
    stepId: string;
    backend: AgentBackendType;
    rootPid: number | null;
  }): void {
    void this.stop(params.stepId);

    const session: TrackedSession = {
      ...params,
      startedAt: this.now(),
      timer: null,
      sampleCount: 0,
      cpuTotal: 0,
      rssTotal: 0,
      peakCpuPercent: 0,
      peakRssBytes: 0,
      latest: null,
      sampling: null,
    };
    this.sessions.set(params.stepId, session);

    this.queueSample(session);
    session.timer = setInterval(
      () => this.queueSample(session),
      this.deps.intervalMs ?? 2_000,
    );
  }

  getSnapshots(): AgentResourceSnapshot[] {
    return Array.from(this.sessions.values())
      .map((session) => session.latest)
      .filter(
        (snapshot): snapshot is AgentResourceSnapshot => snapshot !== null,
      );
  }

  getHistory(): Record<string, AgentResourceSnapshot[]> {
    this.pruneHistory();
    return Object.fromEntries(this.historyByStepId.entries());
  }

  async stop(stepId: string): Promise<AgentResourceSummary | null> {
    const session = this.sessions.get(stepId);
    if (!session) return null;

    if (session.timer) clearInterval(session.timer);
    await session.sampling;
    if (this.sessions.get(stepId) === session) {
      this.sessions.delete(stepId);
    }

    const endedAt = this.now();
    const summary: AgentResourceSummary = {
      id: `${session.stepId}:${session.startedAt}`,
      taskId: session.taskId,
      stepId: session.stepId,
      backend: session.backend,
      rootPid: session.rootPid,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - session.startedAt,
      sampleCount: session.sampleCount,
      avgCpuPercent: session.sampleCount
        ? session.cpuTotal / session.sampleCount
        : 0,
      peakCpuPercent: session.peakCpuPercent,
      avgRssBytes: session.sampleCount
        ? session.rssTotal / session.sampleCount
        : 0,
      peakRssBytes: session.peakRssBytes,
    };

    return summary;
  }

  private queueSample(session: TrackedSession): void {
    if (session.sampling) return;

    session.sampling = this.sample(session).finally(() => {
      if (session.sampling) {
        session.sampling = null;
      }
    });
  }

  private async sample(session: TrackedSession): Promise<void> {
    const sample =
      session.rootPid === null
        ? {
            pids: [],
            cpuPercent: 0,
            rssBytes: 0,
            unsupportedReason: 'backend did not expose a root PID',
          }
        : await (
            this.deps.sampler ?? ((rootPid) => sampleProcessTree({ rootPid }))
          )(session.rootPid);

    if (this.sessions.get(session.stepId) !== session) {
      return;
    }

    session.sampleCount += 1;
    session.cpuTotal += sample.cpuPercent;
    session.rssTotal += sample.rssBytes;
    session.peakCpuPercent = Math.max(
      session.peakCpuPercent,
      sample.cpuPercent,
    );
    session.peakRssBytes = Math.max(session.peakRssBytes, sample.rssBytes);

    const snapshot: AgentResourceSnapshot = {
      stepId: session.stepId,
      taskId: session.taskId,
      backend: session.backend,
      rootPid: session.rootPid,
      pids: sample.pids,
      sampledAt: new Date(this.now()).toISOString(),
      cpuPercent: sample.cpuPercent,
      rssBytes: sample.rssBytes,
      peakCpuPercent: session.peakCpuPercent,
      peakRssBytes: session.peakRssBytes,
      sampleCount: session.sampleCount,
      ...(sample.unsupportedReason
        ? { unsupportedReason: sample.unsupportedReason }
        : {}),
    };

    session.latest = snapshot;
    this.recordHistory(snapshot);
    this.onSnapshot?.(snapshot);
  }

  private recordHistory(snapshot: AgentResourceSnapshot): void {
    const existing = this.historyByStepId.get(snapshot.stepId) ?? [];
    this.historyByStepId.set(snapshot.stepId, [...existing, snapshot]);
    this.pruneHistory();
  }

  private pruneHistory(): void {
    const cutoff =
      this.now() -
      (this.deps.historyWindowMs ?? DEFAULT_RESOURCE_HISTORY_WINDOW_MS);
    for (const [stepId, history] of this.historyByStepId.entries()) {
      const pruned = history.filter(
        (snapshot) => Date.parse(snapshot.sampledAt) >= cutoff,
      );
      if (pruned.length === 0) {
        this.historyByStepId.delete(stepId);
      } else if (pruned.length !== history.length) {
        this.historyByStepId.set(stepId, pruned);
      }
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

export const agentResourceMonitorService = new AgentResourceMonitorService();
