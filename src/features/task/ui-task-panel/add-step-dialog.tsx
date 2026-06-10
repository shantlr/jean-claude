import { Trash2, Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import {
  KeyboardLayerProvider,
  useKeyboardLayer,
} from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { Select, type SelectOption } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import {
  AVAILABLE_BACKENDS,
  getModelThinkingCapabilities,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import {
  PromptTextarea,
  type PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useProject, useProjectFeatureMap } from '@/hooks/use-projects';
import {
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  usePromptSnippetsSetting,
} from '@/hooks/use-settings';
import { useSkills } from '@/hooks/use-skills';
import { useTask } from '@/hooks/use-tasks';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { expandFeatureReferencesInPrompt } from '@/lib/prompt-feature-context';
import {
  resolvePromptSnippet,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import {
  normalizeInteractionModeForBackend,
  type InteractionMode,
  type ModelPreference,
  type ReviewerConfig,
  type ThinkingEffort,
} from '@shared/types';

function createDefaultReviewers(backend: AgentBackendType): ReviewerConfig[] {
  return [
    {
      id: nanoid(),
      label: 'Bug Detection',
      focusPrompt:
        'Focus on potential bugs, edge cases, error handling, and logic errors.',
      backend,
      model: 'default',
    },
    {
      id: nanoid(),
      label: 'Code Quality',
      focusPrompt:
        'Focus on code quality, readability, naming conventions, and maintainability.',
      backend,
      model: 'default',
    },
    {
      id: nanoid(),
      label: 'Security & Performance',
      focusPrompt:
        'Focus on security vulnerabilities, performance bottlenecks, and resource management.',
      backend,
      model: 'default',
    },
  ];
}

function ReviewerModelSelect({
  reviewer,
  onChange,
}: {
  reviewer: ReviewerConfig;
  onChange: (model: ModelPreference) => void;
}) {
  const { data: dynamicModels } = useBackendModels(reviewer.backend);
  const modelOptions = useMemo(
    () =>
      getModelsForBackend(reviewer.backend, dynamicModels).map(
        (m): SelectOption<string> => ({
          value: m.value,
          label: m.label,
          description: m.description,
        }),
      ),
    [reviewer.backend, dynamicModels],
  );

  return (
    <Select
      value={reviewer.model ?? 'default'}
      onChange={(value) => onChange(value as ModelPreference)}
      options={modelOptions}
      side="top"
      className="w-[130px]"
    />
  );
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
  defaultThinkingEffort = 'default',
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
    thinkingEffort: ThinkingEffort;
    images: PromptImagePart[];
    start: boolean;
    reviewers?: ReviewerConfig[];
  }) => void;
  defaultBackend?: AgentBackendType;
  defaultModel?: ModelPreference;
  defaultThinkingEffort?: ThinkingEffort | null;
  taskId: string;
  activeStepId?: string;
  projectRoot?: string | null;
  projectId?: string;
}) {
  const layer = useKeyboardLayer('dialog', { exclusive: isOpen });
  const [promptTemplate, setPromptTemplate] = useState('');
  const [presetType, setPresetType] =
    useState<AddStepPresetType>('new-session');
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('ask');
  const [backend, setBackend] = useState<AgentBackendType>(defaultBackend);
  const [model, setModel] = useState<ModelPreference>(defaultModel);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(
    defaultThinkingEffort ?? 'default',
  );
  const [backendModelPresetId, setBackendModelPresetId] = useState<
    string | null
  >(null);
  const [images, setImages] = useState<PromptImagePart[]>([]);
  const [autoStart, setAutoStart] = useState(true);
  const [reviewers, setReviewers] = useState<ReviewerConfig[]>(
    createDefaultReviewers(defaultBackend),
  );
  const textareaRef = useRef<PromptTextareaRef>(null);

  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();
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
  const { data: promptSnippets = [] } = usePromptSnippetsSetting();
  const { data: stepTask } = useTask(taskId);
  const { data: stepProject } = useProject(projectId ?? '');
  const { data: featureMap = null } = useProjectFeatureMap(projectId ?? null);
  const { data: dynamicModels } = useBackendModels(backend);
  const thinkingCapabilities = getModelThinkingCapabilities(
    model,
    dynamicModels,
  );
  const thinkingOptions = getThinkingEffortOptions({
    backend,
    model,
    capabilities: thinkingCapabilities,
  });
  const normalizedThinkingEffort = normalizeThinkingEffortForModel({
    backend,
    model,
    effort: thinkingEffort,
    capabilities: thinkingCapabilities,
  });
  const snippetVariableContext: SnippetVariableContext = useMemo(
    () => ({
      task: stepTask
        ? {
            worktreePath: stepTask.worktreePath,
            name: stepTask.name,
            note: stepTask.prompt,
            sourceBranch: stepTask.sourceBranch,
            branchName: stepTask.branchName,
          }
        : undefined,
      project: stepProject
        ? { name: stepProject.name, path: stepProject.path }
        : undefined,
    }),
    [stepTask, stepProject],
  );

  useEffect(() => {
    if (isOpen) {
      setPromptTemplate('');
      setPresetType('new-session');
      setInteractionMode('ask');
      setBackend(defaultBackend);
      setModel(defaultModel);
      setThinkingEffort(defaultThinkingEffort ?? 'default');
      setBackendModelPresetId(null);
      setImages([]);
      setAutoStart(true);
      setReviewers(createDefaultReviewers(defaultBackend));
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [defaultBackend, defaultModel, defaultThinkingEffort, isOpen]);

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
      promptTemplate: expandFeatureReferencesInPrompt({
        text: promptTemplate.trim(),
        featureMap,
      }),
      presetType,
      interactionMode: normalizeInteractionModeForBackend({
        backend,
        mode: interactionMode,
      }),
      agentBackend: backend,
      modelPreference: model,
      thinkingEffort: normalizedThinkingEffort,
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
    normalizedThinkingEffort,
    images,
    autoStart,
    reviewers,
    featureMap,
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

  useCommands(
    'add-step-dialog',
    [
      isOpen && {
        label: 'Toggle Auto-start',
        shortcut: 'cmd+shift+s',
        hideInCommandPalette: true,
        handler: () => {
          setAutoStart((prev) => !prev);
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;

  return (
    <KeyboardLayerProvider layer={layer}>
      <Modal isOpen={isOpen} onClose={onClose} title="Add Step" size="lg">
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
          {(() => {
            const stepSnippets = promptSnippets.filter(
              (s) => s.enabled && s.contexts.newTaskStep,
            );
            if (stepSnippets.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
                {stepSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    className="bg-bg-2 text-ink-2 hover:bg-bg-3 hover:text-ink-1 rounded-full px-2.5 py-0.5 text-xs transition-colors"
                    onClick={() => {
                      const { output } = resolvePromptSnippet(
                        snippet,
                        snippetVariableContext,
                      );
                      setPromptTemplate(output);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    {snippet.name}
                  </button>
                ))}
              </div>
            );
          })()}
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
            featureMap={featureMap}
            images={images}
            onImageAttach={handleImageAttach}
            onImageRemove={handleImageRemove}
            promptSnippets={promptSnippets}
            snippetVariableContext={snippetVariableContext}
          />
          {presetType === 'review-changes' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-ink-1 text-xs font-medium">
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
                        model: 'default',
                      },
                    ])
                  }
                  variant="ghost"
                  size="sm"
                  icon={<Plus />}
                >
                  Add reviewer
                </Button>
              </div>
              <div className="max-h-[240px] space-y-2 overflow-y-auto">
                {reviewers.map((reviewer, idx) => (
                  <div
                    key={reviewer.id}
                    className="bg-bg-1/50 border-glass-border rounded-md border p-2"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Input
                        size="sm"
                        value={reviewer.label}
                        onChange={(e) =>
                          setReviewers((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, label: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Reviewer label"
                        className="flex-1"
                      />
                      <Select
                        value={reviewer.backend}
                        onChange={(value) =>
                          setReviewers((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    backend: value as AgentBackendType,
                                    model: getDefaultModelForBackend({
                                      backend: value as AgentBackendType,
                                      project: stepProject,
                                      backendDefaultModels:
                                        backendDefaultModelsSetting,
                                    }),
                                  }
                                : r,
                            ),
                          )
                        }
                        options={reviewerBackendOptions}
                        side="top"
                        className="w-[130px]"
                      />
                      <ReviewerModelSelect
                        reviewer={reviewer}
                        onChange={(model) =>
                          setReviewers((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, model } : r,
                            ),
                          )
                        }
                      />
                      <IconButton
                        onClick={() =>
                          setReviewers((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        size="sm"
                        icon={<Trash2 />}
                        tooltip="Remove reviewer"
                      />
                    </div>
                    <Textarea
                      size="sm"
                      value={reviewer.focusPrompt}
                      onChange={(e) =>
                        setReviewers((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, focusPrompt: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="Focus prompt for this reviewer..."
                      rows={2}
                    />
                  </div>
                ))}
              </div>
              {!canSubmit && (
                <p className="text-status-run text-xs">
                  Add at least one reviewer and fill every label/focus prompt.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <ModeSelector
              value={interactionMode}
              onChange={setInteractionMode}
              backend={backend}
              shortcut="cmd+i"
              side="top"
              layer={layer}
            />
            <BackendModelPresetPicker
              backend={backend}
              model={model}
              selectedPresetId={backendModelPresetId}
              backendShortcut="cmd+j"
              modelShortcut="cmd+l"
              side="top"
              layer={layer}
              onChange={(selection) => {
                setBackend(selection.backend);
                setBackendModelPresetId(selection.presetId);
                setModel(selection.model);
                const nextCapabilities = getModelThinkingCapabilities(
                  selection.model,
                  dynamicModels,
                );
                setThinkingEffort(
                  normalizeThinkingEffortForModel({
                    backend: selection.backend,
                    model: selection.model,
                    effort: selection.thinkingEffort ?? 'default',
                    capabilities: nextCapabilities,
                  }),
                );
              }}
            />
            <ThinkingSelector
              value={normalizedThinkingEffort}
              onChange={setThinkingEffort}
              options={thinkingOptions}
              disabled={thinkingOptions.length <= 1}
              side="top"
              layer={layer}
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                size="sm"
                checked={autoStart}
                onChange={setAutoStart}
                label="Auto-start"
              />
              <Kbd shortcut="cmd+shift+s" />
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={onClose} variant="ghost">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                variant="primary"
              >
                Add Step
                <Kbd shortcut="cmd+enter" className="ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </KeyboardLayerProvider>
  );
}
