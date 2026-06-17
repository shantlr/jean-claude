import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { AgentResourceSnapshot } from '@shared/agent-resource-types';

const RESOURCE_HISTORY_WINDOW_MS = 60 * 60 * 1000;

export type AgentResourceSample = AgentResourceSnapshot;

let resourceHistoryByStepId: Record<string, AgentResourceSample[]> = {};

export function useAgentResourceSnapshots() {
  const [historyByStepId, setHistoryByStepId] = useState(
    resourceHistoryByStepId,
  );
  const query = useQuery({
    queryKey: ['agent-resource-snapshots'],
    queryFn: async () => {
      const [snapshots, history] = await Promise.all([
        api.agent.getResourceSnapshots(),
        api.agent.getResourceHistory(),
      ]);
      return { snapshots, history };
    },
    refetchInterval: 2_000,
  });

  useEffect(() => {
    if (!query.data) return;

    const cutoff = Date.now() - RESOURCE_HISTORY_WINDOW_MS;
    const nextHistoryByStepId: Record<string, AgentResourceSample[]> = {
      ...resourceHistoryByStepId,
    };
    const serverStepIds = new Set([
      ...Object.keys(query.data.history),
      ...query.data.snapshots
        .filter((snapshot) => !snapshot.unsupportedReason)
        .map((snapshot) => snapshot.stepId),
    ]);
    let changed = false;

    for (const stepId of Object.keys(nextHistoryByStepId)) {
      if (serverStepIds.has(stepId)) continue;
      delete nextHistoryByStepId[stepId];
      changed = true;
    }

    for (const [stepId, samples] of Object.entries(query.data.history)) {
      const supportedSamples = samples.filter(
        (sample) => !sample.unsupportedReason,
      );
      if (supportedSamples.length === 0) continue;

      const existing = nextHistoryByStepId[stepId] ?? [];
      const samplesByDate = new Map(
        existing.map((sample) => [sample.sampledAt, sample]),
      );

      for (const sample of supportedSamples) {
        samplesByDate.set(sample.sampledAt, sample);
      }

      const merged = Array.from(samplesByDate.values())
        .filter((sample) => Date.parse(sample.sampledAt) >= cutoff)
        .sort((a, b) => Date.parse(a.sampledAt) - Date.parse(b.sampledAt));

      if (
        merged.length !== existing.length ||
        merged.some(
          (sample, index) => existing[index]?.sampledAt !== sample.sampledAt,
        )
      ) {
        changed = true;
      }
      nextHistoryByStepId[stepId] = merged;
    }

    for (const snapshot of query.data.snapshots) {
      if (snapshot.unsupportedReason) continue;

      const existing = nextHistoryByStepId[snapshot.stepId] ?? [];
      if (existing.some((sample) => sample.sampledAt === snapshot.sampledAt)) {
        continue;
      }

      nextHistoryByStepId[snapshot.stepId] = [...existing, snapshot].filter(
        (sample) => Date.parse(sample.sampledAt) >= cutoff,
      );
      changed = true;
    }

    if (!changed) return;

    resourceHistoryByStepId = nextHistoryByStepId;
    setHistoryByStepId(nextHistoryByStepId);
  }, [query.data]);

  return {
    ...query,
    data: query.data?.snapshots,
    historyByStepId,
  };
}
