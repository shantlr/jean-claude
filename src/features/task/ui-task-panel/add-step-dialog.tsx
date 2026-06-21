import { Plus, Trash2 } from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { nanoid } from 'nanoid';



import {
  type AddStepPresetType,
  useAddStepDialogDraft,
  useNavigationStore,
} from '@/stores/navigation';
import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
  getModelThinkingCapabilities,
} from '@/features/agent/ui-backend-selector';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import {
  type InteractionMode,
  type ModelPreference,
  normalizeInteractionModeForBackend,
  type ReviewerConfig,
  type ThinkingEffort,
} from '@shared/types';
import {
  KeyboardLayerProvider,
  useKeyboardLayer,
} from '@/common/context/keyboard-bindings';
import {
  PromptTextarea,
  type PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import {
  RateLimitSwapPreview,
  resolveRateLimitSwapSelection,
  useRateLimitSwapPreview,
} from '@/features/agent/ui-rate-limit-swap-preview';
import {
  resolvePromptSnippet,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import {
  reviewCommentToPill,
  ReviewPillsQueue,
} from '@/features/common/ui-review-pills';
import { Select, type SelectOption } from '@/common/ui/select';
import {
  synthesizeReviewPrompt,
  useReviewComments,
} from '@/stores/review-comments';
import {
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  usePromptSnippetsSetting,
} from '@/hooks/use-settings';
import { useProject, useProjectFeatureMap } from '@/hooks/use-projects';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { expandFeatureReferencesInPrompt } from '@/lib/prompt-feature-context';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { Textarea } from '@/common/ui/textarea';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useCommands } from '@/common/hooks/use-commands';
import { useSkills } from '@/hooks/use-skills';
import { useTask } from '@/hooks/use-tasks';



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

function AddStepPromptSection({
  taskId,
  presetType,
  isOpen,
  skills,
  projectRoot,
  projectId,
  featureMap,
  images,
  promptSnippets,
  snippetVariableContext,
  onEnterKey,
  onImageAttach,
  onImageRemove,
  onAutocompleteOpenChange,
}: {
  taskId: string;
  presetType: AddStepPresetType;
  isOpen: boolean;
  skills: ReturnType<typeof useSkills>['data'];
  projectRoot?: string | null;
  projectId?: string;
  featureMap: ReturnType<typeof useProjectFeatureMap>['data'];
  images: PromptImagePart[];
  promptSnippets: ReturnType<typeof usePromptSnippetsSetting>['data'];
  snippetVariableContext: SnippetVariableContext;
  onEnterKey: (e: KeyboardEvent<HTMLTextAreaElement>) => true | undefined;
  onImageAttach: (image: PromptImagePart) => void;
  onImageRemove: (index: number) => void;
  onAutocompleteOpenChange: (isOpen: boolean) => void;
}) {
  const { draft, setDraft } = useAddStepDialogDraft(taskId);
  const { promptTemplate } = draft;
  const textareaRef = useRef<PromptTextareaRef>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const stepSnippets = useMemo(
    () => promptSnippets.filter((s) => s.enabled && s.contexts.newTaskStep),
    [promptSnippets],
  );

  return (
    <>
      {stepSnippets.length > 0 && (
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
                setDraft({ promptTemplate: output });
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
            >
              {snippet.name}
            </button>
          ))}
        </div>
      )}
      <PromptTextarea
        ref={textareaRef}
        value={promptTemplate}
        onChange={(value) => setDraft({ promptTemplate: value })}
        onEnterKey={onEnterKey}
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
        onImageAttach={onImageAttach}
        onImageRemove={onImageRemove}
        promptSnippets={promptSnippets}
        snippetVariableContext={snippetVariableContext}
        onAutocompleteOpenChange={onAutocompleteOpenChange}
      />
    </>
  );
}

