import { forwardRef, useCallback, useMemo } from 'react';

import { Select, type SelectRef } from '@/common/ui/select';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { BackendModel } from '@/hooks/use-backend-models';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import type { KeyboardLayer } from '@/common/context/keyboard-bindings';
import type { ModelPreference } from '@shared/types';
import type { ThinkingModelCapabilities } from '@shared/thinking-settings';
import { useBackendsSetting } from '@/hooks/use-settings';



export type { SelectRef } from '@/common/ui/select';

// --- Per-backend model definitions ---

export interface BackendModelOption {
  value: ModelPreference;
  label: string;
  description: string;
  group?: string;
}

// Static fallback for Claude Code (models are fixed by the SDK)
const CLAUDE_CODE_MODELS: BackendModelOption[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Use the default model',
  },
  { value: 'opus', label: 'Opus', description: 'Most capable model' },
  {
    value: 'sonnet',
    label: 'Sonnet',
    description: 'Balanced speed & quality',
  },
  {
    value: 'haiku',
    label: 'Haiku',
    description: 'Fastest, lightweight tasks',
  },
];

const DEFAULT_OPTION: BackendModelOption = {
  value: 'default',
  label: 'Default',
  description: 'Use the default model',
};

/**
 * Convert dynamically fetched BackendModel[] into BackendModelOption[].
 * Prepends a 'default' entry.
 */
function toModelOptions(
  models: BackendModel[],
  backend: AgentBackendType,
): BackendModelOption[] {
  const modelOptions = models.map((m) => ({
    value: m.id as ModelPreference,
    label: m.label,
    description: m.id,
    group: getModelProviderGroup(m.id, backend),
  }));

  return [
    DEFAULT_OPTION,
    ...(backend === 'opencode'
      ? groupModelOptionsByProvider(modelOptions)
      : modelOptions),
  ];
}

