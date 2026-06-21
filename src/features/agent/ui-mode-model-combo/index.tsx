import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';



import {
  getInteractionModeOptions,
  type InteractionMode,
  normalizeInteractionModeForBackend,
} from '@shared/types';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference } from '@shared/types';
import { THINKING_EFFORT_OPTIONS } from '@shared/thinking-settings';
import type { ThinkingEffort } from '@shared/types';
import type { ThinkingEffortOption } from '@shared/thinking-settings';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useRegisterOverlay } from '@/common/context/overlay';



import type { BackendModelOption } from '../ui-backend-selector';

const DEFAULT_MODELS: BackendModelOption[] = [
  { value: 'default', label: 'Default', description: 'Use the default model' },
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

/**
 * A combined mode + model selector that renders as a single compact chip.
 * Clicking opens a popover with two sections: Mode and Model.
 * Designed for narrow/responsive composer layouts where two separate selectors
 * would consume too much horizontal space.
 */
export function ModeModelComboSelector({
  mode,
  onModeChange,
  model,
  onModelChange,
  thinkingEffort = 'default',
  onThinkingEffortChange,
  thinkingOptions = THINKING_EFFORT_OPTIONS,
  backend = 'claude-code',
  models,
  disabled = false,
}: {
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  model: ModelPreference;
  onModelChange: (model: ModelPreference) => void;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  thinkingOptions?: ThinkingEffortOption[];
  backend?: AgentBackendType;
  models?: BackendModelOption[];
  disabled?: boolean;
}) {
  const id = useId();
  const listboxId = `combo-select-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const position = useDropdownPosition({
    isOpen,
    triggerRef,
    side: 'top',
    align: 'left',
  });

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  useRegisterOverlay({
    id: listboxId,
    refs: [triggerRef, contentRef],
    onClose: close,
    enabled: isOpen,
  });

  const modeOptions = [...getInteractionModeOptions({ backend })];
  const normalizedMode = normalizeInteractionModeForBackend({
    backend,
    mode,
  });
  const selectedModeOption = modeOptions.find(
    (o) => o.value === normalizedMode,
  );

  const effectiveModels = models ?? DEFAULT_MODELS;
  const selectedModelOption = effectiveModels.find((m) => m.value === model);

  const modeLabel = selectedModeOption?.label ?? 'Plan';
  const modelLabel = selectedModelOption?.label ?? 'Default';
  const selectedThinkingOption = thinkingOptions.find(
    (option) => option.value === thinkingEffort,
  );
  const thinkingLabel = selectedThinkingOption?.label ?? 'Default';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={`Mode: ${modeLabel}, Model: ${modelLabel}, Thinking: ${thinkingLabel}`}
        className={clsx(
          'bg-glass-light hover:bg-glass-medium flex items-center gap-0 rounded-md transition-colors',
          'h-7 text-xs',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {/* Mode segment */}
        <span className="text-ink-2 flex items-center gap-1 px-2">
          {modeLabel}
        </span>
        {/* Divider */}
        <span className="bg-glass-border h-3.5 w-px shrink-0" />
        {/* Thinking segment */}
        <span className="text-ink-2 flex items-center gap-1 px-2">
          {thinkingLabel}
        </span>
        <span className="bg-glass-border h-3.5 w-px shrink-0" />
        {/* Model segment */}
        <span className="text-ink-1 flex items-center gap-1 px-2 font-medium">
          {modelLabel}
          <ChevronDown className="text-ink-3 h-3 w-3" aria-hidden />
        </span>
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            id={listboxId}
            role="listbox"
            aria-orientation="vertical"
            aria-label="Mode and model"
            className="bg-bg-1 border-glass-border fixed z-[70] min-w-48 overflow-x-hidden overflow-y-auto rounded-md border py-1 shadow-xl"
            style={{
              top: position.actualSide === 'bottom' ? position.top : undefined,
              bottom:
                position.actualSide === 'top'
                  ? window.innerHeight - position.top
                  : undefined,
              left: position.actualAlign === 'left' ? position.left : undefined,
              right:
                position.actualAlign === 'right'
                  ? window.innerWidth - position.left
                  : undefined,
              maxHeight: position.maxHeight,
              maxWidth: position.maxWidth,
            }}
          >
            {/* Mode section */}
            <div className="text-ink-4 px-3 pt-1 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Mode
            </div>
            {modeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === normalizedMode}
                onClick={() => {
                  onModeChange(option.value);
                }}
                className={clsx(
                  'hover:bg-glass-medium flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs transition-colors',
                  option.value === normalizedMode ? 'text-ink-1' : 'text-ink-2',
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {option.value === normalizedMode && (
                    <Check className="h-3 w-3" />
                  )}
                </span>
                <span
                  className={clsx(
                    'text-xs',
                    option.value === normalizedMode && 'font-medium',
                  )}
                >
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-ink-3 ml-auto text-xs">
                    {option.description}
                  </span>
                )}
              </button>
            ))}

            {/* Divider */}
            <div className="border-glass-border my-1 border-t" />

            {/* Thinking section */}
            <div className="text-ink-4 px-3 pt-1 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Thinking
            </div>
            {thinkingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === thinkingEffort}
                onClick={() => {
                  onThinkingEffortChange?.(option.value);
                }}
                className={clsx(
                  'hover:bg-glass-medium flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs transition-colors',
                  option.value === thinkingEffort ? 'text-ink-1' : 'text-ink-2',
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {option.value === thinkingEffort && (
                    <Check className="h-3 w-3" />
                  )}
                </span>
                <div className="flex flex-col">
                  <span
                    className={clsx(
                      'text-xs',
                      option.value === thinkingEffort && 'font-medium',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-ink-3 text-xs">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            ))}

            <div className="border-glass-border my-1 border-t" />

            {/* Model section */}
            <div className="text-ink-4 px-3 pt-1 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Model
            </div>
            {effectiveModels.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === model}
                onClick={() => {
                  onModelChange(option.value);
                }}
                className={clsx(
                  'hover:bg-glass-medium flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs transition-colors',
                  option.value === model ? 'text-ink-1' : 'text-ink-2',
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {option.value === model && <Check className="h-3 w-3" />}
                </span>
                <div className="flex flex-col">
                  <span
                    className={clsx(
                      'text-xs',
                      option.value === model && 'font-medium',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-ink-3 text-xs">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
