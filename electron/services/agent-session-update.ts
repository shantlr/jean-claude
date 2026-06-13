import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ThinkingEffort } from '@shared/types';

export function buildSessionIdStepUpdate({
  sessionId,
  backendType,
  requestedBackendType,
  swapModel,
  swapThinkingEffort,
}: {
  sessionId: string;
  backendType: AgentBackendType;
  requestedBackendType: AgentBackendType;
  swapModel?: string;
  swapThinkingEffort?: ThinkingEffort;
}): {
  sessionId: string;
  agentBackend: AgentBackendType;
  modelPreference?: string;
  thinkingEffort?: ThinkingEffort;
} {
  const backendChanged = backendType !== requestedBackendType;

  return {
    sessionId,
    agentBackend: backendType,
    ...(swapModel || backendChanged
      ? { modelPreference: swapModel ?? 'default' }
      : {}),
    ...(swapThinkingEffort || backendChanged
      ? { thinkingEffort: swapThinkingEffort ?? 'default' }
      : {}),
  };
}