function groupModelOptionsByProvider(
  options: BackendModelOption[],
): BackendModelOption[] {
  const groupOrder = new Map<string, number>();
  for (const option of options) {
    if (option.group && !groupOrder.has(option.group)) {
      groupOrder.set(option.group, groupOrder.size);
    }
  }

  return [...options].sort((a, b) => {
    const aGroup = a.group ? groupOrder.get(a.group) : Number.MAX_SAFE_INTEGER;
    const bGroup = b.group ? groupOrder.get(b.group) : Number.MAX_SAFE_INTEGER;
    return (
      (aGroup ?? Number.MAX_SAFE_INTEGER) - (bGroup ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function getModelProviderGroup(
  modelId: string,
  backend: AgentBackendType,
): string | undefined {
  if (backend !== 'opencode') return undefined;

  const separatorIndex = modelId.indexOf('/');
  if (separatorIndex <= 0) return undefined;

  return modelId.slice(0, separatorIndex);
}

/**
 * Get model options for a backend.
 * Pass dynamicModels from useBackendModels() for backends with CLI-discoverable models.
 * Falls back to static list for Claude Code.
 */
export function getModelsForBackend(
  backend: AgentBackendType,
  dynamicModels?: BackendModel[],
): BackendModelOption[] {
  if (dynamicModels && dynamicModels.length > 0) {
    return toModelOptions(dynamicModels, backend);
  }
  if (backend === 'claude-code') {
    return CLAUDE_CODE_MODELS;
  }
  // Unknown backend or no dynamic data yet — just return default
  return [DEFAULT_OPTION];
}

/** Get the model preference values for a given backend (for cycling) */
export function getModelPreferencesForBackend(
  backend: AgentBackendType,
  dynamicModels?: BackendModel[],
): ModelPreference[] {
  return getModelsForBackend(backend, dynamicModels).map((m) => m.value);
}

/** Check if a model preference is valid for a given backend */
export function isModelValidForBackend(
  model: ModelPreference,
  backend: AgentBackendType,
  dynamicModels?: BackendModel[],
): boolean {
  return getModelPreferencesForBackend(backend, dynamicModels).includes(model);
}

/** Get the display label for a model value within a given backend */
export function getModelLabel(
  model: ModelPreference,
  backend: AgentBackendType,
  dynamicModels?: BackendModel[],
): string {
  const models = getModelsForBackend(backend, dynamicModels);
  return models.find((m) => m.value === model)?.label ?? model;
}

export function getModelThinkingCapabilities(
  model: ModelPreference,
  dynamicModels?: BackendModel[],
): ThinkingModelCapabilities | null {
  if (model === 'default') return null;
  const dynamicModel = dynamicModels?.find((m) => m.id === model);
  if (!dynamicModel) return null;
  return {
    supportsThinking: dynamicModel.supportsThinking,
    thinkingEfforts: dynamicModel.thinkingEfforts,
  };
}

/**
 * React hook that resolves model options for a backend,
 * merging static definitions with dynamically fetched models.
 */
export function useBackendModelOptions(
  backend: AgentBackendType,
  dynamicModels?: BackendModel[],
): BackendModelOption[] {
  return useMemo(
    () => getModelsForBackend(backend, dynamicModels),
    [backend, dynamicModels],
  );
}

// --- Backend definitions ---

export const AVAILABLE_BACKENDS: {
  value: AgentBackendType;
  label: string;
  description: string;
  badge?: string;
}[] = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    description: 'Anthropic Agent SDK',
  },
  {
    value: 'opencode',
    label: 'OpenCode',
    description: 'OpenCode SDK',
  },
  {
    value: 'codex',
    label: 'Codex',
    description: 'OpenAI Codex App Server',
    badge: 'Beta',
  },
];

export const AGENT_BACKENDS = AVAILABLE_BACKENDS.map((b) => b.value);

/**
 * Hook that encapsulates backend selector logic: enabled list, label, toggle.
 * Use this when you need backend cycling without the dropdown UI.
 */
export function useBackendSelector({
  value,
  onChange,
}: {
  value: AgentBackendType;
  onChange: (backend: AgentBackendType) => void;
}) {
  const { data: backendsSetting } = useBackendsSetting();
  const enabledBackends = useMemo(
    () =>
      backendsSetting?.enabledBackends ??
      (['claude-code'] as AgentBackendType[]),
    [backendsSetting],
  );
  const visibleBackends = useMemo(
    () => AVAILABLE_BACKENDS.filter((b) => enabledBackends.includes(b.value)),
    [enabledBackends],
  );

  const selectedBackend =
    AVAILABLE_BACKENDS.find((b) => b.value === value) ?? AVAILABLE_BACKENDS[0];

  const toggle = useCallback(() => {
    if (enabledBackends.length <= 1) return;
    const currentIndex = enabledBackends.indexOf(value);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % enabledBackends.length;
    onChange(enabledBackends[nextIndex]);
  }, [value, enabledBackends, onChange]);

  return {
    /** Cycle to the next enabled backend (wraps around). */
    toggle,
    /** Display label of the currently selected backend. */
    label: selectedBackend.label,
    /** Whether multiple backends are enabled. */
    visible: visibleBackends.length > 1,
    /** The visible backend options (filtered by enabled). */
    visibleBackends,
  };
}

export const BackendSelector = forwardRef<
  SelectRef,
  {
    value: AgentBackendType;
    onChange: (backend: AgentBackendType) => void;
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
    layer?: KeyboardLayer;
  }
>(function BackendSelector(
  {
    value,
    onChange,
    disabled,
    shortcut,
    shortcutBehavior,
    side,
    className,
    layer,
  },
  ref,
) {
  const { visible, visibleBackends } = useBackendSelector({
    value,
    onChange,
  });

  if (!visible) return null;

  const options = visibleBackends.map((b) => ({
    value: b.value,
    label: b.label,
    description: b.description,
    badge: b.badge,
  }));

  return (
    <Select
      ref={ref}
      value={value}
      options={options}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      label="Agent backend"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
      layer={layer}
    />
  );
});
