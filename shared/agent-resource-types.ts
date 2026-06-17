import type { AgentBackendType } from './agent-backend-types';

export type AgentResourceSnapshot = {
  stepId: string;
  taskId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  pids: number[];
  sampledAt: string;
  cpuPercent: number;
  rssBytes: number;
  peakCpuPercent: number;
  peakRssBytes: number;
  sampleCount: number;
  unsupportedReason?: string;
};

export type AgentResourceSummary = {
  id: string;
  taskId: string;
  stepId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  sampleCount: number;
  avgCpuPercent: number;
  peakCpuPercent: number;
  avgRssBytes: number;
  peakRssBytes: number;
};
