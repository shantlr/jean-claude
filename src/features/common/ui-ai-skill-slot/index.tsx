import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
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
  {
    key: 'task-name',
    label: 'Task Name',
    description:
      'Auto-generate short task names from prompts (defaults to builtin skill with Haiku)',
  },
];

export function SlotDetail({
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
  const isEnabled = config !== null;

  // Local editing state
  const [localBackend, setLocalBackend] = useState<AgentBackendType>(
    config?.backend ?? 'claude-code',
  );
  const [localModel, setLocalModel] = useState(
    config?.model ?? DEFAULT_CLAUDE_CODE_MODEL,
  );
  const [localPresetId, setLocalPresetId] = useState<string | null>(null);
  const [localSkillName, setLocalSkillName] = useState<string | null>(
    config?.skillName ?? null,
  );

  // Sync local state when external config changes (e.g., query refetch)
  useEffect(() => {
    setLocalBackend(config?.backend ?? 'claude-code');
    setLocalModel(config?.model ?? DEFAULT_CLAUDE_CODE_MODEL);
    setLocalPresetId(null);
    setLocalSkillName(config?.skillName ?? null);
  }, [config]);

  // Skills for the selected backend (enabled or builtin)
  const { data: skills } = useManagedSkills(localBackend);
  const enabledSkills = useMemo(
    () =>
      (skills ?? []).filter(
        (s) =>
          s.enabledBackends[localBackend] === true || s.source === 'builtin',
      ),
    [skills, localBackend],
  );

  const skillOptions = useMemo(() => {
    const builtin = enabledSkills
      .filter((s) => s.source === 'builtin')
      .map((s) => ({
        value: s.name,
        label: `${s.name} (Builtin)`,
      }));
    const other = enabledSkills
      .filter((s) => s.source !== 'builtin')
      .map((s) => ({
        value: s.name,
        label: s.name,
      }));
    return [{ value: NO_SKILL_VALUE, label: 'None' }, ...builtin, ...other];
  }, [enabledSkills]);

  const handleSave = useCallback(() => {
    onUpdate({
      backend: localBackend,
      model: localModel,
      skillName: localSkillName,
    });
  }, [localBackend, localModel, localSkillName, onUpdate]);

  const handleCancel = useCallback(() => {
    // Reset to current config
    setLocalBackend(config?.backend ?? 'claude-code');
    setLocalModel(config?.model ?? DEFAULT_CLAUDE_CODE_MODEL);
    setLocalPresetId(null);
    setLocalSkillName(config?.skillName ?? null);
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

  // Build summary string
  const summary = config
    ? [
        enabledBackends.find((b) => b.value === config.backend)?.label ??
          config.backend,
        config.model,
        config.skillName ?? 'Builtin',
      ].join(' \u00b7 ')
    : 'Not configured';

  // Allow enabling even without a skill (slots can use builtin/default prompt)
  const canEnable = true;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-ink-1 text-lg font-semibold">{label}</h2>
            <p className="text-ink-3 mt-1 text-sm">{description}</p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-ink-2 text-xs">{summary}</span>
            {!config && (
              <span className="text-ink-3 bg-glass-medium rounded px-1.5 py-0.5 text-xs">
                Disabled
              </span>
            )}
          </div>
        </div>

        <div className="border-glass-border bg-bg-1 mt-5 rounded-lg border p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-ink-2 text-sm">Backend</label>
                <p className="text-ink-3 mt-0.5 text-xs">
                  Backend and model used for this generation slot.
                </p>
              </div>
              <div className="shrink-0">
                <BackendModelPresetPicker
                  backend={localBackend}
                  model={localModel}
                  selectedPresetId={localPresetId}
                  enabledBackends={enabledBackends.map((b) => b.value)}
                  onChange={(selection) => {
                    setLocalBackend(selection.backend);
                    setLocalModel(selection.model);
                    setLocalPresetId(selection.presetId);
                    setLocalSkillName(null);
                  }}
                />
              </div>
            </div>

            <div className="border-glass-border border-t" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-ink-2 text-sm">Skill</label>
                <p className="text-ink-3 mt-0.5 text-xs">
                  Optional skill prompt applied before generation.
                </p>
              </div>
              <div className="shrink-0">
                <Select
                  value={localSkillName ?? NO_SKILL_VALUE}
                  options={skillOptions}
                  onChange={(v) =>
                    setLocalSkillName(v === NO_SKILL_VALUE ? null : v)
                  }
                  label="Skill"
                />
              </div>
            </div>

            <div className="border-glass-border border-t" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-ink-2 text-sm">Enabled</label>
                <p className="text-ink-3 mt-0.5 text-xs">
                  Disabled slots skip AI generation for this feature.
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onChange={handleToggleEnabled}
                disabled={!canEnable && !isEnabled}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end">
            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                className="text-ink-2 hover:text-ink-1 hover:bg-glass-medium cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-acc text-ink-0 hover:bg-acc cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
