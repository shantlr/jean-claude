import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { getModelsForBackend } from '@/features/agent/ui-backend-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useManagedSkills } from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AiSkillSlotConfig, AiSkillSlotKey } from '@shared/types';

/** Sentinel value used when no skill is selected in the dropdown. */
const NO_SKILL_VALUE = '__none__';

/** Default model for claude-code slots. */
export const DEFAULT_CLAUDE_CODE_MODEL = 'haiku';

export const SLOT_DEFINITIONS: {
  key: AiSkillSlotKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'merge-commit-message',
    label: 'Merge Commit Message',
    description: 'Auto-generate commit messages when squash-merging worktrees',
  },
  {
    key: 'commit-message',
    label: 'Commit Message',
    description: 'Auto-generate commit messages when committing changes',
  },
  {
    key: 'pr-description',
    label: 'PR Description',
    description:
      'Auto-generate pull request title and description when creating a PR',
  },
];

export function SlotRow({
  label,
  description,
  config,
  enabledBackends,
  onUpdate,
}: {
  label: string;
  description: string;
  config: AiSkillSlotConfig | null;
  enabledBackends: { value: AgentBackendType; label: string }[];
  onUpdate: (config: AiSkillSlotConfig | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isEnabled = config !== null;

  // Local editing state
  const [localBackend, setLocalBackend] = useState<AgentBackendType>(
    config?.backend ?? 'claude-code',
  );
  const [localModel, setLocalModel] = useState(
    config?.model ?? DEFAULT_CLAUDE_CODE_MODEL,
  );
  const [localSkillName, setLocalSkillName] = useState<string | null>(
    config?.skillName ?? null,
  );

  // Sync local state when external config changes (e.g., query refetch)
  useEffect(() => {
    if (!expanded) {
      setLocalBackend(config?.backend ?? 'claude-code');
      setLocalModel(config?.model ?? DEFAULT_CLAUDE_CODE_MODEL);
      setLocalSkillName(config?.skillName ?? null);
    }
  }, [config, expanded]);

  // Dynamic models for the selected backend
  const { data: dynamicModels } = useBackendModels(localBackend);
  const modelOptions = useMemo(
    () =>
      getModelsForBackend(localBackend, dynamicModels).map((m) => ({
        value: m.value,
        label: m.label,
      })),
    [localBackend, dynamicModels],
  );

  // Skills for the selected backend (enabled only)
  const { data: skills } = useManagedSkills(localBackend);
  const enabledSkills = useMemo(
    () =>
      (skills ?? []).filter((s) => s.enabledBackends[localBackend] === true),
    [skills, localBackend],
  );

  const skillOptions = useMemo(
    () => [
      { value: NO_SKILL_VALUE, label: 'None' },
      ...enabledSkills.map((s) => ({
        value: s.name,
        label: s.name,
      })),
    ],
    [enabledSkills],
  );

  const hasSkillSelected = localSkillName !== null;

  const handleBackendChange = useCallback((backend: string) => {
    const backendType = backend as AgentBackendType;
    setLocalBackend(backendType);
    setLocalModel(
      backendType === 'claude-code' ? DEFAULT_CLAUDE_CODE_MODEL : 'default',
    );
    setLocalSkillName(null);
  }, []);

  const handleSave = useCallback(() => {
    onUpdate({
      backend: localBackend,
      model: localModel,
      skillName: localSkillName,
    });
    setExpanded(false);
  }, [localBackend, localModel, localSkillName, onUpdate]);

  const handleCancel = useCallback(() => {
    // Reset to current config
    setLocalBackend(config?.backend ?? 'claude-code');
    setLocalModel(config?.model ?? DEFAULT_CLAUDE_CODE_MODEL);
    setLocalSkillName(config?.skillName ?? null);
    setExpanded(false);
  }, [config]);

  const handleToggleEnabled = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Enable: save current local config (only possible when skill is selected)
        onUpdate({
          backend: localBackend,
          model: localModel,
          skillName: localSkillName,
        });
      } else {
        // Disable: clear config
        onUpdate(null);
      }
    },
    [localBackend, localModel, localSkillName, onUpdate],
  );

  const handleToggle = useCallback(() => {
    if (!expanded) {
      // Opening: reset local state from config
      setLocalBackend(config?.backend ?? 'claude-code');
      setLocalModel(config?.model ?? DEFAULT_CLAUDE_CODE_MODEL);
      setLocalSkillName(config?.skillName ?? null);
    }
    setExpanded((prev) => !prev);
  }, [expanded, config]);

  // Build summary string
  const summary = config
    ? [
        enabledBackends.find((b) => b.value === config.backend)?.label ??
          config.backend,
        config.model,
        config.skillName,
      ]
        .filter(Boolean)
        .join(' \u00b7 ')
    : 'Not configured';

  const backendOptions = enabledBackends.map((b) => ({
    value: b.value,
    label: b.label,
  }));

  // Can only enable the toggle when a skill is selected
  const canEnable = hasSkillSelected;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800">
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-neutral-200">{label}</div>
          <div className="text-xs text-neutral-500">{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">{summary}</span>
          {!config && (
            <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-500">
              Disabled
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-neutral-700 px-4 py-3">
          <div className="space-y-3">
            {/* Backend */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-neutral-400">Backend</label>
              <Select
                value={localBackend}
                options={backendOptions}
                onChange={handleBackendChange}
                label="Backend"
              />
            </div>

            {/* Model */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-neutral-400">Model</label>
              <Select
                value={localModel}
                options={modelOptions}
                onChange={setLocalModel}
                label="Model"
              />
            </div>

            {/* Skill */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-neutral-400">Skill</label>
              <Select
                value={localSkillName ?? NO_SKILL_VALUE}
                options={skillOptions}
                onChange={(v) =>
                  setLocalSkillName(v === NO_SKILL_VALUE ? null : v)
                }
                label="Skill"
              />
            </div>

            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <label className="text-sm text-neutral-400">Enabled</label>
                {!canEnable && !isEnabled && (
                  <span className="text-xs text-neutral-600">
                    Select a skill to enable
                  </span>
                )}
              </div>
              <Switch
                checked={isEnabled}
                onChange={handleToggleEnabled}
                disabled={!canEnable && !isEnabled}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-end">
            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
