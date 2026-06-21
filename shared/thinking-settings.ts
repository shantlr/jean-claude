import type { ModelPreference, ThinkingEffort } from './types';
import type { AgentBackendType } from './agent-backend-types';


export interface ThinkingEffortOption {
  value: ThinkingEffort;
  label: string;
  description: string;
}

export type ThinkingModelCapabilities = {
  supportsThinking?: boolean;
  thinkingEfforts?: ThinkingEffort[];
};

export const DEFAULT_THINKING_EFFORT_OPTION: ThinkingEffortOption = {
  value: 'default',
  label: 'Default',
  description: 'Backend or model default',
};

export const THINKING_EFFORT_OPTIONS: ThinkingEffortOption[] = [
  DEFAULT_THINKING_EFFORT_OPTION,
  { value: 'minimal', label: 'Minimal', description: 'Minimum reasoning' },
  { value: 'none', label: 'None', description: 'Disable reasoning effort' },
  { value: 'low', label: 'Low', description: 'Fastest reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced reasoning' },
  { value: 'high', label: 'High', description: 'Deeper reasoning' },
  { value: 'max', label: 'Max', description: 'Maximum supported effort' },
  { value: 'xhigh', label: 'XHigh', description: 'Extra-high reasoning' },
];

const CLAUDE_THINKING_EFFORTS: ThinkingEffort[] = [
  'default',
  'low',
  'medium',
  'high',
  'max',
];

const OPENCODE_THINKING_EFFORTS: ThinkingEffort[] = [
  'default',
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
];

const CODEX_THINKING_EFFORTS: ThinkingEffort[] = [
  'default',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export function getThinkingEffortOptions({
  backend,
  model,
  capabilities,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  capabilities?: ThinkingModelCapabilities | null;
}): ThinkingEffortOption[] {
  if (backend === 'claude-code') {
    return optionsForEfforts(
      capabilities?.thinkingEfforts
        ? ['default', ...capabilities.thinkingEfforts]
        : CLAUDE_THINKING_EFFORTS,
    );
  }

  if (backend === 'opencode') {
    if (capabilities?.supportsThinking === false) {
      return [DEFAULT_THINKING_EFFORT_OPTION];
    }

    if (
      capabilities?.supportsThinking &&
      capabilities.thinkingEfforts?.length
    ) {
      return optionsForEfforts(['default', ...capabilities.thinkingEfforts]);
    }

    return optionsForEfforts(OPENCODE_THINKING_EFFORTS);
  }

  if (backend === 'codex') {
    if (capabilities?.supportsThinking === false) {
      return [DEFAULT_THINKING_EFFORT_OPTION];
    }

    if (
      capabilities?.supportsThinking &&
      capabilities.thinkingEfforts?.length
    ) {
      return optionsForEfforts(['default', ...capabilities.thinkingEfforts]);
    }

    return model === 'default'
      ? [DEFAULT_THINKING_EFFORT_OPTION]
      : optionsForEfforts(CODEX_THINKING_EFFORTS);
  }

  void model;
  return [DEFAULT_THINKING_EFFORT_OPTION];
}

export function normalizeThinkingEffortForModel({
  backend,
  model,
  effort,
  capabilities,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  effort: ThinkingEffort | null | undefined;
  capabilities?: ThinkingModelCapabilities | null;
}): ThinkingEffort {
  const value = effort ?? 'default';
  const options = getThinkingEffortOptions({ backend, model, capabilities });
  return options.some((option) => option.value === value) ? value : 'default';
}

function optionsForEfforts(efforts: ThinkingEffort[]): ThinkingEffortOption[] {
  const uniqueEfforts = [...new Set(efforts)];
  return THINKING_EFFORT_OPTIONS.filter((option) =>
    uniqueEfforts.includes(option.value),
  );
}
