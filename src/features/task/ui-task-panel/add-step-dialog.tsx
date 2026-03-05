import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import {
  BackendSelector,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import {
  PromptTextarea,
  type PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { useBackendModels } from '@/hooks/use-backend-models';
import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  normalizeInteractionModeForBackend,
  type InteractionMode,
  type ModelPreference,
} from '@shared/types';

export function AddStepDialog({
  isOpen,
  onClose,
  onConfirm,
  defaultBackend = 'claude-code',
  defaultModel = 'default',
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    promptTemplate: string;
    interactionMode: InteractionMode;
    agentBackend: AgentBackendType;
    modelPreference: ModelPreference;
    images: PromptImagePart[];
    start: boolean;
  }) => void;
  defaultBackend?: AgentBackendType;
  defaultModel?: ModelPreference;
}) {
  const [promptTemplate, setPromptTemplate] = useState('');
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('ask');
  const [backend, setBackend] = useState<AgentBackendType>(defaultBackend);
  const [model, setModel] = useState<ModelPreference>(defaultModel);
  const [images, setImages] = useState<PromptImagePart[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const textareaRef = useRef<PromptTextareaRef>(null);

  const { data: dynamicModels } = useBackendModels(backend);

  useEffect(() => {
    if (isOpen) {
      setPromptTemplate('');
      setInteractionMode('ask');
      setBackend(defaultBackend);
      setModel(defaultModel);
      setImages([]);
      setAutoStart(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen, defaultBackend, defaultModel]);

  // Reset model to default when backend changes
  const handleBackendChange = (newBackend: AgentBackendType) => {
    setBackend(newBackend);
    setModel('default');
  };

  const canSubmit = promptTemplate.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onConfirm({
      promptTemplate: promptTemplate.trim(),
      interactionMode: normalizeInteractionModeForBackend({
        backend,
        mode: interactionMode,
      }),
      agentBackend: backend,
      modelPreference: model,
      images,
      start: autoStart,
    });
  }, [
    canSubmit,
    onConfirm,
    promptTemplate,
    interactionMode,
    backend,
    model,
    images,
    autoStart,
  ]);

  const handleEnterKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.metaKey || e.ctrlKey) {
        handleSubmit();
        return true;
      }
    },
    [handleSubmit],
  );

  const handleImageAttach = useCallback((image: PromptImagePart) => {
    setImages((prev) => [...prev, image]);
  }, []);

  const handleImageRemove = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  useCommands('add-step-dialog', [
    isOpen && {
      label: 'Toggle Auto-start',
      shortcut: 'cmd+shift+s',
      hideInCommandPalette: true,
      handler: () => {
        setAutoStart((prev) => !prev);
      },
    },
  ]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Step">
      <div className="space-y-4">
        <PromptTextarea
          ref={textareaRef}
          value={promptTemplate}
          onChange={setPromptTemplate}
          onEnterKey={handleEnterKey}
          placeholder="Describe what this step should do..."
          maxHeight={200}
          showCommands={false}
          images={images}
          onImageAttach={handleImageAttach}
          onImageRemove={handleImageRemove}
        />
        <div className="flex items-center gap-3">
          <ModeSelector
            value={interactionMode}
            onChange={setInteractionMode}
            backend={backend}
            shortcut="cmd+i"
            side="top"
          />
          <BackendSelector
            value={backend}
            onChange={handleBackendChange}
            shortcut="cmd+j"
            side="top"
          />
          <ModelSelector
            value={model}
            onChange={setModel}
            models={getModelsForBackend(backend, dynamicModels)}
            shortcut="cmd+l"
            side="top"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Auto-start
            <Kbd shortcut="cmd+shift+s" />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Step
              <Kbd shortcut="cmd+enter" className="ml-1" />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
