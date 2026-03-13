import { Trash2, Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { Select } from '@/common/ui/select';
import {
  AVAILABLE_BACKENDS,
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
import { useBackendsSetting } from '@/hooks/use-settings';
import { useSkills } from '@/hooks/use-skills';
import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  normalizeInteractionModeForBackend,
  type InteractionMode,
  type ModelPreference,
  type ReviewerConfig,
} from '@shared/types';

function createDefaultReviewers(backend: AgentBackendType): ReviewerConfig[] {
  return [
    {
      id: nanoid(),
      label: 'Bug Detection',
      focusPrompt:
        'Focus on potential bugs, edge cases, error handling, and logic errors.',
      backend,
    },
    {
      id: nanoid(),
      label: 'Code Quality',
      focusPrompt:
        'Focus on code quality, readability, naming conventions, and maintainability.',
      backend,
    },
    {
      id: nanoid(),
      label: 'Security & Performance',
      focusPrompt:
        'Focus on security vulnerabilities, performance bottlenecks, and resource management.',
      backend,
    },
  ];
}

export type AddStepPresetType = 'new-session' | 'continue' | 'review-changes';

const STEP_PRESET_OPTIONS = [
  {
    value: 'new-session',
    label: 'New session',
    description: 'Start from a fresh context',
  },
  {
    value: 'continue',
    label: 'Continue',
    description: 'Continue with summary of previous step',
  },
  {
    value: 'review-changes',
    label: 'Review changes',
    description: 'Run a dedicated code review step',
  },
] as const;

export function AddStepDialog({
  isOpen,
  onClose,
  onConfirm,
  defaultBackend = 'claude-code',
  defaultModel = 'default',
  taskId,
  activeStepId,
  projectRoot,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    promptTemplate: string;
    presetType: AddStepPresetType;
    interactionMode: InteractionMode;
    agentBackend: AgentBackendType;
    modelPreference: ModelPreference;
    images: PromptImagePart[];
    start: boolean;
    reviewers?: ReviewerConfig[];
  }) => void;
  defaultBackend?: AgentBackendType;
  defaultModel?: ModelPreference;
  taskId: string;
  activeStepId?: string;
  projectRoot?: string | null;
  projectId?: string;
}) {
  const [promptTemplate, setPromptTemplate] = useState('');
  const [presetType, setPresetType] =
    useState<AddStepPresetType>('new-session');
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('ask');
  const [backend, setBackend] = useState<AgentBackendType>(defaultBackend);
  const [model, setModel] = useState<ModelPreference>(defaultModel);
  const [images, setImages] = useState<PromptImagePart[]>([]);
  const [autoStart, setAutoStart] = useState(true);
  const [reviewers, setReviewers] = useState<ReviewerConfig[]>(
    createDefaultReviewers(defaultBackend),
  );
  const textareaRef = useRef<PromptTextareaRef>(null);

  const { data: dynamicModels } = useBackendModels(backend);
  const { data: backendsSetting } = useBackendsSetting();
  const enabledBackends =
    backendsSetting?.enabledBackends ??
    ([defaultBackend] as AgentBackendType[]);
  const reviewerBackendOptions = AVAILABLE_BACKENDS.filter((option) =>
    enabledBackends.includes(option.value),
  ).map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));
  const { data: skills } = useSkills({
    taskId,
    stepId: activeStepId,
  });

  useEffect(() => {
    if (isOpen) {
      setPromptTemplate('');
      setPresetType('new-session');
      setInteractionMode('ask');
      setBackend(defaultBackend);
      setModel(defaultModel);
      setImages([]);
      setAutoStart(true);
      setReviewers(createDefaultReviewers(defaultBackend));
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen, defaultBackend, defaultModel]);

  // Reset model to default when backend changes
  const handleBackendChange = (newBackend: AgentBackendType) => {
    setBackend(newBackend);
    setModel('default');
  };

  const canSubmit =
    presetType === 'review-changes'
      ? reviewers.length > 0 &&
        reviewers.every(
          (reviewer) =>
            reviewer.label.trim().length > 0 &&
            reviewer.focusPrompt.trim().length > 0,
        )
      : promptTemplate.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onConfirm({
      promptTemplate: promptTemplate.trim(),
      presetType,
      interactionMode: normalizeInteractionModeForBackend({
        backend,
        mode: interactionMode,
      }),
      agentBackend: backend,
      modelPreference: model,
      images,
      start: autoStart,
      reviewers:
        presetType === 'review-changes'
          ? reviewers.map((reviewer) => ({
              ...reviewer,
              label: reviewer.label.trim(),
              focusPrompt: reviewer.focusPrompt.trim(),
            }))
          : undefined,
    });
  }, [
    canSubmit,
    onConfirm,
    promptTemplate,
    presetType,
    interactionMode,
    backend,
    model,
    images,
    autoStart,
    reviewers,
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
        <div className="flex items-center gap-2">
          <Select
            value={presetType}
            onChange={(value) => setPresetType(value as AddStepPresetType)}
            options={[...STEP_PRESET_OPTIONS]}
            shortcut="cmd+t"
            side="top"
          />
        </div>
        <PromptTextarea
          ref={textareaRef}
          value={promptTemplate}
          onChange={setPromptTemplate}
          onEnterKey={handleEnterKey}
          placeholder={
            presetType === 'review-changes'
              ? 'Optional: add any extra review focus...'
              : 'Describe what this step should do...'
          }
          maxHeight={200}
          showCommands
          skills={skills}
          enableFilePathAutocomplete={!!projectRoot}
          projectRoot={projectRoot}
          projectId={projectId}
          images={images}
          onImageAttach={handleImageAttach}
          onImageRemove={handleImageRemove}
        />
        {presetType === 'review-changes' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Reviewers
              </span>
              <Button
                type="button"
                onClick={() =>
                  setReviewers((prev) => [
                    ...prev,
                    {
                      id: nanoid(),
                      label: '',
                      focusPrompt: '',
                      backend,
                    },
                  ])
                }
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
              >
                <Plus className="h-3 w-3" />
                Add reviewer
              </Button>
            </div>
            <div className="max-h-[240px] space-y-2 overflow-y-auto">
              {reviewers.map((reviewer, idx) => (
                <div
                  key={reviewer.id}
                  className="rounded-md border border-neutral-700 bg-neutral-800/50 p-2"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={reviewer.label}
                      onChange={(e) =>
                        setReviewers((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder="Reviewer label"
                      className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                    />
                    <Select
                      value={reviewer.backend}
                      onChange={(value) =>
                        setReviewers((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, backend: value as AgentBackendType }
                              : r,
                          ),
                        )
                      }
                      options={reviewerBackendOptions}
                      side="top"
                      className="w-[170px]"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        setReviewers((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <textarea
                    value={reviewer.focusPrompt}
                    onChange={(e) =>
                      setReviewers((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, focusPrompt: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Focus prompt for this reviewer..."
                    rows={2}
                    className="w-full resize-none rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            {!canSubmit && (
              <p className="text-xs text-amber-400">
                Add at least one reviewer and fill every label/focus prompt.
              </p>
            )}
          </div>
        )}
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
            <Button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Step
              <Kbd shortcut="cmd+enter" className="ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