function AddStepSubmitButton({
  taskId,
  presetType,
  hasReviewComments,
  reviewersValid,
  onSubmit,
}: {
  taskId: string;
  presetType: AddStepPresetType;
  hasReviewComments: boolean;
  reviewersValid: boolean;
  onSubmit: () => void;
}) {
  const promptTemplate = useNavigationStore(
    (state) => state.addStepDrafts[taskId]?.promptTemplate ?? '',
  );
  const canSubmit =
    presetType === 'review-changes'
      ? reviewersValid
      : promptTemplate.trim().length > 0 || hasReviewComments;

  return (
    <Button
      type="button"
      onClick={onSubmit}
      disabled={!canSubmit}
      variant="primary"
    >
      Add Step
      <Kbd shortcut="cmd+enter" className="ml-1" />
    </Button>
  );
}

function AddStepDialogFooter({
  taskId,
  presetType,
  hasReviewComments,
  reviewersValid,
  autoStart,
  onAutoStartChange,
  onClose,
  onSubmit,
}: {
  taskId: string;
  presetType: AddStepPresetType;
  hasReviewComments: boolean;
  reviewersValid: boolean;
  autoStart: boolean;
  onAutoStartChange: (enabled: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-2">
        <Checkbox
          size="sm"
          checked={autoStart}
          onChange={onAutoStartChange}
          label="Auto-start"
        />
        <Kbd shortcut="cmd+shift+s" />
      </div>
      <div className="flex gap-3">
        <Button type="button" onClick={onClose} variant="ghost">
          Cancel
        </Button>
        <AddStepSubmitButton
          taskId={taskId}
          presetType={presetType}
          hasReviewComments={hasReviewComments}
          reviewersValid={reviewersValid}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

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
    hasUserPrompt: boolean;
    presetType: AddStepPresetType;
    interactionMode: InteractionMode;
    agentBackend: AgentBackendType;
    modelPreference: ModelPreference;
    thinkingEffort: ThinkingEffort;
    images: PromptImagePart[];
    start: boolean;
    includedReviewCommentIds: string[];
    reviewers?: ReviewerConfig[];
  }) => boolean | Promise<boolean>;
  defaultBackend?: AgentBackendType;
  defaultModel?: ModelPreference;
  defaultThinkingEffort?: ThinkingEffort | null;
  taskId: string;
  activeStepId?: string;
  projectRoot?: string | null;
  projectId?: string;
}) {
  const layer = useKeyboardLayer('dialog', { exclusive: isOpen });
  const presetType = useNavigationStore(
    (state) => state.addStepDrafts[taskId]?.presetType ?? 'new-session',
  );
  const setDraftAction = useNavigationStore((state) => state.setAddStepDraft);
  const clearDraftAction = useNavigationStore(
    (state) => state.clearAddStepDraft,
  );
  const setDraft = useCallback(
    (
      update: Partial<{
        promptTemplate: string;
        presetType: AddStepPresetType;
      }>,
    ) => setDraftAction(taskId, update),
    [taskId, setDraftAction],
  );
  const clearDraft = useCallback(
    () => clearDraftAction(taskId),
    [taskId, clearDraftAction],
  );
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
  const [includeReviewComments, setIncludeReviewComments] = useState(true);
  const [showReviewPreview, setShowReviewPreview] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [reviewers, setReviewers] = useState<ReviewerConfig[]>(
    createDefaultReviewers(defaultBackend),
  );
  const userTouchedSelectionRef = useRef(false);
  const [userTouchedSelection, setUserTouchedSelection] = useState(false);
  const markUserTouchedSelection = useCallback(() => {
    userTouchedSelectionRef.current = true;
    setUserTouchedSelection(true);
  }, []);

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
  const reviewComments = useReviewComments(taskId);
  const openReviewComments = useMemo(
    () => reviewComments.filter((comment) => !comment.resolved),
    [reviewComments],
  );
  const reviewPills = useMemo(
    () => openReviewComments.map(reviewCommentToPill),
    [openReviewComments],
  );
  const reviewPromptParts = useMemo(
    () => synthesizeReviewPrompt(openReviewComments),
    [openReviewComments],
  );
  const reviewPromptText = useMemo(
    () =>
      reviewPromptParts
        ?.filter(
          (part): part is { type: 'text'; text: string } =>
            part.type === 'text',
        )
        .map((part) => part.text)
        .join('\n') ?? '',
    [reviewPromptParts],
  );
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
  const { data: rateLimitSuggestion } = useRateLimitSwapPreview(
    backend,
    isOpen && presetType !== 'review-changes' && !userTouchedSelection,
  );
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
      userTouchedSelectionRef.current = false;
      startTransition(() => setUserTouchedSelection(false));
      startTransition(() => setInteractionMode('ask'));
      startTransition(() => setBackend(defaultBackend));
      startTransition(() => setModel(defaultModel));
      startTransition(() => setThinkingEffort(defaultThinkingEffort ?? 'default'));
      startTransition(() => setBackendModelPresetId(null));
      startTransition(() => setImages([]));
      startTransition(() => setAutoStart(true));
      startTransition(() => setIncludeReviewComments(true));
      startTransition(() => setShowReviewPreview(false));
      startTransition(() => setIsAutocompleteOpen(false));
      startTransition(() => setReviewers(createDefaultReviewers(defaultBackend)));
    }
  }, [defaultBackend, defaultModel, defaultThinkingEffort, isOpen]);

  useEffect(() => {
    if (
      !isOpen ||
      presetType === 'review-changes' ||
      !rateLimitSuggestion?.swapped ||
      userTouchedSelection
    ) {
      return;
    }

    const nextBackend = rateLimitSuggestion.backend;
    startTransition(() => setBackend(nextBackend));
    startTransition(() => setBackendModelPresetId(null));
    startTransition(() =>
      setModel(
        rateLimitSuggestion.model ??
          (nextBackend !== backend ? 'default' : model),
      ),
    );
    startTransition(() =>
      setThinkingEffort(
        rateLimitSuggestion.thinkingEffort ??
          (nextBackend !== backend ? 'default' : normalizedThinkingEffort),
      ),
    );
    startTransition(() =>
      setInteractionMode((mode) =>
        normalizeInteractionModeForBackend({ backend: nextBackend, mode }),
      ),
    );
  }, [
    backend,
    isOpen,
    model,
    normalizedThinkingEffort,
    presetType,
    rateLimitSuggestion,
    userTouchedSelection,
  ]);

  const reviewersValid =
    reviewers.length > 0 &&
    reviewers.every(
      (reviewer) =>
        reviewer.label.trim().length > 0 &&
        reviewer.focusPrompt.trim().length > 0,
    );

  const handleSubmit = useCallback(async () => {
    const currentDraft = useNavigationStore.getState().addStepDrafts[taskId];
    const promptTemplate = currentDraft?.promptTemplate ?? '';
    const submitPresetType = currentDraft?.presetType ?? 'new-session';
    const canSubmit =
      submitPresetType === 'review-changes'
        ? reviewersValid
        : promptTemplate.trim().length > 0 ||
          (includeReviewComments && openReviewComments.length > 0);
    if (!canSubmit) return;
    const submitSelection = await resolveRateLimitSwapSelection({
      backend,
      model,
      thinkingEffort: normalizedThinkingEffort,
      enabled: submitPresetType !== 'review-changes',
    });

    const expandedPrompt = expandFeatureReferencesInPrompt({
      text: promptTemplate.trim(),
      featureMap,
    });
    const shouldIncludeReviewComments =
      includeReviewComments && openReviewComments.length > 0;
    const reviewParts = shouldIncludeReviewComments ? reviewPromptParts : null;
    const reviewText =
      reviewParts
        ?.filter(
          (part): part is { type: 'text'; text: string } =>
            part.type === 'text',
        )
        .map((part) => part.text)
        .join('\n') ?? '';
    const reviewImages =
      reviewParts?.filter(
        (part): part is PromptImagePart => part.type === 'image',
      ) ?? [];

    const didConfirm = await onConfirm({
      promptTemplate: [expandedPrompt, reviewText]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
      hasUserPrompt: expandedPrompt.trim().length > 0,
      presetType: submitPresetType,
      interactionMode: normalizeInteractionModeForBackend({
        backend: submitSelection.backend,
        mode: interactionMode,
      }),
      agentBackend: submitSelection.backend,
      modelPreference: submitSelection.model,
      thinkingEffort: submitSelection.thinkingEffort as ThinkingEffort,
      images: [...images, ...reviewImages],
      start: autoStart,
      includedReviewCommentIds: shouldIncludeReviewComments
        ? openReviewComments.map((comment) => comment.id)
        : [],
      reviewers:
        submitPresetType === 'review-changes'
          ? reviewers.map((reviewer) => ({
              ...reviewer,
              label: reviewer.label.trim(),
              focusPrompt: reviewer.focusPrompt.trim(),
            }))
          : undefined,
    });
    if (didConfirm) clearDraft();
  }, [
    taskId,
    onConfirm,
    interactionMode,
    backend,
    model,
    normalizedThinkingEffort,
    images,
    autoStart,
    reviewers,
    reviewersValid,
    featureMap,
    includeReviewComments,
    openReviewComments,
    reviewPromptParts,
    clearDraft,
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
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Add Step"
        size="lg"
        closeOnEscape={!isAutocompleteOpen}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Select
              value={presetType}
              onChange={(value) =>
                setDraft({ presetType: value as AddStepPresetType })
              }
              options={[...STEP_PRESET_OPTIONS]}
              shortcut="cmd+t"
              side="top"
            />
          </div>
          <AddStepPromptSection
            taskId={taskId}
            presetType={presetType}
            isOpen={isOpen}
            skills={skills}
            projectRoot={projectRoot}
            projectId={projectId}
            featureMap={featureMap}
            images={images}
            promptSnippets={promptSnippets}
            snippetVariableContext={snippetVariableContext}
            onEnterKey={handleEnterKey}
            onImageAttach={handleImageAttach}
            onImageRemove={handleImageRemove}
            onAutocompleteOpenChange={setIsAutocompleteOpen}
          />
          {openReviewComments.length > 0 && (
            <div className="border-line bg-bg-1/50 rounded-lg border py-2">
              <div className="flex items-center justify-between px-3 pb-1.5">
                <Checkbox
                  size="sm"
                  checked={includeReviewComments}
                  onChange={setIncludeReviewComments}
                  label={`Include current comments (${openReviewComments.length})`}
                />
              </div>
              <ReviewPillsQueue
                pills={reviewPills}
                onPreview={
                  reviewPromptText
                    ? () => setShowReviewPreview(true)
                    : undefined
                }
              />
            </div>
          )}
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
              {!reviewersValid && (
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
                markUserTouchedSelection();
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
              onChange={(nextThinkingEffort) => {
                markUserTouchedSelection();
                setThinkingEffort(nextThinkingEffort);
              }}
              options={thinkingOptions}
              disabled={thinkingOptions.length <= 1}
              side="top"
              layer={layer}
            />
            {presetType !== 'review-changes' && (
              <RateLimitSwapPreview
                requestedBackend={backend}
                model={model}
                thinkingEffort={normalizedThinkingEffort}
                onApplySuggestion={(selection) => {
                  markUserTouchedSelection();
                  setBackend(selection.backend);
                  setBackendModelPresetId(null);
                  setModel(selection.model as ModelPreference);
                  setThinkingEffort(selection.thinkingEffort as ThinkingEffort);
                  setInteractionMode((mode) =>
                    normalizeInteractionModeForBackend({
                      backend: selection.backend,
                      mode,
                    }),
                  );
                }}
              />
            )}
          </div>
          <AddStepDialogFooter
            taskId={taskId}
            presetType={presetType}
            hasReviewComments={
              includeReviewComments && openReviewComments.length > 0
            }
            reviewersValid={reviewersValid}
            autoStart={autoStart}
            onAutoStartChange={setAutoStart}
            onClose={onClose}
            onSubmit={handleSubmit}
          />
        </div>
        {showReviewPreview && (
          <Modal
            isOpen={showReviewPreview}
            onClose={() => setShowReviewPreview(false)}
            title="Review prompt preview"
            size="lg"
          >
            <pre className="bg-bg-2 text-ink-1 max-h-[60vh] overflow-auto rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap">
              {reviewPromptText}
            </pre>
          </Modal>
        )}
      </Modal>
    </KeyboardLayerProvider>
  );
}
