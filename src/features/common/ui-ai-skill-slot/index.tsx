import { useCallback, useEffect, useMemo, useState } from 'react';

import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useManagedSkills } from '@/hooks/use-managed-skills';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  AiSkillSlotConfig,
  AiSkillSlotKey,
  ThinkingEffort,
} from '@shared/types';

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
  {
    key: 'verification-note',
    label: 'Verification Note',
    description:
      'Generate named work item verification checklists from selected work items and test cases',
  },
  {
    key: 'project-summary',
    label: 'Project Summary',
    description:
      'Generate short project summaries used as context for project logo generation',
  },
  {
    key: 'project-feature-map',
    label: 'Project Feature Map',
    description:
      'Map project features for selectable context in the new task overlay',
  },
];

export function SlotDetail({
  label,
  description,
  config,
  enabledBackends,
  onUpdate,
  projectPath,
  fallbackBackend = 'claude-code',
  fallbackModel = DEFAULT_CLAUDE_CODE_MODEL,
  emptySummary = 'Not configured',
  emptyBadgeLabel = 'Disabled',
  toggleLabel = 'Enabled',
  toggleDescription = 'Disabled slots skip AI generation for this feature.',
}: {
  label: string;
  description: string;
  config: AiSkillSlotConfig | null;
  enabledBackends: { value: AgentBackendType; label: string }[];
  onUpdate: (config: AiSkillSlotConfig | null) => void;
  projectPath?: string;
  fallbackBackend?: AgentBackendType;
  fallbackModel?: string;
  emptySummary?: string;
  emptyBadgeLabel?: string;
  toggleLabel?: string;
  toggleDescription?: string;
}) {
  const isEnabled = config !== null;

  // Local editing state
  const [localBackend, setLocalBackend] = useState<AgentBackendType>(
    config?.backend ?? fallbackBackend,
  );
  const [localModel, setLocalModel] = useState(config?.model ?? fallbackModel);
  const [localThinkingEffort, setLocalThinkingEffort] =
    useState<ThinkingEffort>(config?.thinkingEffort ?? 'default');
  const [localPresetId, setLocalPresetId] = useState<string | null>(null);
  const [localSkillName, setLocalSkillName] = useState<string | null>(
    config?.skillName ?? null,
  );

  // Sync local state when external config changes (e.g., query refetch)
  useEffect(() => {
    setLocalBackend(config?.backend ?? fallbackBackend);
    setLocalModel(config?.model ?? fallbackModel);
    setLocalThinkingEffort(config?.thinkingEffort ?? 'default');
    setLocalPresetId(null);
    setLocalSkillName(config?.skillName ?? null);
  }, [config, fallbackBackend, fallbackModel]);

  // Skills for the selected backend (enabled or builtin)
  const { data: skills } = useManagedSkills(localBackend, projectPath);
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

  const saveLocalConfig = useCallback(() => {
    onUpdate({
      backend: localBackend,
      model: localModel,
      thinkingEffort: localThinkingEffort,
      skillName: localSkillName,
    });
  }, [localBackend, localModel, localThinkingEffort, localSkillName, onUpdate]);

  const hasChanges =
    config !== null &&
    (localBackend !== config.backend ||
      localModel !== config.model ||
      localThinkingEffort !== (config.thinkingEffort ?? 'default') ||
      localSkillName !== (config.skillName ?? null));

  useEffect(() => {
    if (!hasChanges) return;

    const saveTimeout = window.setTimeout(saveLocalConfig, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [hasChanges, saveLocalConfig]);

  const handleToggleEnabled = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Enable: save current local config (only possible when skill is selected)
        onUpdate({
          backend: localBackend,
          model: localModel,
          thinkingEffort: localThinkingEffort,
          skillName: localSkillName,
        });
      } else {
        // Disable: clear config
        onUpdate(null);
      }
    },
    [localBackend, localModel, localThinkingEffort, localSkillName, onUpdate],
  );

  // Build summary string
  const summary = config
    ? [
        enabledBackends.find((b) => b.value === config.backend)?.label ??
          config.backend,
        config.model,
        config.thinkingEffort && config.thinkingEffort !== 'default'
          ? config.thinkingEffort
          : null,
        config.skillName ?? 'Builtin',
      ]
        .filter(Boolean)
        .join(' \u00b7 ')
    : emptySummary;

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
                {emptyBadgeLabel}
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
                    const backendChanged = selection.backend !== localBackend;
                    setLocalBackend(selection.backend);
                    setLocalModel(selection.model);
                    setLocalPresetId(selection.presetId);
                    if (backendChanged) {
                      setLocalSkillName(null);
                    }
                  }}
                />
              </div>
            </div>

            <div className="border-glass-border border-t" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-ink-2 text-sm">Thinking</label>
                <p className="text-ink-3 mt-0.5 text-xs">
                  Optional thinking level for compatible models.
                </p>
              </div>
              <div className="shrink-0">
                <ThinkingSelector
                  value={localThinkingEffort}
                  onChange={setLocalThinkingEffort}
                  size="sm"
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
                <label className="text-ink-2 text-sm">{toggleLabel}</label>
                <p className="text-ink-3 mt-0.5 text-xs">{toggleDescription}</p>
              </div>
              <Switch
                checked={isEnabled}
                onChange={handleToggleEnabled}
                disabled={!canEnable && !isEnabled}
              />
            </div>
          </div>
          {hasChanges && (
            <div className="text-ink-3 mt-4 text-right text-xs">
              Changes save automatically
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
