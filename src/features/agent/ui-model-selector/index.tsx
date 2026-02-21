import { forwardRef, useMemo } from 'react';

import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { Select, type SelectOption, type SelectRef } from '@/common/ui/select';
import type { ModelPreference } from '@shared/types';

import type { BackendModelOption } from '../ui-backend-selector';

const DEFAULT_MODELS: BackendModelOption[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Use the default model',
  },
  { value: 'opus', label: 'Opus', description: 'Most capable model' },
  {
    value: 'claude-opus-4-5',
    label: 'Opus 4.5',
    description: '',
  },
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

export const MODEL_PREFERENCES = DEFAULT_MODELS.map((m) => m.value);

export const ModelSelector = forwardRef<
  SelectRef,
  {
    value: ModelPreference;
    onChange: (model: ModelPreference) => void;
    disabled?: boolean;
    /** Override available models (e.g. based on backend). Falls back to default list. */
    models?: BackendModelOption[];
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
  }
>(function ModelSelector(
  {
    value,
    onChange,
    disabled,
    models,
    shortcut,
    shortcutBehavior,
    side,
    className,
  },
  ref,
) {
  const effectiveModels = useMemo(
    () =>
      (models ?? DEFAULT_MODELS).map(
        (m): SelectOption<string> => ({
          value: m.value,
          label: m.label,
          description: m.description,
        }),
      ),
    [models],
  );

  return (
    <Select
      ref={ref}
      value={value}
      options={effectiveModels}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      label="Model"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
    />
  );
});
