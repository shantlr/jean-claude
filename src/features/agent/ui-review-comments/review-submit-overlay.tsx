import { ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentBackendType, PromptPart } from '@shared/agent-backend-types';
import {
  KeyboardLayerProvider,
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import type { ModelPreference, TaskStep } from '@shared/types';
import {
  useBackendDefaultModelsSetting,
  useBackendsSetting,
} from '@/hooks/use-settings';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { getModelsForBackend } from '@/features/agent/ui-backend-selector';
import type { ReviewComment } from '@/stores/review-comments';
import { synthesizeReviewPrompt } from '@/stores/review-comments';
import { useBackendModels } from '@/hooks/use-backend-models';



export interface ReviewSubmitTargetConfig {
  agentBackend: AgentBackendType;
  modelPreference: ModelPreference;
}

export function ReviewSubmitOverlay(props: {
  comments: ReviewComment[];
  steps?: TaskStep[];
  activeStepId?: string | null;
  onSubmit: (
    parts: PromptPart[],
    targetStepId: string | null,
    targetConfig?: ReviewSubmitTargetConfig,
  ) => void;
  onClose: () => void;
}) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  return (
    <KeyboardLayerProvider layer={layer}>
      <ReviewSubmitOverlayContent {...props} />
    </KeyboardLayerProvider>
  );
}

