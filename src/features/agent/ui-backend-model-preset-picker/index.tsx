import { useMemo } from 'react';

import type { KeyboardLayer } from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { BackendPresetSelector } from '@/features/agent/ui-backend-preset-selector';
import {
  getModelLabel,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useBackendDefaultModelsSetting,
  useBackendModelPresetsSetting,
} from '@/hooks/use-settings';
import { getDefaultModelForBackend } from '@/lib/default-models';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference, ThinkingEffort } from '@shared/types';

export function BackendModelPresetPicker({
  backend,
  model,
  selectedPresetId,
  enabledBackends,
  onChange,
  disabled,
  backendShortcut,
  modelShortcut,
  side,
  className,
  modelClassName,
  layer,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  selectedPresetId?: string | null;
  enabledBackends?: AgentBackendType[];
  onChange: (selection: {
    backend: AgentBackendType;
    model: ModelPreference;
    thinkingEffort?: ThinkingEffort | null;
    presetId: string | null;
  }) => void;
  disabled?: boolean;
  backendShortcut?: BindingKey | BindingKey[];
  modelShortcut?: BindingKey | BindingKey[];
  side?: 'top' | 'bottom';
  className?: string;
  modelClassName?: string;
  layer?: KeyboardLayer;
}) {
  const { data: presets = [] } = useBackendModelPresetsSetting();
  const { data: backendDefaultModels } = useBackendDefaultModelsSetting();
  const { data: dynamicModels, isFetched } = useBackendModels(backend);
  const validSelectedPresetId = useMemo(() => {
    if (!selectedPresetId) {
      return null;
    }

    const selectedPreset = presets.find(
      (preset) => preset.id === selectedPresetId,
    );
    if (!selectedPreset) {
      return null;
    }

    if (enabledBackends && !enabledBackends.includes(selectedPreset.backend)) {
      return null;
    }

    return selectedPreset.id;
  }, [enabledBackends, presets, selectedPresetId]);
  const baseModelOptions = getModelsForBackend(backend, dynamicModels);
  const modelOptions = baseModelOptions.some((option) => option.value === model)
    ? baseModelOptions
    : [
        {
          value: model,
          label: getModelLabel(model, backend, dynamicModels),
          description: isFetched
            ? 'Previously selected model'
            : 'Loading available models',
        },
        ...baseModelOptions,
      ];

  return (
    <>
      <BackendPresetSelector
        backend={backend}
        selectedPresetId={validSelectedPresetId}
        enabledBackends={enabledBackends}
        onChange={(selection) => {
          if (selection.presetId) {
            onChange({
              backend: selection.backend,
              model: selection.modelPreference ?? 'default',
              thinkingEffort: selection.thinkingEffort ?? 'default',
              presetId: selection.presetId,
            });
            return;
          }

          onChange({
            backend: selection.backend,
            model: getDefaultModelForBackend({
              backend: selection.backend,
              backendDefaultModels,
            }),
            thinkingEffort: 'default',
            presetId: null,
          });
        }}
        disabled={disabled}
        shortcut={backendShortcut}
        side={side}
        className={className}
        layer={layer}
      />

      {!validSelectedPresetId && (
        <ModelSelector
          value={model}
          onChange={(nextModel) =>
            onChange({
              backend,
              model: nextModel,
              thinkingEffort: null,
              presetId: null,
            })
          }
          disabled={disabled}
          models={modelOptions}
          shortcut={modelShortcut}
          side={side}
          className={modelClassName}
          layer={layer}
        />
      )}
    </>
  );
}
