import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BackendModel } from '@/hooks/use-backend-models';
import { useBackendsSetting } from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference } from '@shared/types';

// --- Per-backend model definitions ---

export interface BackendModelOption {
  value: ModelPreference;
  label: string;
  description: string;
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
function toModelOptions(models: BackendModel[]): BackendModelOption[] {
  return [
    DEFAULT_OPTION,
    ...models.map((m) => ({
      value: m.id as ModelPreference,
      label: m.label,
      description: m.id,
    })),
  ];
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
    return toModelOptions(dynamicModels);
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

export function BackendSelector({
  value,
  onChange,
  disabled,
}: {
  value: AgentBackendType;
  onChange: (backend: AgentBackendType) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { visible, visibleBackends, label } = useBackendSelector({
    value,
    onChange,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (backend: AgentBackendType) => {
    onChange(backend);
    setIsOpen(false);
  };

  // Don't render the selector if only one backend is enabled
  if (!visible) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Backend: ${label}`}
        className="flex min-h-[40px] items-center gap-1 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Agent backends"
          className="absolute bottom-full left-0 mb-1 w-60 rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg"
        >
          {visibleBackends.map((backend) => (
            <button
              key={backend.value}
              type="button"
              role="option"
              aria-selected={backend.value === value}
              onClick={() => handleSelect(backend.value)}
              className={`w-full px-3 py-2 text-left hover:bg-neutral-700 ${backend.value === value ? 'bg-neutral-700' : ''}`}
            >
              <div className="text-sm font-medium text-neutral-200">
                {backend.label}
              </div>
              <div className="text-xs text-neutral-400">
                {backend.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