function ReviewSubmitOverlayContent({
  comments,
  steps,
  activeStepId,
  onSubmit,
  onClose,
}: {
  comments: ReviewComment[];
  steps?: TaskStep[];
  activeStepId?: string | null;
  onSubmit: (
    parts: PromptPart[],
    targetStepId: string | null,
    targetConfig?: ReviewSubmitTargetConfig,
  ) => void;
  onClose: () => void;
}) {
  const [globalIntent, setGlobalIntent] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const activeStep = useMemo(
    () => steps?.find((step) => step.id === activeStepId) ?? null,
    [activeStepId, steps],
  );
  const [newStepBackendOverride, setNewStepBackendOverride] =
    useState<AgentBackendType | null>(null);
  const [newStepModelOverride, setNewStepModelOverride] =
    useState<ModelPreference | null>(null);
  const [newStepPresetId, setNewStepPresetId] = useState<string | null>(null);
  const [targetSelection, setTargetSelection] = useState<
    | { type: 'follow-active' }
    | { type: 'existing'; stepId: string }
    | { type: 'new' }
  >(activeStepId ? { type: 'follow-active' } : { type: 'new' });
  const selectedStepId =
    targetSelection.type === 'follow-active'
      ? (activeStepId ?? null)
      : targetSelection.type === 'existing'
        ? targetSelection.stepId
        : null;
  const backendsSettingQuery = useBackendsSetting();
  const backendDefaultModelsQuery = useBackendDefaultModelsSetting();
  const backendsSetting = backendsSettingQuery.data;
  const backendDefaultModels = backendDefaultModelsQuery.data;
  const enabledBackends = useMemo(
    () =>
      backendsSetting?.enabledBackends ??
      ([activeStep?.agentBackend ?? 'claude-code'] as AgentBackendType[]),
    [activeStep?.agentBackend, backendsSetting?.enabledBackends],
  );
  const defaultNewStepBackend = useMemo(() => {
    const activeBackend = activeStep?.agentBackend ?? 'claude-code';
    if (enabledBackends.includes(activeBackend)) {
      return activeBackend;
    }

    return enabledBackends[0] ?? 'claude-code';
  }, [activeStep?.agentBackend, enabledBackends]);
  const effectiveNewStepBackend =
    newStepBackendOverride ?? defaultNewStepBackend;
  const backendModelsQuery = useBackendModels(effectiveNewStepBackend);
  const dynamicModels = backendModelsQuery.data;
  const availableModels = useMemo(
    () => getModelsForBackend(effectiveNewStepBackend, dynamicModels),
    [dynamicModels, effectiveNewStepBackend],
  );
  const defaultNewStepModel =
    effectiveNewStepBackend === defaultNewStepBackend
      ? (activeStep?.modelPreference ??
        getDefaultModelForBackend({
          backend: effectiveNewStepBackend,
          backendDefaultModels,
        }))
      : getDefaultModelForBackend({
          backend: effectiveNewStepBackend,
          backendDefaultModels,
        });
  const effectiveNewStepModel = newStepModelOverride ?? defaultNewStepModel;
  useEffect(() => {
    const hasResolvedModels =
      effectiveNewStepBackend === 'claude-code' || backendModelsQuery.isFetched;

    if (
      hasResolvedModels &&
      !availableModels.some((model) => model.value === effectiveNewStepModel)
    ) {
      startTransition(() => setNewStepModelOverride('default'));
    }
  }, [
    availableModels,
    backendModelsQuery.isFetched,
    effectiveNewStepBackend,
    effectiveNewStepModel,
  ]);

  const openComments = useMemo(
    () => comments.filter((c) => !c.resolved),
    [comments],
  );

  const synthesized = useMemo(
    () => synthesizeReviewPrompt(openComments, globalIntent),
    [openComments, globalIntent],
  );

  const synthesizedText = useMemo(() => {
    if (!synthesized) return null;
    const textPart = synthesized.find((p) => p.type === 'text');
    return textPart?.type === 'text' ? textPart.text : null;
  }, [synthesized]);

  const isNewStepConfigReady =
    backendsSettingQuery.isFetched &&
    (effectiveNewStepBackend === 'claude-code' ||
      backendModelsQuery.isFetched) &&
    availableModels.some((model) => model.value === effectiveNewStepModel);
  const canSubmit =
    openComments.length > 0 &&
    (selectedStepId !== null || isNewStepConfigReady);

  const handleSubmit = useCallback(() => {
    if (synthesized && canSubmit) {
      onSubmit(
        synthesized,
        selectedStepId,
        selectedStepId
          ? undefined
          : {
              agentBackend: effectiveNewStepBackend,
              modelPreference: effectiveNewStepModel,
            },
      );
    }
  }, [
    canSubmit,
    synthesized,
    selectedStepId,
    onSubmit,
    effectiveNewStepBackend,
    effectiveNewStepModel,
  ]);

  // cmd+enter to submit, escape to close
  useRegisterKeyboardBindings('review-submit-overlay', {
    'cmd+enter': () => {
      if (openComments.length > 0 && synthesized) {
        handleSubmit();
        return true;
      }
      return false;
    },
    escape: () => {
      onClose();
      return true;
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submit review"
      className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'oklch(0.06 0.012 275 / 0.78)' }}
    >
      <div className="bg-bg-1 border-line flex max-h-[92%] w-[720px] flex-col overflow-hidden rounded-lg border shadow-2xl">
        {/* Header */}
        <div className="border-line-soft flex items-center gap-2.5 border-b px-4 py-3.5">
          <Send className="text-acc-ink h-3.5 w-3.5" />
          <div className="flex-1">
            <div className="text-ink-0 text-[13px] font-medium">
              Submit review
            </div>
            <div className="text-ink-3 text-[11.5px]">
              {openComments.length} comment
              {openComments.length !== 1 ? 's' : ''} {'\u2192'} next iteration
            </div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Global intent */}
        <div className="border-line-soft border-b px-4 py-3.5">
          <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium tracking-wider uppercase">
            Overall intent{' '}
            <span className="tracking-normal normal-case">(optional)</span>
          </div>
          <textarea
            value={globalIntent}
            onChange={(e) => setGlobalIntent(e.target.value)}
            placeholder="e.g. 'don't change behaviour, just clean up imports & ordering'"
            rows={2}
            className="border-line bg-bg-0 text-ink-1 placeholder:text-ink-4 focus:border-acc-line w-full resize-none rounded border px-2.5 py-2 text-xs outline-none"
          />
        </div>

        {/* Step selector */}
        {steps && steps.length > 0 && (
          <div className="border-line-soft border-b px-4 py-3.5">
            <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium tracking-wider uppercase">
              Send to step
            </div>
            <select
              value={
                targetSelection.type === 'follow-active'
                  ? '__active__'
                  : (selectedStepId ?? '__new__')
              }
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setTargetSelection({ type: 'new' });
                  return;
                }

                if (e.target.value === '__active__') {
                  setTargetSelection({ type: 'follow-active' });
                  return;
                }

                setTargetSelection({
                  type: 'existing',
                  stepId: e.target.value,
                });
              }}
              className="border-line bg-bg-0 text-ink-1 focus:border-acc-line w-full rounded border px-2.5 py-2 text-xs outline-none"
            >
              <option value="__new__">+ New step</option>
              {activeStepId && (
                <option value="__active__">Current active step</option>
              )}
              {steps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.name}
                  {step.id === activeStepId ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedStepId === null && (
          <div className="border-line-soft border-b px-4 py-3.5">
            <div className="text-ink-4 mb-1.5 text-[10.5px] font-medium tracking-wider uppercase">
              New step settings
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <BackendModelPresetPicker
                backend={effectiveNewStepBackend}
                model={effectiveNewStepModel}
                selectedPresetId={newStepPresetId}
                side="top"
                modelClassName="w-[130px]"
                onChange={(selection) => {
                  setNewStepBackendOverride(selection.backend);
                  setNewStepPresetId(selection.presetId);
                  setNewStepModelOverride(selection.model);
                }}
              />
            </div>
            {!backendsSettingQuery.isFetched ? (
              <div className="text-ink-4 mt-2 text-[11px]">
                Loading backend settings...
              </div>
            ) : (
              effectiveNewStepBackend !== 'claude-code' &&
              backendModelsQuery.isLoading && (
                <div className="text-ink-4 mt-2 text-[11px]">
                  Loading models for the selected backend...
                </div>
              )
            )}
          </div>
        )}

        {/* Comment cards */}
        <div className="flex-1 overflow-y-auto px-4 py-2.5">
          <div className="text-ink-4 mb-2 text-[10.5px] font-medium tracking-wider uppercase">
            Inline comments ({openComments.length})
          </div>
          <div className="flex flex-col gap-2">
            {openComments.map((c, i) => {
              const lineLabel = c.anchor.lineEnd
                ? `L${c.anchor.lineStart}-${c.anchor.lineEnd}`
                : `L${c.anchor.lineStart}`;
              const anchor = `${c.anchor.filePath}:${lineLabel}`;
              return (
                <div
                  key={c.id}
                  className="border-line-soft bg-bg-0 grid grid-cols-[24px_1fr] gap-2.5 rounded border px-2.5 py-2"
                >
                  <div className="bg-acc-soft text-acc-ink flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[10px] font-semibold">
                    {i + 1}
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className="text-acc-ink font-mono text-[10.5px]">
                        {anchor}
                      </span>
                      {c.presets.map((p) => (
                        <span
                          key={p}
                          className="bg-bg-2 text-ink-2 rounded-full px-1.5 font-mono text-[9.5px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="text-ink-1 text-xs leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </div>
                    {c.images && c.images.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {c.images.map((img, imgIdx) => (
                          <img
                            key={imgIdx}
                            src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                            alt={img.filename || 'Attached'}
                            className="h-8 w-8 rounded border border-white/10 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synthesized prompt preview (collapsible) */}
        <div className="border-line-soft bg-bg-0 border-t">
          <button
            onClick={() => setShowPromptPreview((s) => !s)}
            className="text-ink-2 flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11.5px]"
          >
            {showPromptPreview ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-medium">
              Preview the prompt sent to the agent
            </span>
            <span className="text-ink-4 ml-auto text-[10.5px]">
              {showPromptPreview
                ? 'read-only'
                : `${synthesizedText?.length ?? 0} chars`}
            </span>
          </button>
          {showPromptPreview && synthesizedText && (
            <div className="px-4 pb-3.5">
              <div className="border-line bg-bg-1 max-h-[200px] overflow-y-auto rounded border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {synthesizedText}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-line-soft bg-bg-1 flex items-center gap-2 border-t px-4 py-3">
          <span className="text-ink-3 text-[11px]">
            {selectedStepId
              ? `Prompt will be sent to "${steps?.find((s) => s.id === selectedStepId)?.name ?? 'step'}".`
              : `A new ${effectiveNewStepBackend === 'opencode' ? 'OpenCode' : 'Claude Code'} step will be created from this review.`}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="border-line text-ink-2 hover:bg-bg-2 rounded border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-acc inline-flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Submit review
            <kbd className="ml-1 text-[10px] opacity-70">⌘↵</kbd>
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
