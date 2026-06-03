import { Eye, GitPullRequest } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Modal } from '@/common/ui/modal';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { getModelThinkingCapabilities } from '@/features/agent/ui-backend-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useBackendsSetting,
  useThinkingSettingsSetting,
} from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import type { ModelPreference, ThinkingEffort } from '@shared/types';

export function PrReviewSetupDialog({
  isOpen,
  onClose,
  onConfirm,
  prId,
  prTitle,
  defaultBackend,
  defaultModel,
  defaultThinkingEffort,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    agentBackend: AgentBackendType;
    modelPreference: ModelPreference;
    thinkingEffort: ThinkingEffort;
  }) => void;
  prId: number;
  prTitle: string;
  defaultBackend: AgentBackendType;
  defaultModel: ModelPreference;
  defaultThinkingEffort: ThinkingEffort;
  isCreating: boolean;
}) {
  const [backend, setBackend] = useState<AgentBackendType>(defaultBackend);
  const [model, setModel] = useState<ModelPreference>(defaultModel);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(
    defaultThinkingEffort,
  );
  const [backendModelPresetId, setBackendModelPresetId] = useState<
    string | null
  >(null);

  const { data: backendsSetting } = useBackendsSetting();
  const { data: thinkingSettings } = useThinkingSettingsSetting();
  const { data: dynamicModels } = useBackendModels(backend);

  const enabledBackends =
    backendsSetting?.enabledBackends ??
    ([defaultBackend] as AgentBackendType[]);

  useEffect(() => {
    if (!isOpen) return;
    setBackend(defaultBackend);
    setModel(defaultModel);
    setThinkingEffort(defaultThinkingEffort);
    setBackendModelPresetId(null);
  }, [defaultBackend, defaultModel, defaultThinkingEffort, isOpen]);

  const availableThinkingOptions = useMemo(() => {
    return getThinkingEffortOptions({
      backend,
      model,
      capabilities: getModelThinkingCapabilities(model, dynamicModels),
    });
  }, [backend, dynamicModels, model]);

  const selectedThinkingEffort = useMemo(() => {
    return normalizeThinkingEffortForModel({
      backend,
      model,
      effort: thinkingEffort,
      capabilities: getModelThinkingCapabilities(model, dynamicModels),
    });
  }, [backend, dynamicModels, model, thinkingEffort]);

  const handleConfirm = useCallback(() => {
    onConfirm({
      agentBackend: backend,
      modelPreference: model,
      thinkingEffort: selectedThinkingEffort,
    });
  }, [backend, model, onConfirm, selectedThinkingEffort]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isCreating ? () => {} : onClose}
      title="Configure PR Review"
      size="lg"
      closeOnClickOutside={!isCreating}
      closeOnEscape={!isCreating}
    >
      <div className="space-y-5">
        <div className="border-glass-border bg-bg-2/60 rounded-lg border p-3">
          <div className="text-ink-3 mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wide uppercase">
            <GitPullRequest className="h-3.5 w-3.5" />
            Review target
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <span className="text-acc-ink shrink-0 font-mono text-sm">
              #{prId}
            </span>
            <p className="text-ink-0 min-w-0 text-sm leading-relaxed break-words">
              {prTitle}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-ink-1 text-sm font-medium">Agent setup</h3>
            <p className="text-ink-3 mt-1 text-xs">
              Creates a task on the PR branch, runs focused review agents, then
              lets you approve suggested inline comments before posting them to
              the PR.
            </p>
            <p className="text-ink-3 mt-1 text-xs">
              Selection below is used for the review coordinator and each
              focused reviewer spawned during the review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BackendModelPresetPicker
              backend={backend}
              model={model}
              selectedPresetId={backendModelPresetId}
              enabledBackends={enabledBackends}
              side="top"
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
                    effort:
                      selection.thinkingEffort ??
                      thinkingSettings?.efforts[selection.backend]?.[
                        selection.model
                      ] ??
                      thinkingSettings?.efforts[selection.backend]?.default ??
                      'default',
                    capabilities: nextCapabilities,
                  }),
                );
              }}
              disabled={isCreating}
            />
            <ThinkingSelector
              value={selectedThinkingEffort}
              options={availableThinkingOptions}
              onChange={setThinkingEffort}
              disabled={isCreating || availableThinkingOptions.length <= 1}
              side="top"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            icon={<Eye className="h-3.5 w-3.5" />}
            loading={isCreating}
            disabled={isCreating}
            onClick={handleConfirm}
          >
            Create Review
          </Button>
        </div>
      </div>
    </Modal>
  );
}
