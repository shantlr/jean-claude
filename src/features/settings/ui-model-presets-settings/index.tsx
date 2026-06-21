import { Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useMemo } from 'react';



import {
  AVAILABLE_BACKENDS,
  getModelLabel,
  getModelsForBackend,
  getModelThinkingCapabilities,
} from '@/features/agent/ui-backend-selector';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import { Select, type SelectOption } from '@/common/ui/select';
import {
  useBackendModelPresetsSetting,
  useBackendsSetting,
  useUpdateBackendModelPresetsSetting,
} from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { BackendModelPreset } from '@shared/types';
import { BackendsSettings } from '@/features/settings/ui-general-settings';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';



function PresetCard({
  preset,
  backendOptions,
  onChange,
  onDelete,
}: {
  preset: BackendModelPreset;
  backendOptions: SelectOption<AgentBackendType>[];
  onChange: (update: Partial<BackendModelPreset>) => void;
  onDelete: () => void;
}) {
  const { data: dynamicModels, isFetched } = useBackendModels(preset.backend);
  const thinkingCapabilities = getModelThinkingCapabilities(
    preset.model,
    dynamicModels,
  );
  const thinkingOptions = getThinkingEffortOptions({
    backend: preset.backend,
    model: preset.model,
    capabilities: thinkingCapabilities,
  });
  const thinkingEffort = normalizeThinkingEffortForModel({
    backend: preset.backend,
    model: preset.model,
    effort: preset.thinkingEffort,
    capabilities: thinkingCapabilities,
  });
  const modelOptions = useMemo(() => {
    const availableModels = getModelsForBackend(preset.backend, dynamicModels);

    if (availableModels.some((model) => model.value === preset.model)) {
      return availableModels;
    }

    return [
      {
        value: preset.model,
        label: getModelLabel(preset.model, preset.backend, dynamicModels),
        description: isFetched ? 'Previously selected model' : 'Loading model',
      },
      ...availableModels,
    ];
  }, [dynamicModels, isFetched, preset.backend, preset.model]);

  return (
    <div className="border-glass-border bg-bg-1 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-ink-1 text-sm font-medium">Preset name</div>
          <Input
            value={preset.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Fast review, Deep planning..."
            className="mt-2"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 />}
          onClick={onDelete}
          aria-label={`Delete ${preset.name || 'preset'}`}
        >
          Delete
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select
          value={preset.backend}
          onChange={(backend) =>
            onChange({
              backend,
              model: 'default',
              thinkingEffort: 'default',
            })
          }
          options={backendOptions}
          label="Backend"
        />
        <ModelSelector
          value={preset.model}
          onChange={(model) => {
            const capabilities = getModelThinkingCapabilities(
              model,
              dynamicModels,
            );
            onChange({
              model,
              thinkingEffort: normalizeThinkingEffortForModel({
                backend: preset.backend,
                model,
                effort: preset.thinkingEffort,
                capabilities,
              }),
            });
          }}
          models={modelOptions}
        />
        <ThinkingSelector
          value={thinkingEffort}
          onChange={(nextThinkingEffort) =>
            onChange({ thinkingEffort: nextThinkingEffort })
          }
          options={thinkingOptions}
          disabled={thinkingOptions.length <= 1}
        />
      </div>
    </div>
  );
}

export function ModelPresetsSettings() {
  const { data: backendsSetting } = useBackendsSetting();
  const { data: presets = [] } = useBackendModelPresetsSetting();
  const updatePresets = useUpdateBackendModelPresetsSetting();

  const enabledBackends = useMemo(
    () =>
      backendsSetting?.enabledBackends ??
      (['claude-code'] as AgentBackendType[]),
    [backendsSetting?.enabledBackends],
  );
  const backendOptions = useMemo(
    () =>
      AVAILABLE_BACKENDS.filter((backend) =>
        enabledBackends.includes(backend.value),
      ).map(
        (backend): SelectOption<AgentBackendType> => ({
          value: backend.value,
          label: backend.label,
          description: backend.description,
          badge: backend.badge,
        }),
      ),
    [enabledBackends],
  );

  const updatePreset = (
    presetId: string,
    update: Partial<BackendModelPreset>,
  ) => {
    updatePresets.mutate(
      presets.map((preset) =>
        preset.id === presetId ? { ...preset, ...update } : preset,
      ),
    );
  };

  const handleAddPreset = () => {
    const defaultBackend: AgentBackendType =
      enabledBackends[0] ?? 'claude-code';
    updatePresets.mutate([
      ...presets,
      {
        id: nanoid(),
        name: '',
        backend: defaultBackend,
        model: 'default',
        thinkingEffort: 'default',
      },
    ]);
  };

  const handleDeletePreset = (presetId: string) => {
    updatePresets.mutate(presets.filter((preset) => preset.id !== presetId));
  };

  return (
    <div>
      <BackendsSettings />

      <div className="border-line-soft my-8 border-t" />

      <div className="flex items-start justify-between gap-4">
        <Button icon={<Plus />} onClick={handleAddPreset}>
          Add preset
        </Button>
      </div>

      {backendOptions.length === 0 ? (
        <div className="border-line-soft bg-bg-0 text-ink-3 mt-4 rounded-xl border px-4 py-3 text-sm">
          Enable at least one backend in Coding Agents before creating model
          presets.
        </div>
      ) : presets.length === 0 ? (
        <div className="border-line-soft bg-bg-0 text-ink-3 mt-4 rounded-xl border px-4 py-8 text-center text-sm">
          No presets yet. Create one for common backend and model combinations.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              backendOptions={backendOptions}
              onChange={(update) => updatePreset(preset.id, update)}
              onDelete={() => handleDeletePreset(preset.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
