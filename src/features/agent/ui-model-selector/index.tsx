import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';

import type { ModelPreference } from '@shared/types';

import type { BackendModelOption } from '../ui-backend-selector';

const DEFAULT_MODELS: BackendModelOption[] = [
  { value: 'default', label: 'Default', description: 'Use the default model' },
  { value: 'opus', label: 'Opus', description: 'Most capable model' },
  {
    value: 'claude-opus-4.5',
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

export function ModelSelector({
  value,
  onChange,
  disabled,
  models,
}: {
  value: ModelPreference;
  onChange: (model: ModelPreference) => void;
  disabled?: boolean;
  /** Override available models (e.g. based on backend). Falls back to default list. */
  models?: BackendModelOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveModels = models ?? DEFAULT_MODELS;
  const selectedModel = useMemo(
    () => effectiveModels.find((m) => m.value === value) ?? effectiveModels[0],
    [effectiveModels, value],
  );

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

  const handleSelect = (model: ModelPreference) => {
    onChange(model);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Model: ${selectedModel.label}`}
        className="flex min-h-[40px] items-center gap-1 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedModel.label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Models"
          className="absolute bottom-full left-0 mb-1 w-56 rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg"
        >
          {effectiveModels.map((model) => (
            <button
              key={model.value}
              type="button"
              role="option"
              aria-selected={model.value === value}
              onClick={() => handleSelect(model.value)}
              className={`w-full px-3 py-2 text-left hover:bg-neutral-700 ${
                model.value === value ? 'bg-neutral-700' : ''
              }`}
            >
              <div className="text-sm font-medium text-neutral-200">
                {model.label}
              </div>
              <div className="text-xs text-neutral-400">
                {model.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
